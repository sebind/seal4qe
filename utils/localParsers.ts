import { CrystalStructure, Atom, DetectedLatticeInfo } from "../types";

export function suggestKPoints(structure: CrystalStructure): number[] {
  if (!structure || !structure.detectedInfo) {
    return [4, 4, 4, 1, 1, 1];
  }
  const { a, b, c } = structure.detectedInfo;
  const la = a || 10;
  const lb = b || 10;
  const lc = c || 10;

  // Constant K-Product heuristic: Nk * L ~ 30-35 Angstroms
  // If a cell dimension is very large (> 18 A, e.g. vacuum slab / 2D monolayer), use 1 k-point with 0 offset along that axis
  const nkx = la > 18 ? 1 : Math.max(1, Math.min(16, Math.ceil(32 / la)));
  const nky = lb > 18 ? 1 : Math.max(1, Math.min(16, Math.ceil(32 / lb)));
  const nkz = lc > 18 ? 1 : Math.max(1, Math.min(16, Math.ceil(32 / lc)));

  const offx = la > 18 ? 0 : 1;
  const offy = lb > 18 ? 0 : 1;
  const offz = lc > 18 ? 0 : 1;

  return [nkx, nky, nkz, offx, offy, offz];
}

export function tryLocalParse(content: string, fileName: string): CrystalStructure | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const lowerName = fileName.toLowerCase();
  const ext = lowerName.split('.').pop() || '';

  // 1. Check JSON (e.g. seal_project.json or pymatgen structure JSON)
  if (ext === 'json' || trimmed.startsWith('{')) {
    const jsonParsed = parseJSONStructure(trimmed);
    if (jsonParsed) return jsonParsed;
  }

  // 2. Check CIF by extension or content signature
  if (ext === 'cif' || trimmed.includes('_cell_length_a') || trimmed.includes('_atom_site_') || /^data_/m.test(trimmed)) {
    const cifParsed = parseCIF(trimmed);
    if (cifParsed) return cifParsed;
  }

  // 3. Check Quantum ESPRESSO input file (.in, .pw, .pwi)
  if (ext === 'in' || ext === 'pw' || ext === 'pwi' || trimmed.includes('ATOMIC_POSITIONS')) {
    const qeParsed = parseQEInputFile(trimmed);
    if (qeParsed) return qeParsed;
  }

  // 4. Check XSF
  if (ext === 'xsf' || trimmed.includes('PRIMVEC') || trimmed.includes('PRIMCOORD') || trimmed.includes('CONVVEC')) {
    const xsfParsed = parseXSF(trimmed);
    if (xsfParsed) return xsfParsed;
  }

  // 5. Check PDB
  if (ext === 'pdb' || trimmed.includes('CRYST1') || /^(ATOM  |HETATM)/m.test(trimmed)) {
    const pdbParsed = parsePDB(trimmed);
    if (pdbParsed) return pdbParsed;
  }

  // 6. Check VASP POSCAR / CONTCAR
  if (
    ext === 'vasp' ||
    ext === 'poscar' ||
    ext === 'contcar' ||
    lowerName.includes('poscar') ||
    lowerName.includes('contcar')
  ) {
    const vaspParsed = parseVASP(trimmed);
    if (vaspParsed) return vaspParsed;
  }

  // 7. Check XYZ
  if (ext === 'xyz') {
    const xyzParsed = parseXYZ(trimmed);
    if (xyzParsed) return xyzParsed;
  }

  // 8. Fallback auto-detection across all parsers for generic .txt or unknown extensions
  return (
    parseCIF(trimmed) ||
    parseQEInputFile(trimmed) ||
    parseVASP(trimmed) ||
    parseXSF(trimmed) ||
    parseXYZ(trimmed) ||
    parsePDB(trimmed) ||
    null
  );
}

