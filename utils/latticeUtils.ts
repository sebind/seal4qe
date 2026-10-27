
import * as THREE from 'three';

/**
 * Extracts lattice constants (a, b, c in Å) and angles (alpha, beta, gamma in degrees) from a 3x3 lattice matrix.
 */
export function latticeMatrixToParams(lattice?: number[][]): {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
} {
  if (!lattice || lattice.length < 3 || !lattice[0] || !lattice[1] || !lattice[2]) {
    return { a: 10, b: 10, c: 10, alpha: 90, beta: 90, gamma: 90 };
  }

  const v1 = new THREE.Vector3(lattice[0][0] || 0, lattice[0][1] || 0, lattice[0][2] || 0);
  const v2 = new THREE.Vector3(lattice[1][0] || 0, lattice[1][1] || 0, lattice[1][2] || 0);
  const v3 = new THREE.Vector3(lattice[2][0] || 0, lattice[2][1] || 0, lattice[2][2] || 0);

  const a = v1.length() || 10;
  const b = v2.length() || 10;
  const c = v3.length() || 10;

  const radToDeg = (r: number) => (r * 180) / Math.PI;

  const cosAlpha = (b > 0 && c > 0) ? Math.max(-1, Math.min(1, v2.dot(v3) / (b * c))) : 0;
  const cosBeta  = (a > 0 && c > 0) ? Math.max(-1, Math.min(1, v1.dot(v3) / (a * c))) : 0;
  const cosGamma = (a > 0 && b > 0) ? Math.max(-1, Math.min(1, v1.dot(v2) / (a * b))) : 0;

  const alpha = radToDeg(Math.acos(cosAlpha));
  const beta  = radToDeg(Math.acos(cosBeta));
  const gamma = radToDeg(Math.acos(cosGamma));

  return {
    a: parseFloat(a.toFixed(4)),
    b: parseFloat(b.toFixed(4)),
    c: parseFloat(c.toFixed(4)),
    alpha: parseFloat(alpha.toFixed(2)),
    beta: parseFloat(beta.toFixed(2)),
    gamma: parseFloat(gamma.toFixed(2))
  };
}

/**
 * Constructs a 3x3 lattice matrix from lattice constants (a, b, c) and angles (alpha, beta, gamma in degrees).
 */
export function paramsToLatticeMatrix(
  a: number,
  b: number,
  c: number,
  alphaDeg: number = 90,
  betaDeg: number = 90,
  gammaDeg: number = 90
): number[][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const alpha = toRad(alphaDeg || 90);
  const beta = toRad(betaDeg || 90);
  const gamma = toRad(gammaDeg || 90);

  const cosA = Math.cos(alpha);
  const cosB = Math.cos(beta);
  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);

  const cx = c * cosB;
  const cy = c * (cosA - cosB * cosG) / (sinG || 1e-9);
  const czSq = Math.max(0, c * c - cx * cx - cy * cy);
  const cz = Math.sqrt(czSq);

  return [
    [a, 0, 0],
    [b * cosG, b * sinG, 0],
    [cx, cy, cz]
  ];
}

const BOHR_TO_ANGSTROM = 0.5291772109;

export const BRAVAIS_LATTICE_NAMES: Record<number, string> = {
  0: 'Free (CELL_PARAMETERS)',
  1: 'Cubic P (sc)',
  2: 'Cubic F (fcc)',
  3: 'Cubic I (bcc)',
  [-3]: 'Cubic I (bcc, sym)',
  4: 'Hexagonal / Trigonal P',
  5: 'Trigonal R (3-fold c)',
  [-5]: 'Trigonal R (3-fold <111>)',
  6: 'Tetragonal P (st)',
  7: 'Tetragonal I (bct)',
  8: 'Orthorhombic P',
  9: 'Orthorhombic Base-Centered',
  [-9]: 'Orthorhombic Base-Centered (alt)',
  91: 'Orthorhombic A-Centered',
  10: 'Orthorhombic Face-Centered',
  11: 'Orthorhombic Body-Centered',
  12: 'Monoclinic P (unique c)',
  [-12]: 'Monoclinic P (unique b)',
  13: 'Monoclinic Base-Centered (c)',
  [-13]: 'Monoclinic Base-Centered (b)',
  14: 'Triclinic',
};

/**
 * Computes Quantum ESPRESSO celldm(1..6) array (index 0 unused) from lattice constants (Å) and angles (deg).
 */
