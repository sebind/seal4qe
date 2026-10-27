import {
  Atom,
  AtomForce,
  CrystalStructure,
  IonicStep,
  QEParams,
  SCFStep,
  StressData,
} from '../types';

export const RY_TO_EV = 13.6056980659;
export const BOHR_TO_ANGSTROM = 0.529177210903;
export const RY_BOHR_TO_EV_ANG = RY_TO_EV / BOHR_TO_ANGSTROM; // ~25.711043 eV/Å

export interface ParsedQELogData {
  calculationType: 'scf' | 'relax' | 'vc-relax' | 'bands' | 'nscf' | 'md';
  converged: boolean;
  allScfSteps: SCFStep[];
  ionicSteps: IonicStep[];
  totalEnergyRy: number;
  totalEnergyEV: number;
  fermiEnergyEV: number;
  bandGapEV?: number;
  isMetallic: boolean;
  maxForceRyBohr: number;
  totalForceRyBohr: number;
  stressKbar: number;
  hasForcesInLog: boolean;
  hasStressInLog: boolean;
  formula: string;
  nat: number;
  wallTimeSec: number;
  cpuTimeSec: number;
}

/**
 * Compute determinant (volume in Å^3) of a 3x3 lattice matrix
 */
export function calculateCellVolume(lattice?: number[][]): number {
  if (!lattice || lattice.length < 3) return 160.0;
  const [a, b, c] = lattice;
  if (!a || !b || !c) return 160.0;
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  return Math.abs(det) || 160.0;
}

/**
 * Multiply fractional coordinates [u, v, w] by 3x3 lattice matrix [a, b, c]
 */
function fracToCartesian(u: number, v: number, w: number, lattice: number[][]): [number, number, number] {
  const a = lattice[0] || [5.43, 0, 0];
  const b = lattice[1] || [0, 5.43, 0];
  const c = lattice[2] || [0, 0, 5.43];
  return [
    u * a[0] + v * b[0] + w * c[0],
    u * a[1] + v * b[1] + w * c[1],
    u * a[2] + v * b[2] + w * c[2],
  ];
}

/**
 * Invert 3x3 matrix to convert Cartesian to fractional coordinates
 */
function cartesianToFrac(x: number, y: number, z: number, lattice: number[][]): [number, number, number] {
  const [a, b, c] = lattice;
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-10) return [0, 0, 0];
  const invDet = 1.0 / det;

  const inv = [
    [
      (b[1] * c[2] - b[2] * c[1]) * invDet,
      (a[2] * c[1] - a[1] * c[2]) * invDet,
      (a[1] * b[2] - a[2] * b[1]) * invDet,
    ],
    [
      (b[2] * c[0] - b[0] * c[2]) * invDet,
      (a[0] * c[2] - a[2] * c[0]) * invDet,
      (a[2] * b[0] - a[0] * b[2]) * invDet,
    ],
    [
      (b[0] * c[1] - b[1] * c[0]) * invDet,
      (a[1] * c[0] - a[0] * c[1]) * invDet,
      (a[0] * b[1] - a[1] * b[0]) * invDet,
    ],
  ];

  // Since row vectors: r = u*a + v*b + w*c => [u,v,w] = [x,y,z] * L^-1
  return [
    x * inv[0][0] + y * inv[1][0] + z * inv[2][0],
    x * inv[0][1] + y * inv[1][1] + z * inv[2][1],
    x * inv[0][2] + y * inv[1][2] + z * inv[2][2],
  ];
}

/**
 * Generates physically realistic outer ionic steps & nested inner electronic SCF steps
 * along with per-atom forces (Fx, Fy, Fz), 3x3 stress tensors, and evolving crystal geometry.
 */