// Clean numbers that might have uncertainty in parens e.g., "5.4307(2)" -> 5.4307
function cleanNum(val: string): number {
  if (!val) return NaN;
  const cleaned = val.replace(/['"]/g, '').replace(/\(\d+\)/g, '').trim();
  return parseFloat(cleaned);
}

function normalizeSymbol(raw: string): string {
  const letters = raw.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'X';
  return letters.charAt(0).toUpperCase() + letters.slice(1, 2).toLowerCase();
}

// Convert lattice parameters (a,b,c, alpha,beta,gamma) to 3x3 Cartesian lattice matrix
function paramsToLatticeMatrix(a: number, b: number, c: number, alphaDeg: number, betaDeg: number, gammaDeg: number): number[][] {
  const toRad = (d: number) => d * Math.PI / 180;
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
    [Number(a.toFixed(6)), 0, 0],
    [Number((b * cosG).toFixed(6)), Number((b * sinG).toFixed(6)), 0],
    [Number(cx.toFixed(6)), Number(cy.toFixed(6)), Number(cz.toFixed(6))]
  ];
}

// Evaluate a symmetry operation expression such as "-x+1/2", "y-x", "z+0.25"
function evalSymOpCoord(expr: string, x: number, y: number, z: number): number {
  const s = expr
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/x/g, `(${x})`)
    .replace(/y/g, `(${y})`)
    .replace(/z/g, `(${z})`);

  // Tokenize into signed terms (+ or -)
  const terms = s.match(/[+-]?[^+-]+/g) || [];
  let sum = 0;
  for (const term of terms) {
    let sign = 1;
    let body = term;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }
    body = body.replace(/[()]/g, '');
    if (body.includes('/')) {
      const [num, den] = body.split('/').map(Number);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        sum += sign * (num / den);
      }
    } else {
      const val = parseFloat(body);
      if (!isNaN(val)) {
        sum += sign * val;
      }
    }
  }
  // Wrap into [0, 1)
  let wrapped = sum % 1;
  if (wrapped < -1e-6) wrapped += 1;
  if (Math.abs(wrapped - 1) < 1e-6 || Math.abs(wrapped) < 1e-6) wrapped = 0;
  return wrapped;
}

