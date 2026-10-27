
export interface Atom {
  symbol: string;
  x: number;
  y: number;
  z: number;
  id?: string;
  if_pos?: [number, number, number]; // 0 (fixed) or 1 (mobile)
}

export interface DetectedLatticeInfo {
  ibrav: number;
  bravaisName?: string;
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface CrystalStructure {
  lattice: number[][]; // 3x3 matrix
  atoms: Atom[];
  formula: string;
  detectedInfo?: DetectedLatticeInfo;
}

export interface QEControlParams {
  calculation: 'scf' | 'nscf' | 'bands' | 'relax' | 'vc-relax' | 'md';
  restart_mode: 'from_scratch' | 'restart';
  pseudo_dir: string;
  outdir: string;
  prefix: string;
  tstress: boolean;
  tprnfor: boolean;
}

export interface QESpecies {
  symbol: string;
  mass: number;
  pseudo: string;
  // Magnetization
  magnetization?: number;
  // DFT+U
  hubbard_u?: number;
  hubbard_manifold?: string; // e.g. '3d', '4f'
}

export interface ConvergenceTestParams {
  enabled: boolean;
  testType: 'ecutwfc' | 'kpoints';
  ecutwfc: {
    initial: number;
    final: number;
    step: number;
  };
  kpoints: {
    initial: number;
    final: number;
    step?: number;
  };
}

export interface QESystemParams {
  ibrav: number;
  // Lattice parameters
  celldm: number[]; // Indices 0-6 (0 unused)
  a?: number;
  b?: number;
  c?: number;
  cosab?: number;
  cosac?: number;
  cosbc?: number;
  
  nat: number;
  ntyp: number;
  ecutwfc: number;
  ecutrho: number;
  occupations: 'smearing' | 'tetrahedra' | 'fixed' | 'from_input';
  smearing: 'gaussian' | 'methfessel-paxton' | 'marzari-vanderbilt' | 'fermi-dirac';
  degauss: number;
  
  // Magnetization
  nspin: number;

  // Convergence testing configuration
  convergence_test?: ConvergenceTestParams;
}

export interface QEElectronsParams {
  conv_thr: number;
  mixing_beta: number;
  electron_maxstep: number;
}

export interface QEIonsParams {
  ion_dynamics: 'bfgs' | 'damp' | 'verlet' | 'langevin' | 'beeman';
}

export interface QECellParams {
  cell_dynamics: 'none' | 'bfgs' | 'pr' | 'w';
  press: number;
}

export interface QEHubbardParams {
    enabled: boolean;
    projection: 'atomic' | 'ortho-atomic' | 'norm-atomic' | 'wf' | 'pseudo';
}

export interface KPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface QEPPParams {
  enabled: boolean;
  plot_num: number;
  filplot: string;
  iflag: number;
  output_format: number;
  fileout: string;
}

export interface QEPHParams {
  enabled: boolean;
  tr2_ph: number;
  fildyn: string;
  ldisp: boolean;
  nq1: number;
  nq2: number;
  nq3: number;
}

export type RightPanelView = 'input' | 'run' | 'results';

export interface SCFStep {
  iteration: number;
  globalStep?: number;
  ionicStep?: number;
  totalEnergyRy: number;
  totalEnergyEV?: number;
  harrisFoulkesRy?: number;
  deRy: number;
  accuracy: number;
  ethr?: number;
  cpuTime: number;
}

export interface AtomForce {
  atomIndex: number; // 1-based index
  symbol: string;
  fx: number; // Ry/Bohr
  fy: number; // Ry/Bohr
  fz: number; // Ry/Bohr
  magnitude: number; // Ry/Bohr
}

export interface StressData {
  tensorRyBohr3?: number[][]; // 3x3 matrix in Ry/bohr^3
  tensorKbar: number[][]; // 3x3 matrix in kbar
  pressureKbar: number; // hydrostatic pressure in kbar
  sxx: number;
  syy: number;
  szz: number;
  sxy: number;
  sxz: number;
  syz: number;
}

export interface IonicStep {
  stepNumber: number; // 1-based outer ionic step index
  scfSteps: SCFStep[]; // inner electronic SCF iterations nested within this ionic step
  totalEnergyRy: number; // converged/final energy of this ionic step in Ry
  totalEnergyEV: number; // in eV
  deIonicRy: number; // energy change relative to previous ionic step
  scfAccuracyRy: number; // final scf_accuracy of this ionic step
  convergedScf: boolean;
  totalForceRyBohr?: number;
  maxForceRyBohr?: number;
  atomicForces?: AtomForce[];
  stress?: StressData;
  lattice: number[][]; // 3x3 lattice matrix (Å) at this step
  atoms: Atom[]; // Cartesian atomic coordinates (Å) at this step
  cellVolumeAng3: number;
  enthalpyRy?: number;
  cpuTimeSec: number;
}

export interface CalculationResult {
  calculationType: string;
  converged: boolean;
  totalEnergyRy: number;
  totalEnergyEV: number;
  fermiEnergyEV: number;
  bandGapEV?: number;
  isMetallic: boolean;
  maxForceRyBohr?: number;
  stressKbar?: number;
  iterations: number;
  scfSteps: SCFStep[];
  ionicSteps?: IonicStep[];
  tprnfor?: boolean;
  tstress?: boolean;
  wallTimeSec: number;
  cpuTimeSec: number;
  outputLog: string;
  timestamp: string;
  formula: string;
  nat: number;
  mpiCores: number;
  ompThreads?: number;
  pwPath?: string;
  openmpPath?: string;
  workDir?: string;
  mpiCommand?: string;
  bashScript?: string;
}

export interface QEParams {
  control: QEControlParams;
  system: QESystemParams;
  electrons: QEElectronsParams;
  ions: QEIonsParams;
  cell: QECellParams;
  k_points: {
    type: 'automatic' | 'gamma' | 'crystal' | 'tpiba' | 'crystal_b' | 'tpiba_b';
    values?: number[]; // e.g. [4, 4, 4, 0, 0, 0]
    points?: KPoint[];
  };
  atomic_species: Record<string, QESpecies>;
  hubbard: QEHubbardParams;
  pp: QEPPParams;
  ph: QEPHParams;
  // UI helper for lattice input mode
  lattice_entry_mode: 'celldm' | 'abc';
  atomic_positions_unit?: 'angstrom' | 'crystal';
}

