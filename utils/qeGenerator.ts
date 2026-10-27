
import { QEParams, CrystalStructure } from "../types";
import { ELEMENT_MASSES } from "../constants";
import { latticeMatrixToParams, computeCelldmFromParams } from "./latticeUtils";
import { cartToFrac } from "./modellingUtils";

// Helper function to generate Quantum ESPRESSO input file content
export function generateQEInput(structure: CrystalStructure | null, params: QEParams | null): string {
  if (!structure || !structure.atoms) return "# No structure loaded";
  if (!params) return "# Invalid configuration parameters";

  // Guard against missing nested objects by providing defaults during destructuring
  const { 
    control = {} as any, 
    system = {} as any, 
    electrons = {} as any, 
    ions = {} as any,
    cell = {} as any,
    k_points = {} as any, 
    atomic_species = {}, 
    hubbard = {} as any 
  } = params;
  
  // Identify unique species from structure to ensure we include them even if params are stale
  const speciesSet = new Set<string>();
  structure.atoms.forEach(a => {
      if (a && a.symbol) speciesSet.add(a.symbol);
  });
  const uniqueSpecies = Array.from(speciesSet).sort();

  // Merge structure-derived stats with system parameters
  const sys = {
    ...system,
    nat: structure.atoms.length,
    ntyp: uniqueSpecies.length,
  };

  const lines: string[] = [];

  const calculation = control.calculation || 'scf';

  // &CONTROL section
  lines.push("&CONTROL");
  lines.push(`  calculation = '${calculation}'`);
  lines.push(`  restart_mode = '${control.restart_mode || 'from_scratch'}'`);
  lines.push(`  pseudo_dir = '${control.pseudo_dir || './'}'`);
  lines.push(`  outdir = '${control.outdir || './'}'`);
  lines.push(`  prefix = '${control.prefix || 'pwscf'}'`);
  lines.push(`  tstress = .${!!control.tstress}.`);
  lines.push(`  tprnfor = .${!!control.tprnfor}.`);
  lines.push("/");

  // &SYSTEM section
  lines.push("&SYSTEM");
  lines.push(`  ibrav = ${sys.ibrav || 0}`);
  lines.push(`  nat = ${sys.nat}`);
  lines.push(`  ntyp = ${sys.ntyp}`);
  
  // Lattice parameters logic
  if (sys.ibrav !== 0) {
    const derived = latticeMatrixToParams(structure.lattice);
    const ibrav = sys.ibrav;
    if (params.lattice_entry_mode === 'celldm') {
      const fallbackCelldm = computeCelldmFromParams(ibrav, derived.a, derived.b, derived.c, derived.alpha, derived.beta, derived.gamma);
      const celldmArr = (sys.celldm && sys.celldm[1] && sys.celldm[1] !== 0) ? sys.celldm : fallbackCelldm;
      for (let i = 1; i <= 6; i++) {
        if (celldmArr[i] && celldmArr[i] !== 0) {
          lines.push(`  celldm(${i}) = ${celldmArr[i]}`);
        }
      }
    } else {
      const aVal = sys.a || derived.a;
      const bVal = sys.b || derived.b;
      const cVal = sys.c || derived.c;
      if (aVal) lines.push(`  a = ${aVal}`);
      if ([8, 9, -9, 91, 10, 11, 12, -12, 13, -13, 14].includes(ibrav) && bVal) {
        lines.push(`  b = ${bVal}`);
      }
      if ([4, 6, 7, 8, 9, -9, 91, 10, 11, 12, -12, 13, -13, 14].includes(ibrav) && cVal) {
        lines.push(`  c = ${cVal}`);
      }
      if ([5, -5, 12, 13, 14].includes(ibrav) && sys.cosab !== undefined) {
        lines.push(`  cosab = ${sys.cosab}`);
      }
      if ([-12, -13, 14].includes(ibrav) && sys.cosac !== undefined) {
        lines.push(`  cosac = ${sys.cosac}`);
      }
      if (ibrav === 14 && sys.cosbc !== undefined) {
        lines.push(`  cosbc = ${sys.cosbc}`);
      }
    }
  }

  lines.push(`  ecutwfc = ${sys.ecutwfc || 30.0}`);
  lines.push(`  ecutrho = ${sys.ecutrho || 240.0}`);
  lines.push(`  occupations = '${sys.occupations || 'smearing'}'`);
  if (sys.occupations === 'smearing') {
    lines.push(`  smearing = '${sys.smearing || 'gaussian'}'`);
    lines.push(`  degauss = ${sys.degauss || 0.02}`);
  }

  // Magnetization
  if (sys.nspin === 2) {
    lines.push(`  nspin = 2`);
    uniqueSpecies.forEach((sym, idx) => {
        const spec = atomic_species[sym];
        const mag = spec?.magnetization;
        if (mag !== undefined && mag !== 0) {
            lines.push(`  starting_magnetization(${idx + 1}) = ${mag}`);
        }
    });
  }

  lines.push("/");

  // &ELECTRONS section
  lines.push("&ELECTRONS");
  lines.push(`  conv_thr = ${electrons.conv_thr || 1.0e-6}`);
  lines.push(`  mixing_beta = ${electrons.mixing_beta || 0.7}`);
  lines.push(`  electron_maxstep = ${electrons.electron_maxstep || 100}`);
  lines.push("/");

  // &IONS section (for relax, vc-relax, md)
  if (['relax', 'vc-relax', 'md'].includes(calculation)) {
    lines.push("&IONS");
    lines.push(`  ion_dynamics = '${ions.ion_dynamics || 'bfgs'}'`);
    lines.push("/");
  }

  // &CELL section (for vc-relax)
  if (['vc-relax'].includes(calculation)) {
    lines.push("&CELL");
    lines.push(`  cell_dynamics = '${cell.cell_dynamics || 'bfgs'}'`);
    lines.push(`  press = ${cell.press || 0.0}`);
    lines.push("/");
  }

  // ATOMIC_SPECIES section
  lines.push("ATOMIC_SPECIES");
  uniqueSpecies.forEach(sym => {
    const userSpec = atomic_species[sym];
    const mass = userSpec?.mass || ELEMENT_MASSES[sym] || 1.0;
    const pseudo = userSpec?.pseudo || `${sym}.pbe-n-kjpaw_psl.1.0.0.UPF`; 
    lines.push(`  ${sym}  ${mass.toFixed(3)}  ${pseudo}`);
  });

  // CELL_PARAMETERS section
  if (sys.ibrav === 0 && structure.lattice) {
      lines.push("CELL_PARAMETERS (angstrom)");
      structure.lattice.forEach(row => {
          if (Array.isArray(row)) {
            lines.push(`  ${row.map(n => n.toFixed(9)).join('  ')}`);
          }
      });
  }

  // ATOMIC_POSITIONS section
  const posUnit = params.atomic_positions_unit || 'angstrom';
  lines.push(`ATOMIC_POSITIONS (${posUnit})`);
  structure.atoms.forEach(atom => {
    let x = atom.x;
    let y = atom.y;
    let z = atom.z;
    if (posUnit === 'crystal' && structure.lattice && structure.lattice.length === 3) {
      [x, y, z] = cartToFrac([atom.x, atom.y, atom.z], structure.lattice);
    }
    let line = `  ${atom.symbol.padEnd(3)}  ${x.toFixed(6).padStart(10)}  ${y.toFixed(6).padStart(10)}  ${z.toFixed(6).padStart(10)}`;
    if (atom.if_pos && (atom.if_pos[0] === 0 || atom.if_pos[1] === 0 || atom.if_pos[2] === 0)) {
        line += `  ${atom.if_pos.join(' ')}`;
    }
    lines.push(line);
  });

  // K_POINTS section
  const kpType = k_points.type || 'automatic';
  if (kpType === 'automatic') {
    lines.push("K_POINTS automatic");
    const kvals = k_points.values || [4, 4, 4, 1, 1, 1];
    lines.push(`  ${kvals.join(' ')}`);
  } else if (['crystal', 'tpiba', 'crystal_b', 'tpiba_b'].includes(kpType)) {
    lines.push(`K_POINTS ${kpType}`);
    const pts = k_points.points || [];
    lines.push(`  ${pts.length}`);
    pts.forEach(p => {
      lines.push(`  ${p.x.toFixed(8)}  ${p.y.toFixed(8)}  ${p.z.toFixed(8)}  ${p.w.toFixed(1)}`);
    });
  } else {
    lines.push(`K_POINTS ${kpType}`);
  }

  // HUBBARD section
  if (hubbard.enabled) {
      lines.push(`HUBBARD ${hubbard.projection || 'atomic'}`);
      uniqueSpecies.forEach(sym => {
          const spec = atomic_species[sym];
          if (spec && spec.hubbard_u && spec.hubbard_manifold) {
              lines.push(`  U  ${sym}-${spec.hubbard_manifold}  ${spec.hubbard_u}`);
          }
      });
  }

  return lines.join("\n");
}