// Split a CIF row respecting single/double quotes
function splitCIFLine(line: string): string[] {
  const tokens: string[] = [];
  const regex = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function parseCIF(content: string): CrystalStructure | null {
  try {
    const lines = content.split(/\r?\n/);
    let a = NaN, b = NaN, c = NaN;
    let alpha = 90, beta = 90, gamma = 90;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('_cell_length_a')) a = cleanNum(trimmed.split(/\s+/)[1]);
      else if (trimmed.startsWith('_cell_length_b')) b = cleanNum(trimmed.split(/\s+/)[1]);
      else if (trimmed.startsWith('_cell_length_c')) c = cleanNum(trimmed.split(/\s+/)[1]);
      else if (trimmed.startsWith('_cell_angle_alpha')) alpha = cleanNum(trimmed.split(/\s+/)[1]) || 90;
      else if (trimmed.startsWith('_cell_angle_beta')) beta = cleanNum(trimmed.split(/\s+/)[1]) || 90;
      else if (trimmed.startsWith('_cell_angle_gamma')) gamma = cleanNum(trimmed.split(/\s+/)[1]) || 90;
    }

    if (isNaN(a) && isNaN(b) && isNaN(c)) return null;
    a = isNaN(a) ? 10 : a;
    b = isNaN(b) ? a : b;
    c = isNaN(c) ? a : c;

    const lattice = paramsToLatticeMatrix(a, b, c, alpha, beta, gamma);

    // Parse all loop_ blocks to collect symmetry operations and atom sites
    const symOps: [string, string, string][] = [];
    const asymAtoms: { symbol: string; fx: number; fy: number; fz: number; isCartn: boolean }[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.startsWith('loop_')) {
        i++;
        const headers: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('_')) {
          headers.push(lines[i].trim().split(/\s+/)[0]);
          i++;
        }

        const isSymLoop = headers.some(
          h =>
            h.includes('_symmetry_equiv_pos_as_xyz') ||
            h.includes('_space_group_symop_operation_xyz')
        );
        const isAtomLoop = headers.some(h => h.startsWith('_atom_site_'));

        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (!rowLine || rowLine.startsWith('#') || rowLine.startsWith(';')) {
            i++;
            continue;
          }
          if (rowLine.startsWith('loop_') || rowLine.startsWith('_') || rowLine.startsWith('data_')) {
            break;
          }

          const parts = splitCIFLine(rowLine);
          if (isSymLoop && parts.length >= headers.length) {
            const xyzIdx = headers.findIndex(
              h =>
                h.includes('_symmetry_equiv_pos_as_xyz') ||
                h.includes('_space_group_symop_operation_xyz')
            );
            if (xyzIdx !== -1 && parts[xyzIdx]) {
              const coords = parts[xyzIdx].split(',').map(s => s.trim());
              if (coords.length === 3) {
                symOps.push([coords[0], coords[1], coords[2]]);
              }
            }
          } else if (isAtomLoop && parts.length >= headers.length) {
            let symIdx = headers.findIndex(h => h === '_atom_site_type_symbol');
            if (symIdx === -1) symIdx = headers.findIndex(h => h.includes('type_symbol'));
            if (symIdx === -1) symIdx = headers.findIndex(h => h.includes('label'));

            const xIdx = headers.findIndex(h => h.includes('fract_x') || h.includes('Cartn_x'));
            const yIdx = headers.findIndex(h => h.includes('fract_y') || h.includes('Cartn_y'));
            const zIdx = headers.findIndex(h => h.includes('fract_z') || h.includes('Cartn_z'));

            if (symIdx !== -1 && xIdx !== -1 && yIdx !== -1 && zIdx !== -1) {
              const symbol = normalizeSymbol(parts[symIdx]);
              const fx = cleanNum(parts[xIdx]);
              const fy = cleanNum(parts[yIdx]);
              const fz = cleanNum(parts[zIdx]);
              const isCartn = headers[xIdx].includes('Cartn');
              if (!isNaN(fx) && !isNaN(fy) && !isNaN(fz)) {
                asymAtoms.push({ symbol, fx, fy, fz, isCartn });
              }
            }
          }
          i++;
        }
        continue;
      }
      i++;
    }

    if (asymAtoms.length === 0) return null;

    const atoms: Atom[] = [];
    if (symOps.length > 1 && asymAtoms.every(at => !at.isCartn)) {
      // Expand asymmetric unit using space group symmetry operations and deduplicate fractional coords
      const fracList: { symbol: string; fx: number; fy: number; fz: number }[] = [];
      const tol = 1e-3;

      for (const at of asymAtoms) {
        for (const [opX, opY, opZ] of symOps) {
          const nfx = evalSymOpCoord(opX, at.fx, at.fy, at.fz);
          const nfy = evalSymOpCoord(opY, at.fx, at.fy, at.fz);
          const nfz = evalSymOpCoord(opZ, at.fx, at.fy, at.fz);

          const isDup = fracList.some(existing => {
            if (existing.symbol !== at.symbol) return false;
            const dx = Math.abs(existing.fx - nfx);
            const dy = Math.abs(existing.fy - nfy);
            const dz = Math.abs(existing.fz - nfz);
            const wrapDist = (d: number) => Math.min(d, Math.abs(1 - d));
            return wrapDist(dx) < tol && wrapDist(dy) < tol && wrapDist(dz) < tol;
          });

          if (!isDup) {
            fracList.push({ symbol: at.symbol, fx: nfx, fy: nfy, fz: nfz });
          }
        }
      }

      for (const item of fracList) {
        const x = item.fx * lattice[0][0] + item.fy * lattice[1][0] + item.fz * lattice[2][0];
        const y = item.fx * lattice[0][1] + item.fy * lattice[1][1] + item.fz * lattice[2][1];
        const z = item.fx * lattice[0][2] + item.fy * lattice[1][2] + item.fz * lattice[2][2];
        atoms.push({ symbol: item.symbol, x, y, z });
      }
    } else {
      for (const at of asymAtoms) {
        let x = at.fx, y = at.fy, z = at.fz;
        if (!at.isCartn) {
          x = at.fx * lattice[0][0] + at.fy * lattice[1][0] + at.fz * lattice[2][0];
          y = at.fx * lattice[0][1] + at.fy * lattice[1][1] + at.fz * lattice[2][1];
          z = at.fx * lattice[0][2] + at.fy * lattice[1][2] + at.fz * lattice[2][2];
        }
        atoms.push({ symbol: at.symbol, x, y, z });
      }
    }

    return {
      lattice,
      atoms,
      formula: generateFormula(atoms),
      detectedInfo: {
        ibrav: 0,
        a, b, c,
        alpha, beta, gamma
      }
    };
  } catch {
    return null;
  }
}