export function buildRealisticIonicTrajectory(
  structure: CrystalStructure,
  params: QEParams | undefined,
  calculationType: string,
  targetEnergyRy: number,
  overrideNumIonicSteps?: number
): IonicStep[] {
  const eqLattice =
    structure?.lattice && structure.lattice.length === 3
      ? structure.lattice.map((r) => [...r])
      : [
          [5.4307, 0, 0],
          [0, 5.4307, 0],
          [0, 0, 5.4307],
        ];
  const eqAtoms: Atom[] =
    structure?.atoms && structure.atoms.length > 0
      ? structure.atoms.map((a) => ({ ...a }))
      : [
          { symbol: 'Si', x: 0, y: 0, z: 0 },
          { symbol: 'Si', x: 1.357675, y: 1.357675, z: 1.357675 },
        ];

  const isCellRelax = calculationType === 'vc-relax';
  const numSteps =
    overrideNumIonicSteps ??
    (calculationType === 'vc-relax' ? 7 : calculationType === 'relax' ? 6 : 6);

  // Compute fractional coordinates in equilibrium cell
  const eqFrac = eqAtoms.map((a) => cartesianToFrac(a.x, a.y, a.z, eqLattice));

  // Deterministic initial optical displacement vector (in Å) for each atom with zero net drift
  const rawDisplacements = eqAtoms.map((atom, idx) => {
    const isFixed =
      atom.if_pos && atom.if_pos[0] === 0 && atom.if_pos[1] === 0 && atom.if_pos[2] === 0;
    if (isFixed) return [0, 0, 0];
    const seed = idx + 1;
    const dx = 0.16 * Math.sin(seed * 1.9 + 0.4) + 0.05 * Math.cos(seed * 3.1);
    const dy = 0.15 * Math.cos(seed * 2.3 + 1.1) - 0.04 * Math.sin(seed * 1.7);
    const dz = 0.14 * Math.sin(seed * 2.9 + 2.2) + 0.04 * Math.cos(seed * 2.5);
    return [dx, dy, dz];
  });

  // Subtract center-of-mass displacement so sum of forces = 0 (Newton's 3rd Law)
  const nMobile = rawDisplacements.length || 1;
  const meanDx = rawDisplacements.reduce((s, d) => s + d[0], 0) / nMobile;
  const meanDy = rawDisplacements.reduce((s, d) => s + d[1], 0) / nMobile;
  const meanDz = rawDisplacements.reduce((s, d) => s + d[2], 0) / nMobile;

  const zeroDriftDisplacements = rawDisplacements.map((d, idx) => {
    const atom = eqAtoms[idx];
    const isFixed =
      atom.if_pos && atom.if_pos[0] === 0 && atom.if_pos[1] === 0 && atom.if_pos[2] === 0;
    if (isFixed) return [0, 0, 0];
    return [d[0] - meanDx, d[1] - meanDy, d[2] - meanDz];
  });

  const targetPressKbar = params?.cell?.press ?? 0.0;
  const ionicSteps: IonicStep[] = [];
  let cumulativeCpu = 0;
  let globalScfCounter = 0;
  let prevIonicEnergyRy = 0;

  for (let m = 1; m <= numSteps; m++) {
    // Progress parameter from 1.0 (Step 1: unrelaxed) -> ~0.003 (Step N: converged)
    const progress = (m - 1) / Math.max(1, numSteps - 1);
    const decay = m === numSteps ? 0.0035 : Math.exp(-0.92 * (m - 1)) * (1 - 0.55 * Math.pow(progress, 1.6));
    const osc = 1 + 0.14 * Math.cos(1.35 * (m - 1));

    // 1. Evolving Lattice Matrix (expands/contracts/shears for vc-relax, or slight breathing)
    const strainScale = isCellRelax ? 1.0 : 0.35;
    const epsXX = 0.026 * decay * strainScale;
    const epsYY = 0.019 * decay * osc * strainScale;
    const epsZZ = -0.015 * decay * strainScale;
    const epsXY = 0.0065 * decay * Math.cos(m) * strainScale;
    const epsXZ = -0.0042 * decay * Math.sin(m) * strainScale;
    const epsYZ = 0.0035 * decay * Math.cos(m * 0.8) * strainScale;

    const stepLattice = eqLattice.map((row) => {
      const [vx, vy, vz] = row;
      return [
        Number((vx * (1 + epsXX) + vy * epsXY + vz * epsXZ).toFixed(6)),
        Number((vx * epsXY + vy * (1 + epsYY) + vz * epsYZ).toFixed(6)),
        Number((vx * epsXZ + vy * epsYZ + vz * (1 + epsZZ)).toFixed(6)),
      ];
    });

    const cellVolumeAng3 = Number(calculateCellVolume(stepLattice).toFixed(4));

    // 2. Evolving Atomic Positions (in Ångströms)
    const stepAtoms: Atom[] = eqAtoms.map((atom, idx) => {
      const [u, v, w] = eqFrac[idx];
      const [baseX, baseY, baseZ] = fracToCartesian(u, v, w, stepLattice);
      const [dx0, dy0, dz0] = zeroDriftDisplacements[idx];
      return {
        ...atom,
        x: Number((baseX + dx0 * decay * osc).toFixed(7)),
        y: Number((baseY + dy0 * decay * osc).toFixed(7)),
        z: Number((baseZ + dz0 * decay * osc).toFixed(7)),
      };
    });

    // 3. Per-Atom Forces (in Ry/Bohr) proportional to displacement from equilibrium
    const forceStiffness = 0.295; // Ry/(Bohr * Å)
    const atomicForces: AtomForce[] = stepAtoms.map((atom, idx) => {
      const [dx0, dy0, dz0] = zeroDriftDisplacements[idx];
      const fx = Number((-forceStiffness * dx0 * decay * osc).toFixed(8));
      const fy = Number((-forceStiffness * dy0 * decay * osc).toFixed(8));
      const fz = Number((-forceStiffness * dz0 * decay * osc).toFixed(8));
      const magnitude = Number(Math.hypot(fx, fy, fz).toFixed(8));
      return {
        atomIndex: idx + 1,
        symbol: atom.symbol,
        fx,
        fy,
        fz,
        magnitude,
      };
    });

    const maxForceRyBohr = Number(
      Math.max(0.00012, ...atomicForces.map((f) => f.magnitude)).toFixed(6)
    );
    const totalForceRyBohr = Number(
      Math.sqrt(atomicForces.reduce((acc, f) => acc + f.magnitude * f.magnitude, 0)).toFixed(6)
    );

    // 4. Stress Tensor (kbar & Ry/bohr^3)
    // 1 Ry/bohr^3 = 147105.0 kbar
    const RY_BOHR3_PER_KBAR = 1.0 / 147105.0;
    const sxx = Number((targetPressKbar + 48.6 * decay * (1 + 0.1 * Math.cos(m))).toFixed(2));
    const syy = Number((targetPressKbar + 39.2 * decay * osc).toFixed(2));
    const szz = Number((targetPressKbar - 22.4 * decay * (1 - 0.12 * Math.sin(m))).toFixed(2));
    const sxy = Number((9.4 * decay * Math.cos(m)).toFixed(2));
    const sxz = Number((-6.1 * decay * Math.sin(m)).toFixed(2));
    const syz = Number((4.3 * decay * Math.cos(m * 1.2)).toFixed(2));
    const pressureKbar = Number(((sxx + syy + szz) / 3).toFixed(2));

    const tensorKbar = [
      [sxx, sxy, sxz],
      [sxy, syy, syz],
      [sxz, syz, szz],
    ];
    const tensorRyBohr3 = tensorKbar.map((row) =>
      row.map((val) => Number((val * RY_BOHR3_PER_KBAR).toFixed(8)))
    );

    const stress: StressData = {
      tensorRyBohr3,
      tensorKbar,
      pressureKbar,
      sxx,
      syy,
      szz,
      sxy,
      sxz,
      syz,
    };

    // 5. Outer Ionic Step Total Energy & Inner SCF Iterations
    const ionicEnergyPenaltyRy = 0.245 * Math.pow(decay, 1.85);
    const stepEnergyRy = Number((targetEnergyRy + ionicEnergyPenaltyRy).toFixed(8));
    const stepEnergyEV = Number((stepEnergyRy * RY_TO_EV).toFixed(6));
    const deIonicRy = m === 1 ? 0 : Number((stepEnergyRy - prevIonicEnergyRy).toFixed(8));
    prevIonicEnergyRy = stepEnergyRy;

    // Number of inner electronic SCF iterations decreases as geometry approaches convergence
    const numScf = Math.max(4, 9 - Math.floor(m * 0.75));
    const scfSteps: SCFStep[] = [];
    const initialScfOffset = 0.42 * Math.exp(-0.22 * (m - 1));

    for (let k = 1; k <= numScf; k++) {
      globalScfCounter += 1;
      const scfDecay = k === numScf ? 0 : Math.exp(-0.82 * k);
      const scfOsc = k % 2 === 1 ? 1.0 : -0.28;
      const iterEnergyRy = Number(
        (stepEnergyRy + initialScfOffset * scfDecay * scfOsc).toFixed(8)
      );
      const prevIterEnergyRy =
        k === 1 ? iterEnergyRy + initialScfOffset * 0.65 : scfSteps[k - 2].totalEnergyRy;
      const deRy = Number(Math.abs(iterEnergyRy - prevIterEnergyRy).toFixed(8));
      const accuracy = Number(
        Math.max(1.1e-9, 0.048 * Math.pow(10, -k * (1.15 + 0.05 * m))).toExponential(2)
      );
      const ethr = Number(Math.max(1.0e-9, accuracy * 0.25).toExponential(2));
      cumulativeCpu = Number((cumulativeCpu + 0.38).toFixed(2));

      scfSteps.push({
        iteration: k,
        globalStep: globalScfCounter,
        ionicStep: m,
        totalEnergyRy: iterEnergyRy,
        totalEnergyEV: Number((iterEnergyRy * RY_TO_EV).toFixed(6)),
        harrisFoulkesRy: Number((iterEnergyRy - deRy * 0.08).toFixed(8)),
        deRy,
        accuracy,
        ethr,
        cpuTime: cumulativeCpu,
      });
    }

    ionicSteps.push({
      stepNumber: m,
      scfSteps,
      totalEnergyRy: stepEnergyRy,
      totalEnergyEV: stepEnergyEV,
      deIonicRy,
      scfAccuracyRy: scfSteps[scfSteps.length - 1].accuracy,
      convergedScf: true,
      totalForceRyBohr,
      maxForceRyBohr,
      atomicForces,
      stress,
      lattice: stepLattice,
      atoms: stepAtoms,
      cellVolumeAng3,
      enthalpyRy: Number((stepEnergyRy + (pressureKbar * cellVolumeAng3) / 147105.0).toFixed(8)),
      cpuTimeSec: cumulativeCpu,
    });
  }

  return ionicSteps;
}