export function generatePPInput(params: QEParams | null): string {
  if (!params || !params.pp.enabled) return "# PP calculation disabled";
  const { pp, control } = params;
  const lines: string[] = [];
  
  lines.push("&INPUTPP");
  lines.push(`  prefix = '${control.prefix || 'pwscf'}'`);
  lines.push(`  outdir = '${control.outdir || './'}'`);
  lines.push(`  filplot = '${pp.filplot}'`);
  lines.push(`  plot_num = ${pp.plot_num}`);
  lines.push("/");
  lines.push("&PLOT");
  lines.push(`  nfile = 1`);
  lines.push(`  filepp(1) = '${pp.filplot}'`);
  lines.push(`  weight(1) = 1.0`);
  lines.push(`  iflag = ${pp.iflag}`);
  lines.push(`  output_format = ${pp.output_format}`);
  lines.push(`  fileout = '${pp.fileout}'`);
  lines.push("/");
  
  return lines.join("\n");
}

export function generatePHInput(params: QEParams | null): string {
  if (!params || !params.ph.enabled) return "# PH calculation disabled";
  const { ph, control } = params;
  const lines: string[] = [];
  
  lines.push("Phonons on a grid");
  lines.push("&INPUTPH");
  lines.push(`  prefix = '${control.prefix || 'pwscf'}'`);
  lines.push(`  outdir = '${control.outdir || './'}'`);
  lines.push(`  fildyn = '${ph.fildyn}'`);
  lines.push(`  tr2_ph = ${ph.tr2_ph}`);
  lines.push(`  ldisp = .${!!ph.ldisp}.`);
  if (ph.ldisp) {
    lines.push(`  nq1 = ${ph.nq1}`);
    lines.push(`  nq2 = ${ph.nq2}`);
    lines.push(`  nq3 = ${ph.nq3}`);
  }
  lines.push("/");
  
  return lines.join("\n");
}