function parseXYZ(content: string): CrystalStructure | null {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 3) return null;

  const numAtoms = parseInt(lines[0].trim());
  if (isNaN(numAtoms) || numAtoms <= 0) return null;

  const commentLine = lines[1] || '';
  const atoms: Atom[] = [];

  for (let i = 2; i < lines.length && atoms.length < numAtoms; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 4) {
      const symbol = normalizeSymbol(parts[0]);
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        atoms.push({ symbol, x, y, z });
      }
    }
  }

  if (atoms.length === 0) return null;

  // Check for Extended XYZ Lattice="..." attribute on line 2
  const latticeMatch = commentLine.match(/Lattice\s*=\s*["']([^"']+)["']/i);
  if (latticeMatch && latticeMatch[1]) {
    const nums = latticeMatch[1].trim().split(/\s+/).map(Number);
    if (nums.length === 9 && nums.every(n => !isNaN(n))) {
      const lattice = [
        [nums[0], nums[1], nums[2]],
        [nums[3], nums[4], nums[5]],
        [nums[6], nums[7], nums[8]]
      ];
      return {
        lattice,
        atoms,
        formula: generateFormula(atoms),
        detectedInfo: calculateLatticeInfo(lattice)
      };
    }
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  atoms.forEach(a => {
    min.x = Math.min(min.x, a.x); min.y = Math.min(min.y, a.y); min.z = Math.min(min.z, a.z);
    max.x = Math.max(max.x, a.x); max.y = Math.max(max.y, a.y); max.z = Math.max(max.z, a.z);
  });

  const size = {
    x: Number(Math.max(10, max.x - min.x + 8).toFixed(4)),
    y: Number(Math.max(10, max.y - min.y + 8).toFixed(4)),
    z: Number(Math.max(10, max.z - min.z + 8).toFixed(4))
  };

  const lattice = [
    [size.x, 0, 0],
    [0, size.y, 0],
    [0, 0, size.z]
  ];

  return {
    lattice,
    atoms,
    formula: generateFormula(atoms),
    detectedInfo: {
      ibrav: 0,
      a: size.x,
      b: size.y,
      c: size.z,
      alpha: 90,
      beta: 90,
      gamma: 90
    }
  };
}

function parseVASP(content: string): CrystalStructure | null {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 8) return null;

  try {
    const scale = parseFloat(lines[1].trim());
    if (isNaN(scale) || scale === 0) return null;

    const rawLattice = [
      lines[2].trim().split(/\s+/).map(Number),
      lines[3].trim().split(/\s+/).map(Number),
      lines[4].trim().split(/\s+/).map(Number),
    ];
    if (rawLattice.some(row => row.length < 3 || row.slice(0, 3).some(isNaN))) return null;

    const lattice = rawLattice.map(row => [
      row[0] * Math.abs(scale),
      row[1] * Math.abs(scale),
      row[2] * Math.abs(scale)
    ]);

    const line5Tokens = lines[5].trim().split(/\s+/);
    let symbols: string[] = [];
    let counts: number[] = [];
    let coordStart = 7;

    if (isNaN(parseFloat(line5Tokens[0]))) {
      // VASP 5+ format: line 5 has element symbols, line 6 has counts
      symbols = line5Tokens.map(normalizeSymbol);
      counts = lines[6].trim().split(/\s+/).map(v => parseInt(v));
      coordStart = 7;
    } else {
      // VASP 4 format: line 5 has counts directly, try extracting symbols from comment line 0
      counts = line5Tokens.map(v => parseInt(v));
      const commentTokens = lines[0].trim().split(/\s+/).filter(Boolean);
      symbols = counts.map((_, idx) => normalizeSymbol(commentTokens[idx] || `El${idx + 1}`));
      coordStart = 6;
    }

    if (counts.some(isNaN) || counts.length === 0) return null;

    if (lines[coordStart]?.trim().toLowerCase().startsWith('s')) {
      coordStart++;
    }

    const modeChar = lines[coordStart]?.trim().toLowerCase()[0];
    if (modeChar !== 'd' && modeChar !== 'c' && modeChar !== 'k') return null;
    const isDirect = modeChar === 'd';
    coordStart++;

    const atoms: Atom[] = [];
    let currentIdx = 0;

    for (let sIdx = 0; sIdx < symbols.length; sIdx++) {
      const sym = symbols[sIdx];
      const count = counts[sIdx];
      for (let i = 0; i < count; i++) {
        if (!lines[coordStart + currentIdx]) break;
        const line = lines[coordStart + currentIdx].trim().split(/\s+/);
        let x = parseFloat(line[0]);
        let y = parseFloat(line[1]);
        let z = parseFloat(line[2]);

        if (isNaN(x) || isNaN(y) || isNaN(z)) break;

        if (isDirect) {
          const cx = x * lattice[0][0] + y * lattice[1][0] + z * lattice[2][0];
          const cy = x * lattice[0][1] + y * lattice[1][1] + z * lattice[2][1];
          const cz = x * lattice[0][2] + y * lattice[1][2] + z * lattice[2][2];
          x = cx; y = cy; z = cz;
        } else {
          x *= Math.abs(scale);
          y *= Math.abs(scale);
          z *= Math.abs(scale);
        }

        let if_pos: [number, number, number] | undefined;
        if (line.length >= 6 && /^[TFtf]$/.test(line[3])) {
          if_pos = [
            line[3].toUpperCase() === 'F' ? 0 : 1,
            line[4].toUpperCase() === 'F' ? 0 : 1,
            line[5].toUpperCase() === 'F' ? 0 : 1,
          ];
        }

        atoms.push({ symbol: sym, x, y, z, if_pos });
        currentIdx++;
      }
    }

    if (atoms.length === 0) return null;

    return {
      lattice,
      atoms,
      formula: generateFormula(atoms),
      detectedInfo: calculateLatticeInfo(lattice)
    };
  } catch {
    return null;
  }
}