export function computeCelldmFromParams(
  ibrav: number,
  a: number,
  b: number,
  c: number,
  alphaDeg: number = 90,
  betaDeg: number = 90,
  gammaDeg: number = 90
): number[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const safeA = a > 0 ? a : 5.4307;
  const celldm1 = parseFloat((safeA / BOHR_TO_ANGSTROM).toFixed(6));
  const celldm2 = parseFloat((b / safeA).toFixed(6));
  const celldm3 = parseFloat((c / safeA).toFixed(6));

  const cosAlpha = parseFloat(Math.cos(toRad(alphaDeg)).toFixed(6));
  const cosBeta = parseFloat(Math.cos(toRad(betaDeg)).toFixed(6));
  const cosGamma = parseFloat(Math.cos(toRad(gammaDeg)).toFixed(6));

  const celldm = [0, celldm1, 0, 0, 0, 0, 0];

  if ([4, 6, 7].includes(ibrav)) {
    celldm[3] = celldm3;
  } else if ([5, -5].includes(ibrav)) {
    celldm[4] = cosAlpha;
  } else if ([8, 9, -9, 91, 10, 11].includes(ibrav)) {
    celldm[2] = celldm2;
    celldm[3] = celldm3;
  } else if ([12, 13].includes(ibrav)) {
    celldm[2] = celldm2;
    celldm[3] = celldm3;
    celldm[4] = cosGamma;
  } else if ([-12, -13].includes(ibrav)) {
    celldm[2] = celldm2;
    celldm[3] = celldm3;
    celldm[5] = cosBeta;
  } else if (ibrav === 14) {
    celldm[2] = celldm2;
    celldm[3] = celldm3;
    celldm[4] = cosAlpha;
    celldm[5] = cosBeta;
    celldm[6] = cosGamma;
  }

  return celldm;
}

/**
 * Automatically detects the Quantum ESPRESSO Bravais lattice index (ibrav) and cell parameters
 * based on a 3x3 lattice matrix or explicit detected info.
 */
export function detectBravaisLattice(
  lattice?: number[][],
  detectedIbrav?: number
): {
  ibrav: number;
  bravaisName: string;
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
  celldm: number[];
} {
  const params = latticeMatrixToParams(lattice);
  let { a, b, c, alpha, beta, gamma } = params;

  if (detectedIbrav !== undefined && detectedIbrav !== 0) {
    return {
      ibrav: detectedIbrav,
      bravaisName: BRAVAIS_LATTICE_NAMES[detectedIbrav] || `ibrav = ${detectedIbrav}`,
      a,
      b,
      c,
      alpha,
      beta,
      gamma,
      celldm: computeCelldmFromParams(detectedIbrav, a, b, c, alpha, beta, gamma),
    };
  }

  const eqL = (v1: number, v2: number) => Math.abs(v1 - v2) / Math.max(v1, v2, 1e-6) < 0.03;
  const eqA = (ang: number, target: number) => Math.abs(ang - target) < 0.8;

  const abEqual = eqL(a, b);
  const bcEqual = eqL(b, c);
  const acEqual = eqL(a, c);
  const allL = abEqual && bcEqual;

  const a90 = eqA(alpha, 90);
  const b90 = eqA(beta, 90);
  const g90 = eqA(gamma, 90);
  const all90 = a90 && b90 && g90;

  const a60 = eqA(alpha, 60);
  const b60 = eqA(beta, 60);
  const g60 = eqA(gamma, 60);
  const all60 = a60 && b60 && g60;

  const a109 = eqA(alpha, 109.47) || eqA(alpha, 109.5);
  const b109 = eqA(beta, 109.47) || eqA(beta, 109.5);
  const g109 = eqA(gamma, 109.47) || eqA(gamma, 109.5);
  const all109 = a109 && b109 && g109;

  let ibrav = 0;

  if (allL && all90) {
    ibrav = 1; // Cubic P (sc)
  } else if (allL && all60) {
    ibrav = 2; // Cubic F (fcc)
  } else if (allL && all109) {
    ibrav = 3; // Cubic I (bcc)
  } else if (abEqual && a90 && b90 && eqA(gamma, 120)) {
    ibrav = 4; // Hexagonal P
  } else if (bcEqual && b90 && g90 && eqA(alpha, 120)) {
    ibrav = 4; // Hexagonal P
  } else if (acEqual && a90 && g90 && eqA(beta, 120)) {
    ibrav = 4; // Hexagonal P
  } else if (allL && eqA(alpha, beta) && eqA(beta, gamma) && !all90) {
    ibrav = 5; // Trigonal R
  } else if (abEqual && all90 && !bcEqual) {
    ibrav = 6; // Tetragonal P
  } else if (bcEqual && all90 && !abEqual) {
    ibrav = 6; // Tetragonal P
  } else if (acEqual && all90 && !abEqual) {
    ibrav = 6; // Tetragonal P
  } else if (all90 && !abEqual && !bcEqual && !acEqual) {
    ibrav = 8; // Orthorhombic P
  } else if ((a90 && b90 && !g90) || (a90 && g90 && !b90) || (b90 && g90 && !a90)) {
    ibrav = 12; // Monoclinic P
  } else if (!a90 && !b90 && !g90) {
    ibrav = 14; // Triclinic
  } else {
    ibrav = 0; // Free / CELL_PARAMETERS
  }

  return {
    ibrav,
    bravaisName: BRAVAIS_LATTICE_NAMES[ibrav] || 'Free (CELL_PARAMETERS)',
    a,
    b,
    c,
    alpha,
    beta,
    gamma,
    celldm: computeCelldmFromParams(ibrav, a, b, c, alpha, beta, gamma),
  };
}