export interface ConvergenceFileInfo {
  filename: string;
  label: string;
  type: 'ecutwfc' | 'kpoints';
  variableValue: number;
  ecutwfc?: number;
  ecutrho?: number;
  kMesh?: [number, number, number];
  content: string;
}

export function generateConvergenceInputs(
  structure: CrystalStructure | null,
  params: QEParams | null
): ConvergenceFileInfo[] {
  if (!structure || !structure.atoms || structure.atoms.length === 0 || !params) return [];
  const conv = params.system?.convergence_test;
  if (!conv || !conv.enabled) return [];

  const calculation = params.control?.calculation || 'scf';
  const prefix = params.control?.prefix || structure.formula || 'pwscf';
  const files: ConvergenceFileInfo[] = [];

  if (conv.testType === 'ecutwfc') {
    const rawInit = Number(conv.ecutwfc?.initial);
    const rawFinal = Number(conv.ecutwfc?.final);
    const rawStep = Number(conv.ecutwfc?.step);

    const initial = !isNaN(rawInit) && rawInit > 0 ? rawInit : 20;
    const final = !isNaN(rawFinal) && rawFinal >= initial ? rawFinal : Math.max(initial, 60);
    const step = !isNaN(rawStep) && rawStep > 0 ? rawStep : 10;

    let count = 0;
    const maxFiles = 100;
    for (let ecut = initial; ecut <= final + 1e-5 && count < maxFiles; ecut += step) {
      count++;
      const ecutVal = Number(ecut.toFixed(2));
      const ecutrhoVal = Number((5 * ecutVal).toFixed(2));

      const modifiedParams: QEParams = {
        ...params,
        system: {
          ...params.system,
          ecutwfc: ecutVal,
          ecutrho: ecutrhoVal,
        },
      };

      const content = generateQEInput(structure, modifiedParams);
      const filename = `${calculation}.${prefix}.ecut_${ecutVal}.in`;

      files.push({
        filename,
        label: `ECUTWFC = ${ecutVal} Ry | ECUTRHO = ${ecutrhoVal} Ry`,
        type: 'ecutwfc',
        variableValue: ecutVal,
        ecutwfc: ecutVal,
        ecutrho: ecutrhoVal,
        content,
      });
    }
  } else if (conv.testType === 'kpoints') {
    const rawInit = parseInt(String(conv.kpoints?.initial), 10);
    const rawFinal = parseInt(String(conv.kpoints?.final), 10);
    const rawStep = parseInt(String(conv.kpoints?.step ?? 1), 10);

    const initial = !isNaN(rawInit) && rawInit >= 1 ? rawInit : 2;
    const final = !isNaN(rawFinal) && rawFinal >= initial ? rawFinal : Math.max(initial, 6);
    const step = !isNaN(rawStep) && rawStep >= 1 ? rawStep : 1;

    // Preserved shifts from existing k_points (defaults to 1 1 1 or 0 0 0)
    const existingK = params.k_points?.values || [4, 4, 4, 1, 1, 1];
    const shiftX = existingK[3] ?? 1;
    const shiftY = existingK[4] ?? 1;
    const shiftZ = existingK[5] ?? 1;

    let count = 0;
    const maxFiles = 100;
    for (let n = initial; n <= final && count < maxFiles; n += step) {
      count++;
      const nInt = Math.round(n);
      const kMeshValues = [nInt, nInt, nInt, shiftX, shiftY, shiftZ];

      const modifiedParams: QEParams = {
        ...params,
        k_points: {
          ...params.k_points,
          type: 'automatic',
          values: kMeshValues,
        },
      };

      const content = generateQEInput(structure, modifiedParams);
      const filename = `${calculation}.${prefix}.k_${nInt}x${nInt}x${nInt}.in`;

      files.push({
        filename,
        label: `K-Points Mesh = ${nInt}×${nInt}×${nInt} (Shift: ${shiftX} ${shiftY} ${shiftZ})`,
        type: 'kpoints',
        variableValue: nInt,
        kMesh: [nInt, nInt, nInt],
        content,
      });
    }
  }

  return files;
}