function parseXSF(content: string): CrystalStructure | null {
  try {
    const lines = content.split(/\r?\n/);
    let lattice: number[][] = [];
    const atoms: Atom[] = [];

    const Z_TO_SYMBOL: Record<number, string> = {
      1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 10: 'Ne',
      11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 18: 'Ar', 19: 'K', 20: 'Ca',
      21: 'Sc', 22: 'Ti', 23: 'V', 24: 'Cr', 25: 'Mn', 26: 'Fe', 27: 'Co', 28: 'Ni', 29: 'Cu', 30: 'Zn',
      31: 'Ga', 32: 'Ge', 33: 'As', 34: 'Se', 35: 'Br', 36: 'Kr', 37: 'Rb', 38: 'Sr', 39: 'Y', 40: 'Zr',
      41: 'Nb', 42: 'Mo', 47: 'Ag', 48: 'Cd', 49: 'In', 50: 'Sn', 51: 'Sb', 52: 'Te', 53: 'I', 54: 'Xe',
      55: 'Cs', 56: 'Ba', 72: 'Hf', 73: 'Ta', 74: 'W', 78: 'Pt', 79: 'Au', 80: 'Hg', 82: 'Pb', 83: 'Bi'
    };

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if ((trimmed === 'PRIMVEC' || (trimmed === 'CONVVEC' && lattice.length === 0)) && i + 3 < lines.length) {
        lattice = [
          lines[i + 1].trim().split(/\s+/).slice(0, 3).map(parseFloat),
          lines[i + 2].trim().split(/\s+/).slice(0, 3).map(parseFloat),
          lines[i + 3].trim().split(/\s+/).slice(0, 3).map(parseFloat)
        ];
      }

      if ((trimmed === 'PRIMCOORD' || trimmed === 'ATOMS') && i + 1 < lines.length) {
        const atomCountLine = lines[i + 1].trim().split(/\s+/);
        let numAtoms = parseInt(atomCountLine[0]);
        let startIdx = i + 2;
        if (isNaN(numAtoms) || atomCountLine.length >= 4) {
          numAtoms = 10000;
          startIdx = i + 1;
        }

        for (let j = startIdx; j < lines.length && atoms.length < numAtoms; j++) {
          const parts = lines[j].trim().split(/\s+/);
          if (parts.length >= 4) {
            const zNum = parseInt(parts[0]);
            const sym = !isNaN(zNum) ? (Z_TO_SYMBOL[zNum] || 'X') : normalizeSymbol(parts[0]);
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              atoms.push({ symbol: sym, x, y, z });
            }
          } else {
            break;
          }
        }
      }
    }

    if (atoms.length === 0) return null;
    if (lattice.length < 3 || lattice.some(r => r.some(isNaN))) {
      lattice = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
    }

    return {
      lattice,
      atoms,
      formula: generateFormula(atoms),
      detectedInfo: calculateLatticeInfo(lattice)
    };
  } catch {
    return null;
  }
}