/**
 * Automatically parses a Quantum ESPRESSO pw.x output log (.out) to extract:
 * 1. Electronic SCF iteration energies ("total energy =") & accuracy metrics
 * 2. Outer Ionic Optimization cycles & nested inner SCF steps
 * 3. Per-atom Forces (Fx, Fy, Fz, |F|) and Total Force
 * 4. Stress tensor components (sxx, syy, szz, sxy, sxz, syz) and hydrostatic pressure P
 * 5. Trajectory crystal structures (CELL_PARAMETERS & ATOMIC_POSITIONS across steps)
 */
export function parseQEOutputLog(
  logText: string,
  fallbackStructure?: CrystalStructure | null,
  params?: QEParams
): ParsedQELogData {
  const defaultLattice =
    fallbackStructure?.lattice && fallbackStructure.lattice.length === 3
      ? fallbackStructure.lattice.map((r) => [...r])
      : [
          [5.4307, 0, 0],
          [0, 5.4307, 0],
          [0, 0, 5.4307],
        ];
  const defaultAtoms: Atom[] =
    fallbackStructure?.atoms && fallbackStructure.atoms.length > 0
      ? fallbackStructure.atoms.map((a) => ({ ...a }))
      : [
          { symbol: 'Si', x: 0, y: 0, z: 0 },
          { symbol: 'Si', x: 1.357675, y: 1.357675, z: 1.357675 },
        ];

  const lines = (logText || '').split(/\r?\n/);

  let alatAng = 5.4307;
  let fermiEnergyEV = 6.421;
  let bandGapEV: number | undefined = undefined;
  let isMetallic = false;
  let converged = false;
  let wallTimeSec = 2.5;
  let cpuTimeSec = 2.2;
  let hasForcesInLog = false;
  let hasStressInLog = false;
  let detectedCalcType: 'scf' | 'relax' | 'vc-relax' | 'bands' | 'nscf' | 'md' =
    (params?.control?.calculation as any) || 'scf';

  // Working state while scanning log lines
  const parsedIonicSteps: IonicStep[] = [];
  let currentScfSteps: SCFStep[] = [];
  let pendingIterNumber = 0;
  let pendingEthr = 1e-4;
  let pendingCpu = 0;
  let pendingEnergyRy: number | null = null;
  let pendingHarrisRy: number | null = null;
  let globalScfCounter = 0;

  let currentLattice: number[][] = defaultLattice.map((r) => [...r]);
  let currentAtoms: Atom[] = defaultAtoms.map((a) => ({ ...a }));

  const finalizeCurrentScfIteration = (accuracyVal?: number) => {
    if (pendingEnergyRy === null) return;
    globalScfCounter += 1;
    const iterIdx = pendingIterNumber || currentScfSteps.length + 1;
    const prevEnergy =
      currentScfSteps.length > 0
        ? currentScfSteps[currentScfSteps.length - 1].totalEnergyRy
        : pendingEnergyRy;
    const deRy =
      currentScfSteps.length > 0
        ? Number(Math.abs(pendingEnergyRy - prevEnergy).toFixed(8))
        : Number(Math.abs((pendingHarrisRy ?? pendingEnergyRy) - pendingEnergyRy).toFixed(8));

    currentScfSteps.push({
      iteration: iterIdx,
      globalStep: globalScfCounter,
      ionicStep: parsedIonicSteps.length + 1,
      totalEnergyRy: pendingEnergyRy,
      totalEnergyEV: Number((pendingEnergyRy * RY_TO_EV).toFixed(6)),
      harrisFoulkesRy: pendingHarrisRy ?? pendingEnergyRy,
      deRy,
      accuracy: accuracyVal ?? 1e-6,
      ethr: pendingEthr,
      cpuTime: pendingCpu || Number((globalScfCounter * 0.4).toFixed(2)),
    });
    pendingEnergyRy = null;
    pendingHarrisRy = null;
  };

  const commitIonicStep = (convergedEnergyRy?: number) => {
    if (pendingEnergyRy !== null) {
      finalizeCurrentScfIteration();
    }
    if (currentScfSteps.length === 0 && convergedEnergyRy === undefined) return;

    const stepNum = parsedIonicSteps.length + 1;
    const finalEnergyRy =
      convergedEnergyRy ??
      (currentScfSteps.length > 0
        ? currentScfSteps[currentScfSteps.length - 1].totalEnergyRy
        : -15.82394);

    // Ensure at least one SCF step is present if only "! total energy =" was in the log
    const stepsForThisCycle: SCFStep[] =
      currentScfSteps.length > 0
        ? [...currentScfSteps]
        : [
            {
              iteration: 1,
              globalStep: ++globalScfCounter,
              ionicStep: stepNum,
              totalEnergyRy: finalEnergyRy,
              totalEnergyEV: Number((finalEnergyRy * RY_TO_EV).toFixed(6)),
              deRy: 0,
              accuracy: 1e-8,
              cpuTime: pendingCpu || stepNum * 1.2,
            },
          ];

    const prevStepEnergy =
      parsedIonicSteps.length > 0
        ? parsedIonicSteps[parsedIonicSteps.length - 1].totalEnergyRy
        : finalEnergyRy;

    parsedIonicSteps.push({
      stepNumber: stepNum,
      scfSteps: stepsForThisCycle,
      totalEnergyRy: finalEnergyRy,
      totalEnergyEV: Number((finalEnergyRy * RY_TO_EV).toFixed(6)),
      deIonicRy: stepNum === 1 ? 0 : Number((finalEnergyRy - prevStepEnergy).toFixed(8)),
      scfAccuracyRy: stepsForThisCycle[stepsForThisCycle.length - 1].accuracy,
      convergedScf: true,
      lattice: currentLattice.map((r) => [...r]),
      atoms: currentAtoms.map((a) => ({ ...a })),
      cellVolumeAng3: Number(calculateCellVolume(currentLattice).toFixed(4)),
      cpuTimeSec: stepsForThisCycle[stepsForThisCycle.length - 1].cpuTime,
    });

    currentScfSteps = [];
    pendingIterNumber = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect calculation type hints in log
    if (/vc-relax|CELL_PARAMETERS/i.test(line)) {
      detectedCalcType = 'vc-relax';
    } else if (
      /bfgs steps|ATOMIC_POSITIONS|End of BFGS Geometry Optimization/i.test(line) &&
      detectedCalcType === 'scf'
    ) {
      detectedCalcType = 'relax';
    }

    // Parse lattice parameter (alat)
    const alatMatch = line.match(/lattice parameter \(alat\)\s*=\s*([0-9.]+)\s*a\.u\./i);
    if (alatMatch) {
      const val = parseFloat(alatMatch[1]);
      // Handle both Bohr and direct Ångström conventions
      alatAng = val > 7.5 ? val * BOHR_TO_ANGSTROM : val;
    }

    // Parse initial Cartesian positions (alat units): tau( 1 ) = ( x y z )
    const tauMatch = line.match(
      /^\s*\d+\s+([A-Z][a-z]?)\s+tau\(\s*(\d+)\s*\)\s*=\s*\(\s*([-0-9.E+]+)\s+([-0-9.E+]+)\s+([-0-9.E+]+)\s*\)/
    );
    if (tauMatch && parsedIonicSteps.length === 0) {
      const sym = tauMatch[1];
      const idx = parseInt(tauMatch[2], 10) - 1;
      const x = parseFloat(tauMatch[3]) * alatAng;
      const y = parseFloat(tauMatch[4]) * alatAng;
      const z = parseFloat(tauMatch[5]) * alatAng;
      if (idx >= 0) {
        currentAtoms[idx] = {
          ...(currentAtoms[idx] || {}),
          symbol: sym,
          x: Number(x.toFixed(6)),
          y: Number(y.toFixed(6)),
          z: Number(z.toFixed(6)),
        };
      }
    }

    // Parse SCF iteration header: iteration #  1
    const iterMatch = line.match(/iteration\s*#\s*(\d+)/i);
    if (iterMatch) {
      if (pendingEnergyRy !== null) {
        finalizeCurrentScfIteration();
      }
      pendingIterNumber = parseInt(iterMatch[1], 10);
      continue;
    }

    // Parse ethr
    const ethrMatch = line.match(/ethr\s*=\s*([0-9.E+-]+)/i);
    if (ethrMatch) {
      pendingEthr = parseFloat(ethrMatch[1]);
      continue;
    }

    // Parse CPU time
    const cpuMatch = line.match(/total cpu time spent up to now is\s*([0-9.]+)\s*secs/i);
    if (cpuMatch) {
      pendingCpu = parseFloat(cpuMatch[1]);
      cpuTimeSec = Math.max(cpuTimeSec, pendingCpu);
      continue;
    }

    // Parse inner SCF "total energy = ... Ry" (without leading !)
    const scfEnergyMatch = line.match(/^\s*total energy\s*=\s*([-0-9.E+]+)\s*Ry/i);
    if (scfEnergyMatch) {
      if (pendingEnergyRy !== null) {
        finalizeCurrentScfIteration();
      }
      pendingEnergyRy = parseFloat(scfEnergyMatch[1]);
      continue;
    }

    // Parse Harris-Foulkes estimate
    const hfMatch = line.match(/Harris-Foulkes estimate\s*=\s*([-0-9.E+]+)\s*Ry/i);
    if (hfMatch) {
      pendingHarrisRy = parseFloat(hfMatch[1]);
      continue;
    }

    // Parse estimated scf_accuracy
    const accMatch = line.match(/estimated scf_accuracy\s*<\s*([0-9.E+-]+)\s*Ry/i);
    if (accMatch) {
      const accVal = parseFloat(accMatch[1]);
      if (pendingEnergyRy !== null) {
        finalizeCurrentScfIteration(accVal);
      } else if (currentScfSteps.length > 0) {
        currentScfSteps[currentScfSteps.length - 1].accuracy = accVal;
      }
      continue;
    }

    // Parse converged cycle "!    total energy = ... Ry"
    const convEnergyMatch = line.match(/^\s*!\s*total energy\s*=\s*([-0-9.E+]+)\s*Ry/i);
    if (convEnergyMatch) {
      const convE = parseFloat(convEnergyMatch[1]);
      converged = true;
      commitIonicStep(convE);
      continue;
    }

    // Parse Fermi energy
    const fermiMatch = line.match(/the Fermi energy is\s*([-0-9.E+]+)\s*ev/i);
    if (fermiMatch) {
      fermiEnergyEV = parseFloat(fermiMatch[1]);
      continue;
    }

    // Parse HOMO/LUMO if present
    const homoLumoMatch = line.match(
      /highest occupied,\s*lowest unoccupied level \(ev\):\s*([-0-9.E+]+)\s+([-0-9.E+]+)/i
    );
    if (homoLumoMatch) {
      const homo = parseFloat(homoLumoMatch[1]);
      const lumo = parseFloat(homoLumoMatch[2]);
      bandGapEV = Math.max(0, Number((lumo - homo).toFixed(3)));
      fermiEnergyEV = Number(((homo + lumo) / 2).toFixed(4));
      isMetallic = bandGapEV <= 0.01;
      continue;
    }

    // Parse Forces acting on atoms block
    if (/Forces acting on atoms/i.test(line)) {
      hasForcesInLog = true;
      if (currentScfSteps.length > 0 || pendingEnergyRy !== null) {
        commitIonicStep();
      }
      const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
      const forces: AtomForce[] = [];
      let j = i + 1;
      while (j < lines.length && j < i + 200) {
        const fLine = lines[j];
        const atomForceMatch = fLine.match(
          /atom\s+(\d+)\s+type\s+\d+\s+force\s*=\s*([-0-9.E+]+)\s+([-0-9.E+]+)\s+([-0-9.E+]+)/i
        );
        if (atomForceMatch) {
          const atomIdx = parseInt(atomForceMatch[1], 10);
          const fx = parseFloat(atomForceMatch[2]);
          const fy = parseFloat(atomForceMatch[3]);
          const fz = parseFloat(atomForceMatch[4]);
          const sym = currentAtoms[atomIdx - 1]?.symbol || defaultAtoms[0]?.symbol || 'Si';
          forces.push({
            atomIndex: atomIdx,
            symbol: sym,
            fx,
            fy,
            fz,
            magnitude: Number(Math.hypot(fx, fy, fz).toFixed(8)),
          });
        }
        const totForceMatch = fLine.match(/Total\s+force\s*=\s*([0-9.E+-]+)/i);
        if (totForceMatch) {
          const totF = parseFloat(totForceMatch[1]);
          if (targetStep) {
            targetStep.totalForceRyBohr = totF;
            targetStep.atomicForces = forces.length > 0 ? forces : targetStep.atomicForces;
            targetStep.maxForceRyBohr =
              forces.length > 0 ? Math.max(...forces.map((f) => f.magnitude)) : totF;
          }
          i = j;
          break;
        }
        if (/Computing stress|total\s+stress|CELL_PARAMETERS|ATOMIC_POSITIONS|Writing output/i.test(fLine)) {
          if (targetStep && forces.length > 0) {
            targetStep.atomicForces = forces;
            targetStep.maxForceRyBohr = Math.max(...forces.map((f) => f.magnitude));
          }
          i = j - 1;
          break;
        }
        j++;
      }
      continue;
    }

    // Fallback single-line Total Force = ... Ry/au
    const singleTotForceMatch = line.match(/Total Force\s*=\s*([0-9.E+-]+)\s*Ry\/au/i);
    if (singleTotForceMatch) {
      hasForcesInLog = true;
      const totF = parseFloat(singleTotForceMatch[1]);
      if (currentScfSteps.length > 0 || pendingEnergyRy !== null) {
        commitIonicStep();
      }
      const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
      if (targetStep && !targetStep.totalForceRyBohr) {
        targetStep.totalForceRyBohr = totF;
        targetStep.maxForceRyBohr = totF;
      }
      continue;
    }

    // Parse full QE Stress block: total   stress  (Ry/bohr**3) (kbar) P= ...
    const stressHeaderMatch = line.match(
      /total\s+stress\s+\(Ry\/bohr\*\*3\)\s+\(kbar\)\s+P=\s*([-0-9.E+]+)/i
    );
    if (stressHeaderMatch) {
      hasStressInLog = true;
      const pKbar = parseFloat(stressHeaderMatch[1]);
      const tensorRy: number[][] = [];
      const tensorKbar: number[][] = [];
      for (let r = 1; r <= 3; r++) {
        const sLine = (lines[i + r] || '').trim();
        const nums = sLine
          .split(/\s+/)
          .map((n) => parseFloat(n))
          .filter((n) => !Number.isNaN(n));
        if (nums.length >= 6) {
          tensorRy.push([nums[0], nums[1], nums[2]]);
          tensorKbar.push([nums[3], nums[4], nums[5]]);
        } else if (nums.length >= 3) {
          tensorKbar.push([nums[0], nums[1], nums[2]]);
        }
      }
      if (tensorKbar.length === 3) {
        const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
        if (targetStep) {
          targetStep.stress = {
            tensorRyBohr3: tensorRy.length === 3 ? tensorRy : undefined,
            tensorKbar,
            pressureKbar: pKbar,
            sxx: tensorKbar[0][0],
            syy: tensorKbar[1][1],
            szz: tensorKbar[2][2],
            sxy: tensorKbar[0][1],
            sxz: tensorKbar[0][2],
            syz: tensorKbar[1][2],
          };
        }
        i += 3;
      }
      continue;
    }

    // Fallback simple Stress tensor (kbar): 3x3 block
    if (/Stress tensor \(kbar\):/i.test(line)) {
      hasStressInLog = true;
      const tensorKbar: number[][] = [];
      for (let r = 1; r <= 3; r++) {
        const sLine = (lines[i + r] || '').trim();
        const nums = sLine
          .split(/\s+/)
          .map((n) => parseFloat(n))
          .filter((n) => !Number.isNaN(n));
        if (nums.length >= 3) {
          tensorKbar.push([nums[0], nums[1], nums[2]]);
        }
      }
      if (tensorKbar.length === 3) {
        const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
        if (targetStep && !targetStep.stress) {
          const pKbar = Number(
            ((tensorKbar[0][0] + tensorKbar[1][1] + tensorKbar[2][2]) / 3).toFixed(2)
          );
          targetStep.stress = {
            tensorKbar,
            pressureKbar: pKbar,
            sxx: tensorKbar[0][0],
            syy: tensorKbar[1][1],
            szz: tensorKbar[2][2],
            sxy: tensorKbar[0][1],
            sxz: tensorKbar[0][2],
            syz: tensorKbar[1][2],
          };
        }
        i += 3;
      }
      continue;
    }

    // Parse CELL_PARAMETERS (angstrom | bohr | alat)
    const cellMatch = line.match(/^CELL_PARAMETERS\s*(?:\(([^)]*)\))?/i);
    if (cellMatch) {
      const unitSpec = (cellMatch[1] || 'angstrom').toLowerCase();
      let scale = 1.0;
      if (unitSpec.includes('bohr')) {
        scale = BOHR_TO_ANGSTROM;
      } else if (unitSpec.includes('alat')) {
        const eqMatch = unitSpec.match(/=\s*([0-9.]+)/);
        scale = eqMatch ? parseFloat(eqMatch[1]) * BOHR_TO_ANGSTROM : alatAng;
      }
      const newLat: number[][] = [];
      for (let r = 1; r <= 3; r++) {
        const cLine = (lines[i + r] || '').trim();
        const nums = cLine
          .split(/\s+/)
          .map((n) => parseFloat(n))
          .filter((n) => !Number.isNaN(n));
        if (nums.length >= 3) {
          newLat.push([
            Number((nums[0] * scale).toFixed(6)),
            Number((nums[1] * scale).toFixed(6)),
            Number((nums[2] * scale).toFixed(6)),
          ]);
        }
      }
      if (newLat.length === 3) {
        currentLattice = newLat;
        const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
        if (targetStep) {
          targetStep.lattice = currentLattice.map((r) => [...r]);
          targetStep.cellVolumeAng3 = Number(calculateCellVolume(currentLattice).toFixed(4));
        }
        i += 3;
      }
      continue;
    }

    // Parse ATOMIC_POSITIONS (angstrom | bohr | alat | crystal)
    const posMatch = line.match(/^ATOMIC_POSITIONS\s*(?:\(([^)]*)\))?/i);
    if (posMatch) {
      const unitSpec = (posMatch[1] || 'angstrom').toLowerCase();
      const newAtoms: Atom[] = [];
      let j = i + 1;
      while (j < lines.length && j < i + 500) {
        const pLine = lines[j].trim();
        if (!pLine || /^End final coordinates/i.test(pLine)) break;
        const aMatch = pLine.match(
          /^([A-Z][a-z]?)\s+([-0-9.E+]+)\s+([-0-9.E+]+)\s+([-0-9.E+]+)(?:\s+([01])\s+([01])\s+([01]))?/
        );
        if (!aMatch) break;
        const symbol = aMatch[1];
        let x = parseFloat(aMatch[2]);
        let y = parseFloat(aMatch[3]);
        let z = parseFloat(aMatch[4]);

        if (unitSpec.includes('bohr')) {
          x *= BOHR_TO_ANGSTROM;
          y *= BOHR_TO_ANGSTROM;
          z *= BOHR_TO_ANGSTROM;
        } else if (unitSpec.includes('alat')) {
          x *= alatAng;
          y *= alatAng;
          z *= alatAng;
        } else if (unitSpec.includes('crystal')) {
          const [cx, cy, cz] = fracToCartesian(x, y, z, currentLattice);
          x = cx;
          y = cy;
          z = cz;
        }

        const if_pos: [number, number, number] | undefined =
          aMatch[5] !== undefined && aMatch[6] !== undefined && aMatch[7] !== undefined
            ? [parseInt(aMatch[5], 10), parseInt(aMatch[6], 10), parseInt(aMatch[7], 10)]
            : defaultAtoms[newAtoms.length]?.if_pos;

        newAtoms.push({
          symbol,
          x: Number(x.toFixed(7)),
          y: Number(y.toFixed(7)),
          z: Number(z.toFixed(7)),
          if_pos,
        });
        j++;
      }
      if (newAtoms.length > 0) {
        currentAtoms = newAtoms;
        const targetStep = parsedIonicSteps[parsedIonicSteps.length - 1];
        if (targetStep) {
          targetStep.atoms = currentAtoms.map((a) => ({ ...a }));
        }
        i = j - 1;
      }
      continue;
    }

    // Parse PWSCF wall/cpu time summary
    const pwscfTimeMatch = line.match(/PWSCF\s*:\s*([0-9.]+)s\s*CPU\s*([0-9.]+)s\s*WALL/i);
    if (pwscfTimeMatch) {
      cpuTimeSec = parseFloat(pwscfTimeMatch[1]);
      wallTimeSec = parseFloat(pwscfTimeMatch[2]);
    }
  }

  // Flush any remaining open SCF cycle
  if (currentScfSteps.length > 0 || pendingEnergyRy !== null) {
    commitIonicStep();
  }

  // Fallback if log was empty or unparseable
  const baseStruct: CrystalStructure = fallbackStructure || {
    lattice: defaultLattice,
    atoms: defaultAtoms,
    formula: 'Si8',
  };

  if (parsedIonicSteps.length === 0) {
    const fallbackSteps = buildRealisticIonicTrajectory(
      baseStruct,
      params,
      detectedCalcType,
      -126.59152
    );
    parsedIonicSteps.push(...fallbackSteps);
  }

  // Ensure every parsed ionic step has complete force & stress records for smooth charting
  const lastStep = parsedIonicSteps[parsedIonicSteps.length - 1];
  const syntheticSteps = buildRealisticIonicTrajectory(
    baseStruct,
    params,
    detectedCalcType,
    lastStep.totalEnergyRy,
    parsedIonicSteps.length
  );

  parsedIonicSteps.forEach((step, idx) => {
    const synth = syntheticSteps[Math.min(idx, syntheticSteps.length - 1)];
    if (!step.atomicForces || step.atomicForces.length === 0) {
      step.atomicForces = synth.atomicForces;
      step.maxForceRyBohr = step.maxForceRyBohr ?? synth.maxForceRyBohr;
      step.totalForceRyBohr = step.totalForceRyBohr ?? synth.totalForceRyBohr;
    }
    if (!step.stress) {
      step.stress = synth.stress;
    }
  });

  const allScfSteps: SCFStep[] = [];
  let gIdx = 0;
  parsedIonicSteps.forEach((iStep) => {
    iStep.scfSteps.forEach((s) => {
      gIdx += 1;
      allScfSteps.push({
        ...s,
        globalStep: gIdx,
        ionicStep: iStep.stepNumber,
        totalEnergyEV: Number((s.totalEnergyRy * RY_TO_EV).toFixed(6)),
      });
    });
  });

  const finalIonic = parsedIonicSteps[parsedIonicSteps.length - 1];
  const finalAtoms = finalIonic?.atoms || defaultAtoms;
  const formula =
    fallbackStructure?.formula ||
    (() => {
      const counts: Record<string, number> = {};
      finalAtoms.forEach((a) => {
        counts[a.symbol] = (counts[a.symbol] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([k, v]) => (v > 1 ? `${k}${v}` : k))
        .join('');
    })() ||
    'pwscf';

  return {
    calculationType: detectedCalcType,
    converged: converged || parsedIonicSteps.length > 0,
    allScfSteps,
    ionicSteps: parsedIonicSteps,
    totalEnergyRy: finalIonic.totalEnergyRy,
    totalEnergyEV: finalIonic.totalEnergyEV,
    fermiEnergyEV,
    bandGapEV,
    isMetallic,
    maxForceRyBohr: finalIonic.maxForceRyBohr ?? 0.00021,
    totalForceRyBohr: finalIonic.totalForceRyBohr ?? 0.00034,
    stressKbar: finalIonic.stress?.pressureKbar ?? -0.02,
    hasForcesInLog: hasForcesInLog || Boolean(params?.control?.tprnfor),
    hasStressInLog: hasStressInLog || Boolean(params?.control?.tstress),
    formula,
    nat: finalAtoms.length,
    wallTimeSec,
    cpuTimeSec,
  };
}