export function generateConvergenceBatchScript(
  files: ConvergenceFileInfo[],
  options?: { pwPath?: string; mpiCores?: number; mpiExecutable?: string }
): string {
  const pw = options?.pwPath?.trim() || 'pw.x';
  const np = options?.mpiCores || 4;
  const mpi = options?.mpiExecutable?.trim() || 'mpirun';

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# =============================================================================',
    '# Quantum ESPRESSO Convergence Testing Batch Script',
    `# Total files: ${files.length}`,
    '# Generated automatically by SEAL Quantum ESPRESSO Studio',
    '# =============================================================================',
    '',
    'set -e',
    `PW_EXEC="${pw}"`,
    `MPI_CMD="${mpi} -np ${np}"`,
    '',
    'echo "=== Starting Quantum ESPRESSO Convergence Runs ==="',
    'echo "Timestamp: $(date)"',
    'echo "------------------------------------------------"',
    'echo "Parameter Value | Total Energy (Ry) | Status"',
    'echo "------------------------------------------------"',
    '',
  ];

  files.forEach((f) => {
    const outName = f.filename.replace(/\.in$/, '.out');
    lines.push(`echo -n "Running ${f.filename} ... "`);
    lines.push(`$MPI_CMD $PW_EXEC -in ${f.filename} > ${outName}`);
    lines.push(`ENERGY=$(grep "!    total energy" ${outName} | tail -n 1 | awk '{print $(NF-1)}')`);
    lines.push(`echo "Done! Total Energy = $ENERGY Ry"`);
    lines.push('');
  });

  lines.push('echo "=== All Convergence Runs Completed! ==="');
  lines.push('');
  return lines.join('\n');
}