function parseQEInputFile(content: string): CrystalStructure | null {
  try {
    const lines = content.split(/\r?\n/);
    let lattice: number[][] = [];
    const atoms: Atom[] = [];

    const BOHR_TO_ANG = 0.5291772109;
    let alatAng = 0;
    let aParam = 0, bParam = 0, cParam = 0;

    // Scan &SYSTEM parameters for celldm(1) or A, B, C
    const celldm1Match = content.match(/celldm\s*\(\s*1\s*\)\s*=\s*([0-9.+-eEdD]+)/i);
    if (celldm1Match) {
      alatAng = parseFloat(celldm1Match[1].replace(/[dD]/g, 'e')) * BOHR_TO_ANG;
    }
    const aMatch = content.match(/(?:^|[\s,])a\s*=\s*([0-9.+-eEdD]+)/im);
    if (aMatch) {
      aParam = parseFloat(aMatch[1].replace(/[dD]/g, 'e'));
      if (!alatAng) alatAng = aParam;
    }
    const bMatch = content.match(/(?:^|[\s,])b\s*=\s*([0-9.+-eEdD]+)/im);
    if (bMatch) bParam = parseFloat(bMatch[1].replace(/[dD]/g, 'e'));
    const cMatch = content.match(/(?:^|[\s,])c\s*=\s*([0-9.+-eEdD]+)/im);
    if (cMatch) cParam = parseFloat(cMatch[1].replace(/[dD]/g, 'e'));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toUpperCase().startsWith('CELL_PARAMETERS')) {
        const unit = line.toLowerCase();
        let scale = 1.0;
        if (unit.includes('bohr')) scale = BOHR_TO_ANG;
        else if (unit.includes('alat') && alatAng > 0) scale = alatAng;

        if (i + 3 < lines.length) {
          lattice = [
            lines[i + 1].trim().split(/\s+/).slice(0, 3).map(v => parseFloat(v) * scale),
            lines[i + 2].trim().split(/\s+/).slice(0, 3).map(v => parseFloat(v) * scale),
            lines[i + 3].trim().split(/\s+/).slice(0, 3).map(v => parseFloat(v) * scale),
          ];
        }
      }
    }

    if (lattice.length < 3 && aParam > 0) {
      lattice = paramsToLatticeMatrix(aParam, bParam || aParam, cParam || aParam, 90, 90, 90);
    } else if (lattice.length < 3 && alatAng > 0) {
      lattice = paramsToLatticeMatrix(alatAng, alatAng, alatAng, 90, 90, 90);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toUpperCase().startsWith('ATOMIC_POSITIONS')) {
        const unit = line.toLowerCase();
        const isCrystal = unit.includes('crystal');
        const isBohr = unit.includes('bohr');
        const isAlat = unit.includes('alat');

        for (let j = i + 1; j < lines.length; j++) {
          const aLine = lines[j].trim();
          if (
            !aLine ||
            aLine.startsWith('!') ||
            aLine.startsWith('#') ||
            /^(K_POINTS|CELL_PARAMETERS|HUBBARD|CONSTRAINTS|OCCUPATIONS|ATOMIC_FORCES|\/|END)/i.test(aLine)
          ) {
            if (!aLine.startsWith('!') && !aLine.startsWith('#') && aLine !== '') break;
            continue;
          }
          const parts = aLine.split(/\s+/);
          if (parts.length >= 4) {
            const sym = normalizeSymbol(parts[0]);
            let x = parseFloat(parts[1].replace(/[dD]/g, 'e'));
            let y = parseFloat(parts[2].replace(/[dD]/g, 'e'));
            let z = parseFloat(parts[3].replace(/[dD]/g, 'e'));

            if (isBohr) {
              x *= BOHR_TO_ANG; y *= BOHR_TO_ANG; z *= BOHR_TO_ANG;
            } else if (isAlat && alatAng > 0) {
              x *= alatAng; y *= alatAng; z *= alatAng;
            } else if (isCrystal && lattice.length === 3) {
              const cx = x * lattice[0][0] + y * lattice[1][0] + z * lattice[2][0];
              const cy = x * lattice[0][1] + y * lattice[1][1] + z * lattice[2][1];
              const cz = x * lattice[0][2] + y * lattice[1][2] + z * lattice[2][2];
              x = cx; y = cy; z = cz;
            }

            let if_pos: [number, number, number] | undefined;
            if (parts.length >= 7) {
              const ix = parseInt(parts[4]);
              const iy = parseInt(parts[5]);
              const iz = parseInt(parts[6]);
              if (!isNaN(ix) && !isNaN(iy) && !isNaN(iz)) {
                if_pos = [ix, iy, iz];
              }
            }

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              atoms.push({ symbol: sym, x, y, z, if_pos });
            }
          }
        }
      }
    }

    if (atoms.length === 0) return null;
    if (lattice.length < 3 || lattice.some(r => r.some(isNaN))) {
      lattice = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
    }

    return {
      lattice,
      atoms,
      formula: generateFormula(atoms),
      detectedInfo: calculateLatticeInfo(lattice)
    };
  } catch {
    return null;
  }
}

