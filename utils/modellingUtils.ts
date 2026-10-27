import { CrystalStructure, Atom, DetectedLatticeInfo } from '../types';

/**
 * 3x3 Matrix determinant
 */
function det3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/**
 * 3x3 Matrix transpose
 */
function transpose3x3(m: number[][]): number[][] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/**
 * 3x3 Matrix inverse
 */
function inv3x3(m: number[][]): number[][] | null {
  const d = det3x3(m);
  if (Math.abs(d) < 1e-12) return null;

  const invd = 1.0 / d;
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invd,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invd,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invd,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invd,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invd,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invd,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invd,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invd,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invd,
    ],
  ];
}

/**
 * Multiply 3x3 matrix by 3D vector
 */
function matVecMult(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Multiply two 3x3 matrices: A * B
 */
function matMatMult(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return result;
}

/**
 * Convert Cartesian coordinates (x, y, z) to fractional coordinates (u, v, w)
 * r_cart = u * a1 + v * a2 + w * a3 = L^T * [u, v, w]^T
 * [u, v, w]^T = (L^T)^-1 * [x, y, z]^T
 */
export function cartToFrac(cart: [number, number, number], lattice: number[][]): [number, number, number] {
  const LT = transpose3x3(lattice);
  const invLT = inv3x3(LT);
  if (!invLT) return cart;
  const res = matVecMult(invLT, cart);
  return [res[0], res[1], res[2]];
}

/**
 * Convert Fractional coordinates (u, v, w) to Cartesian coordinates (x, y, z)
 */
export function fracToCart(frac: [number, number, number], lattice: number[][]): [number, number, number] {
  const LT = transpose3x3(lattice);
  const res = matVecMult(LT, frac);
  return [res[0], res[1], res[2]];
}

/**
 * Recalculate detected lattice lengths and angles from a 3x3 lattice matrix
 */
export function calculateLatticeInfo(lattice: number[][]): DetectedLatticeInfo {
  const a1 = lattice[0];
  const a2 = lattice[1];
  const a3 = lattice[2];

  const a = Math.hypot(a1[0], a1[1], a1[2]);
  const b = Math.hypot(a2[0], a2[1], a2[2]);
  const c = Math.hypot(a3[0], a3[1], a3[2]);

  const dot = (v1: number[], v2: number[]) => v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const alpha = b > 0 && c > 0 ? toDeg(Math.acos(Math.min(1, Math.max(-1, dot(a2, a3) / (b * c))))) : 90;
  const beta = a > 0 && c > 0 ? toDeg(Math.acos(Math.min(1, Math.max(-1, dot(a1, a3) / (a * c))))) : 90;
  const gamma = a > 0 && b > 0 ? toDeg(Math.acos(Math.min(1, Math.max(-1, dot(a1, a2) / (a * b))))) : 90;

  return {
    ibrav: 0,
    a: parseFloat(a.toFixed(5)),
    b: parseFloat(b.toFixed(5)),
    c: parseFloat(c.toFixed(5)),
    alpha: parseFloat(alpha.toFixed(2)),
    beta: parseFloat(beta.toFixed(2)),
    gamma: parseFloat(gamma.toFixed(2)),
  };
}

/**
 * Helper to compute chemical formula string from list of atoms
 */
export function computeFormula(atoms: Atom[]): string {
  if (!atoms || atoms.length === 0) return 'pwscf';
  const counts: Record<string, number> = {};
  atoms.forEach((a) => {
    if (a && a.symbol) {
      counts[a.symbol] = (counts[a.symbol] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sym, cnt]) => (cnt > 1 ? `${sym}${cnt}` : sym))
    .join('');
}

/**
 * 1. TRANSLATION OF CELL
 * Shift all atoms along fractional offsets da, db, dc (e.g. da = 0.1 shifts by 0.1 * a_vec)
 */
export function translateCell(
  structure: CrystalStructure,
  da: number,
  db: number,
  dc: number,
  wrapAtoms: boolean = true
): CrystalStructure {
  if (!structure || !structure.lattice || !structure.atoms) return structure;

  const lattice = structure.lattice;
  const newAtoms: Atom[] = structure.atoms.map((atom) => {
    const [u, v, w] = cartToFrac([atom.x, atom.y, atom.z], lattice);
    let nu = u + da;
    let nv = v + db;
    let nw = w + dc;

    if (wrapAtoms) {
      nu = ((nu % 1) + 1) % 1;
      nv = ((nv % 1) + 1) % 1;
      nw = ((nw % 1) + 1) % 1;
    }

    const [nx, ny, nz] = fracToCart([nu, nv, nw], lattice);
    return {
      ...atom,
      x: nx,
      y: ny,
      z: nz,
    };
  });

  return {
    ...structure,
    atoms: newAtoms,
    formula: computeFormula(newAtoms),
  };
}

/**
 * Center atoms in fractional coordinates [0, 1)
 */
export function centerCellAtoms(structure: CrystalStructure): CrystalStructure {
  if (!structure || !structure.lattice || !structure.atoms || structure.atoms.length === 0) return structure;

  const lattice = structure.lattice;
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  let minW = Infinity, maxW = -Infinity;

  const fracs = structure.atoms.map((atom) => {
    const [u, v, w] = cartToFrac([atom.x, atom.y, atom.z], lattice);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
    return [u, v, w] as [number, number, number];
  });

  const centerU = (minU + maxU) / 2;
  const centerV = (minV + maxV) / 2;
  const centerW = (minW + maxW) / 2;

  const shiftU = 0.5 - centerU;
  const shiftV = 0.5 - centerV;
  const shiftW = 0.5 - centerW;

  const newAtoms: Atom[] = structure.atoms.map((atom, idx) => {
    const [u, v, w] = fracs[idx];
    const [nx, ny, nz] = fracToCart([u + shiftU, v + shiftV, w + shiftW], lattice);
    return {
      ...atom,
      x: nx,
      y: ny,
      z: nz,
    };
  });

  return {
    ...structure,
    atoms: newAtoms,
    formula: computeFormula(newAtoms),
  };
}

/**
 * 2. SUPERCELL GENERATION
 * Duplicate structure na x nb x nc times along lattice vectors a, b, c
 */
export function createSupercell(
  structure: CrystalStructure,
  na: number,
  nb: number,
  nc: number
): CrystalStructure {
  if (!structure || !structure.lattice || !structure.atoms) return structure;

  const nx = Math.max(1, Math.round(na));
  const ny = Math.max(1, Math.round(nb));
  const nz = Math.max(1, Math.round(nc));

  const [a1, a2, a3] = structure.lattice;

  // New lattice vectors
  const newLattice = [
    [a1[0] * nx, a1[1] * nx, a1[2] * nx],
    [a2[0] * ny, a2[1] * ny, a2[2] * ny],
    [a3[0] * nz, a3[1] * nz, a3[2] * nz],
  ];

  const newAtoms: Atom[] = [];

  for (let ia = 0; ia < nx; ia++) {
    for (let ib = 0; ib < ny; ib++) {
      for (let ic = 0; ic < nz; ic++) {
        structure.atoms.forEach((atom) => {
          const shiftX = ia * a1[0] + ib * a2[0] + ic * a3[0];
          const shiftY = ia * a1[1] + ib * a2[1] + ic * a3[1];
          const shiftZ = ia * a1[2] + ib * a2[2] + ic * a3[2];

          newAtoms.push({
            symbol: atom.symbol,
            x: atom.x + shiftX,
            y: atom.y + shiftY,
            z: atom.z + shiftZ,
            if_pos: atom.if_pos ? [...atom.if_pos] as [number, number, number] : [1, 1, 1],
          });
        });
      }
    }
  }

  const newFormula = computeFormula(newAtoms);
  const detectedInfo = calculateLatticeInfo(newLattice);

  return {
    lattice: newLattice,
    atoms: newAtoms,
    formula: newFormula,
    detectedInfo,
  };
}

/**
 * Greatest common divisor
 */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Get integer transformation matrix for Miller index (h, k, l) surface cut
 */
function getMillerTransformationMatrix(h: number, k: number, l: number): number[][] {
  if (h === 0 && k === 0 && l === 0) {
    h = 0;
    k = 0;
    l = 1;
  }
  // Normalize by gcd
  const g = gcd(gcd(h, k), l) || 1;
  const h_ = Math.round(h / g);
  const k_ = Math.round(k / g);
  const l_ = Math.round(l / g);

  // Common low-index Miller surfaces
  if (h_ === 0 && k_ === 0 && l_ === 1) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  if (h_ === 1 && k_ === 0 && l_ === 0) {
    return [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ];
  }
  if (h_ === 0 && k_ === 1 && l_ === 0) {
    return [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ];
  }
  if (h_ === 1 && k_ === 1 && l_ === 0) {
    return [
      [1, -1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ];
  }
  if (h_ === 1 && k_ === 1 && l_ === 1) {
    return [
      [1, -1, 0],
      [0, 1, -1],
      [1, 1, 1],
    ];
  }
  if (h_ === 1 && k_ === 0 && l_ === 1) {
    return [
      [0, 1, 0],
      [1, 0, -1],
      [1, 0, 1],
    ];
  }

  // General integer matrix search for hkl
  // Find two in-plane integer vectors u and v such that u.hkl = 0 and v.hkl = 0
  // And w = [h_, k_, l_]
  const inPlane: number[][] = [];
  const searchRange = 3;

  for (let x = -searchRange; x <= searchRange; x++) {
    for (let y = -searchRange; y <= searchRange; y++) {
      for (let z = -searchRange; z <= searchRange; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        if (x * h_ + y * k_ + z * l_ === 0) {
          inPlane.push([x, y, z]);
        }
      }
    }
  }

  // Sort by vector norm (shortest first)
  inPlane.sort((v1, v2) => v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2 - (v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2));

  let bestU = inPlane[0] || [1, 0, 0];
  let bestV: number[] | null = null;

  for (let i = 1; i < inPlane.length; i++) {
    const v = inPlane[i];
    // Check linear independence: cross product not zero
    const cp = [
      bestU[1] * v[2] - bestU[2] * v[1],
      bestU[2] * v[0] - bestU[0] * v[2],
      bestU[0] * v[1] - bestU[1] * v[0],
    ];
    if (cp[0] !== 0 || cp[1] !== 0 || cp[2] !== 0) {
      bestV = v;
      break;
    }
  }

  if (!bestV) {
    bestV = [0, 1, 0];
  }

  const w = [h_, k_, l_];
  let matrix = [bestU, bestV, w];

  if (det3x3(matrix) < 0) {
    matrix = [bestV, bestU, w];
  }

  return matrix;
}

/**
 * 3. SLAB GENERATION
 * Create surface slab with Miller indices (h, k, l), vacuum thickness (in Å), and number of layers
 */
export function generateSlab(
  structure: CrystalStructure,
  h: number,
  k: number,
  l: number,
  vacuum: number = 15,
  layers: number = 2,
  centerSlab: boolean = true
): CrystalStructure {
  if (!structure || !structure.lattice || !structure.atoms) return structure;

  const numLayers = Math.max(1, Math.round(layers));
  const vacThickness = Math.max(0, vacuum);

  const M = getMillerTransformationMatrix(h, k, l);
  const detM = Math.abs(det3x3(M)) || 1;

  // Transform original lattice by M
  // R_surf = M * R_orig
  const origLattice = structure.lattice;
  const baseSurfLattice = matMatMult(M, origLattice);

  // Collect unit cell replicas to fill the surface cell volume (detM replicas)
  // Search integer grid for replicas that fall inside [0, 1) of the new basis
  const invM = inv3x3(M);

  const baseAtoms: Atom[] = [];
  const searchBound = Math.ceil(Math.cbrt(detM)) + 2;

  // Pre-calculate inverse surface lattice
  const LT_surf = transpose3x3(baseSurfLattice);
  const invLT_surf = inv3x3(LT_surf);

  for (let ix = -searchBound; ix <= searchBound; ix++) {
    for (let iy = -searchBound; iy <= searchBound; iy++) {
      for (let iz = -searchBound; iz <= searchBound; iz++) {
        const shiftX = ix * origLattice[0][0] + iy * origLattice[1][0] + iz * origLattice[2][0];
        const shiftY = ix * origLattice[0][1] + iy * origLattice[1][1] + iz * origLattice[2][1];
        const shiftZ = ix * origLattice[0][2] + iy * origLattice[1][2] + iz * origLattice[2][2];

        structure.atoms.forEach((atom) => {
          const absX = atom.x + shiftX;
          const absY = atom.y + shiftY;
          const absZ = atom.z + shiftZ;

          // Convert to fractional in new surface lattice
          if (invLT_surf) {
            const frac = matVecMult(invLT_surf, [absX, absY, absZ]);
            const eps = 1e-4;
            if (frac[0] >= -eps && frac[0] < 1 - eps &&
                frac[1] >= -eps && frac[1] < 1 - eps &&
                frac[2] >= -eps && frac[2] < 1 - eps) {
              
              baseAtoms.push({
                symbol: atom.symbol,
                x: absX,
                y: absY,
                z: absZ,
                if_pos: atom.if_pos ? [...atom.if_pos] as [number, number, number] : [1, 1, 1],
              });
            }
          }
        });
      }
    }
  }

  // Fallback if baseAtoms selection missed
  if (baseAtoms.length === 0) {
    structure.atoms.forEach((a) => baseAtoms.push({ ...a }));
  }

  // Now repeat baseAtoms along the c-axis vector (3rd row of baseSurfLattice) for `numLayers`
  const cVec = baseSurfLattice[2];
  const cLen = Math.hypot(cVec[0], cVec[1], cVec[2]);
  const cNorm = cLen > 0 ? [cVec[0] / cLen, cVec[1] / cLen, cVec[2] / cLen] : [0, 0, 1];

  const slabAtoms: Atom[] = [];
  for (let lyr = 0; lyr < numLayers; lyr++) {
    baseAtoms.forEach((atom) => {
      slabAtoms.push({
        symbol: atom.symbol,
        x: atom.x + lyr * cVec[0],
        y: atom.y + lyr * cVec[1],
        z: atom.z + lyr * cVec[2],
        if_pos: atom.if_pos ? [...atom.if_pos] as [number, number, number] : [1, 1, 1],
      });
    });
  }

  // New c-vector with vacuum addition
  const totalMaterialHeight = numLayers * cLen;
  const newCLen = totalMaterialHeight + vacThickness;
  const cScale = cLen > 0 ? newCLen / cLen : 1;

  const finalLattice = [
    [...baseSurfLattice[0]],
    [...baseSurfLattice[1]],
    [baseSurfLattice[2][0] * cScale, baseSurfLattice[2][1] * cScale, baseSurfLattice[2][2] * cScale],
  ];

  // Optionally center the slab along the c-vector vacuum space
  if (centerSlab && vacThickness > 0) {
    const shiftVector = [
      (vacThickness / 2) * cNorm[0],
      (vacThickness / 2) * cNorm[1],
      (vacThickness / 2) * cNorm[2],
    ];

    slabAtoms.forEach((atom) => {
      atom.x += shiftVector[0];
      atom.y += shiftVector[1];
      atom.z += shiftVector[2];
    });
  }

  const formula = computeFormula(slabAtoms);
  const detectedInfo = calculateLatticeInfo(finalLattice);

  return {
    lattice: finalLattice,
    atoms: slabAtoms,
    formula,
    detectedInfo,
  };
}