/**
 * Calculates the reciprocal lattice vectors from the real-space lattice vectors.
 * b1 = 2pi * (a2 x a3) / (a1 . (a2 x a3))
 */
export function getReciprocalLattice(lattice: number[][]): number[][] {
  if (!lattice || lattice.length !== 3) return [];
  
  const a1 = new THREE.Vector3(...lattice[0]);
  const a2 = new THREE.Vector3(...lattice[1]);
  const a3 = new THREE.Vector3(...lattice[2]);
  
  const volume = a1.dot(new THREE.Vector3().crossVectors(a2, a3));
  if (Math.abs(volume) < 1e-6) return [];
  
  const b1 = new THREE.Vector3().crossVectors(a2, a3).multiplyScalar(2 * Math.PI / volume);
  const b2 = new THREE.Vector3().crossVectors(a3, a1).multiplyScalar(2 * Math.PI / volume);
  const b3 = new THREE.Vector3().crossVectors(a1, a2).multiplyScalar(2 * Math.PI / volume);
  
  return [
    [b1.x, b1.y, b1.z],
    [b2.x, b2.y, b2.z],
    [b3.x, b3.y, b3.z]
  ];
}

/**
 * Generates a grid of k-points in reciprocal space.
 * k = (n1/N1)b1 + (n2/N2)b2 + (n3/N3)b3
 */
export function generateKPointGrid(reciprocalLattice: number[][], kMesh: number[]): number[][] {
  if (!reciprocalLattice || reciprocalLattice.length !== 3 || !kMesh || kMesh.length < 3) return [];
  
  const nx = kMesh[0] || 1;
  const ny = kMesh[1] || 1;
  const nz = kMesh[2] || 1;
  
  // Shifts (sx, sy, sz) are typically 0 or 1 in QE. 1 means shifted by 1/(2N)
  const sx = kMesh[3] === 1 ? 0.5 : 0;
  const sy = kMesh[4] === 1 ? 0.5 : 0;
  const sz = kMesh[5] === 1 ? 0.5 : 0;

  const b1 = new THREE.Vector3(...reciprocalLattice[0]);
  const b2 = new THREE.Vector3(...reciprocalLattice[1]);
  const b3 = new THREE.Vector3(...reciprocalLattice[2]);
  
  const points: number[][] = [];
  
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        // Fractional coordinates in reciprocal space
        const fx = (i + sx) / nx;
        const fy = (j + sy) / ny;
        const fz = (k + sz) / nz;
        
        // Shift to be centered around Gamma for visualization if desired, 
        // but typically we stay in [0, 1) or [-0.5, 0.5)
        const sfx = fx >= 0.5 ? fx - 1 : fx;
        const sfy = fy >= 0.5 ? fy - 1 : fy;
        const sfz = fz >= 0.5 ? fz - 1 : fz;

        const point = new THREE.Vector3()
          .addScaledVector(b1, sfx)
          .addScaledVector(b2, sfy)
          .addScaledVector(b3, sfz);
          
        points.push([point.x, point.y, point.z]);
      }
    }
  }
  
  return points;
}