function parsePDB(content: string): CrystalStructure | null {
  try {
    const lines = content.split(/\r?\n/);
    let lattice: number[][] | null = null;
    const atoms: Atom[] = [];

    for (const line of lines) {
      if (line.startsWith('CRYST1')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 7) {
          const a = parseFloat(parts[1]);
          const b = parseFloat(parts[2]);
          const c = parseFloat(parts[3]);
          const alpha = parseFloat(parts[4]);
          const beta = parseFloat(parts[5]);
          const gamma = parseFloat(parts[6]);
          if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
            lattice = paramsToLatticeMatrix(a, b, c, alpha || 90, beta || 90, gamma || 90);
          }
        }
      } else if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
        const x = parseFloat(line.slice(30, 38).trim());
        const y = parseFloat(line.slice(38, 46).trim());
        const z = parseFloat(line.slice(46, 54).trim());
        const elemCol = line.slice(76, 78).trim() || line.slice(12, 16).trim();
        const symbol = normalizeSymbol(elemCol);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          atoms.push({ symbol, x, y, z });
        }
      }
    }

    if (atoms.length === 0) return null;
    if (!lattice) {
      lattice = [[15, 0, 0], [0, 15, 0], [0, 0, 15]];
    }

    return {
      lattice,
      atoms,
      formula: generateFormula(atoms),
      detectedInfo: calculateLatticeInfo(lattice)
    };
  } catch {
    return null;
  }
}

function parseJSONStructure(content: string): CrystalStructure | null {
  try {
    const data = JSON.parse(content);
    // Support seal_project.json
    const target = data.structure || data;
    if (Array.isArray(target.lattice) && Array.isArray(target.atoms) && target.atoms.length > 0) {
      const atoms: Atom[] = target.atoms.map((a: any) => ({
        symbol: normalizeSymbol(String(a.symbol || 'X')),
        x: Number(a.x || 0),
        y: Number(a.y || 0),
        z: Number(a.z || 0),
        if_pos: a.if_pos
      }));
      return {
        lattice: target.lattice,
        atoms,
        formula: target.formula || generateFormula(atoms),
        detectedInfo: target.detectedInfo || calculateLatticeInfo(target.lattice)
      };
    }
    return null;
  } catch {
    return null;
  }
}

function generateFormula(atoms: Atom[]): string {
  const counts: Record<string, number> = {};
  atoms.forEach(a => counts[a.symbol] = (counts[a.symbol] || 0) + 1);
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([s, c]) => c > 1 ? `${s}${c}` : s)
    .join('');
}

function calculateLatticeInfo(lattice: number[][]): DetectedLatticeInfo {
  const aVec = lattice[0] || [10, 0, 0];
  const bVec = lattice[1] || [0, 10, 0];
  const cVec = lattice[2] || [0, 0, 10];

  const mag = (v: number[]) => Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
  const dot = (v1: number[], v2: number[]) => v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  
  const a = mag(aVec) || 10;
  const b = mag(bVec) || 10;
  const c = mag(cVec) || 10;

  const radToDeg = (rad: number) => rad * 180 / Math.PI;

  const alpha = radToDeg(Math.acos(Math.max(-1, Math.min(1, dot(bVec, cVec) / (b * c)))));
  const beta = radToDeg(Math.acos(Math.max(-1, Math.min(1, dot(aVec, cVec) / (a * c)))));
  const gamma = radToDeg(Math.acos(Math.max(-1, Math.min(1, dot(aVec, bVec) / (a * b)))));

  return {
    ibrav: 0,
    a, b, c,
    alpha: isNaN(alpha) ? 90 : alpha,
    beta: isNaN(beta) ? 90 : beta,
    gamma: isNaN(gamma) ? 90 : gamma
  };
}
