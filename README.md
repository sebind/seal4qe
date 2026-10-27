# seal4QE — Quantum ESPRESSO Studio

**Live Application:** [https://sebind.github.io/seal4qe/](https://sebind.github.io/seal4qe/)

**Seal** is a 100% client-side, interactive 3D crystal structure studio and input file generator for **Quantum ESPRESSO** (`pw.x`, `pp.x`, `ph.x`, and automated convergence testing). It runs entirely in the browser with **zero external API calls** or backend servers required.

---

## Key Features

### 1. Interactive 3D Crystal Structure Viewer & Modelling Studio
- **Real-Time 3D Rendering**: Built with Three.js and React Three Fiber (`ball-and-stick`, `space-filling`, and `atomic` modes) with orthographic/perspective camera switching, crystallographic axis alignment (`a`, `b`, `c`, `a*`, `b*`, `c*`), and reciprocal lattice Brillouin-zone / $k$-point grid visualization.
- **Structure Builder & Defect Engineering**:
  - **Supercell Generator**: Expand unit cells along $(N_a \times N_b \times N_c)$.
  - **Surface Slab Cleaver**: Cleave crystal planes by Miller indices $(hkl)$ with configurable slab layers and vacuum thickness.
  - **Point Defects & Doping**: Create atomic vacancies, substitutional dopants, or interstitials via an interactive Periodic Table modal.
  - **Coordinate & Constraint Editing**: Toggle selective dynamics (`if_pos` flags `0`/`1` along $x, y, z$) to freeze or relax individual atoms or layers.
- **Automatic Symmetry & Bravais Lattice Detection**: Automatically detects Bravais lattice parameters ($a, b, c, \alpha, \beta, \gamma$, `celldm(1..6)`, and `ibrav`).

### 2. 100% Local Structure File Parser
Instantly parses structure files directly in the browser without any cloud or AI API calls:
- **CIF (`.cif`)**: Supports fractional & Cartesian coordinates, quoted loop values, and automatic space-group symmetry operation expansion (`_symmetry_equiv_pos_as_xyz` / `_space_group_symop_operation_xyz`).
- **XYZ (`.xyz`)**: Supports standard XYZ and Extended XYZ (`Lattice="..."` metadata).
- **VASP (`POSCAR` / `CONTCAR` / `.vasp`)**: Supports VASP 4 & 5 formats, `Direct` and `Cartesian` coordinates, and `Selective dynamics` flags.
- **Quantum ESPRESSO (`.in` / `.pw` / `.pwi`)**: Parses `CELL_PARAMETERS` (`angstrom`, `bohr`, `alat`), `&SYSTEM` (`celldm`, `A`, `B`, `C`), and `ATOMIC_POSITIONS` (`angstrom`, `bohr`, `alat`, `crystal`).
- **XCrySDen (`.xsf`)**: Supports `PRIMVEC`, `CONVVEC`, `PRIMCOORD`, and `ATOMS` blocks.
- **PDB (`.pdb`)**: Parses `CRYST1` unit cells and `ATOM`/`HETATM` records.
- **Seal Project JSON (`seal_project.json`)**: Reload previously saved Seal workspace projects.

### 3. Built-In Pseudopotential Library (372 `.UPF` Files)
- Ships with 372 curated PSLibrary pseudopotentials in `public/pseudopot/` covering the periodic table.
- Automatically classifies each `.UPF` file by type (**PAW**, **USPP**, **NC**), exchange-correlation functional (**PBE**, **PBEsol**, **LDA**), relativistic treatment (**Scalar-Rel**, **Full-Rel**), and valence configuration.
- One-click bulk switching between PAW (`kjpaw`) and Ultrasoft (`rrkjus`/`van`) pseudopotentials across all species in the structure, plus direct `.UPF` file downloads.

### 4. Complete Quantum ESPRESSO Input & Script Generation
- **`pw.x` Input (`<calculation>.<prefix>.in`)**: Full configuration for `scf`, `nscf`, `bands`, `relax`, `vc-relax`, and `md` calculations, including `&CONTROL`, `&SYSTEM`, `&ELECTRONS`, `&IONS`, `&CELL`, `ATOMIC_SPECIES`, `ATOMIC_POSITIONS`, `K_POINTS`, `CELL_PARAMETERS`, spin polarization (`nspin`), and `HUBBARD (DFT+U)` manifolds.
- **`pp.x` & `ph.x` Inputs**: Post-processing charge/potential plotting (`pp.in`) and phonon dispersion (`ph.in`) input generation.
- **Automated Convergence Testing**: Generates complete input suites and batch execution scripts (`run_convergence.sh`) for kinetic energy cutoff (`ecutwfc`) and $k$-point grid (`K_POINTS`) convergence studies.
- **MPI / OpenMP & SLURM Runner Scripts**: Generates ready-to-run `run_mpi.sh` (`mpirun`, `mpiexec`, `srun`) and HPC SLURM batch scripts.

### 5. Interactive Results & Trajectory Dashboard
- Inspect electronic SCF convergence curves, ionic relaxation trajectories (BFGS energy, total/max forces, cell volume, and hydrostatic pressure/stress tensors), and preview any ionic relaxation frame directly in the 3D viewport.

### 6. Direct PC Folder Save & Self-Contained ZIP Export
- **Native Directory Access**: In Chromium-based browsers, writes the entire project folder (`<calculation>.<prefix>.in`, `pw.in`, `pp.in`, `ph.in`, `run_mpi.sh`, `seal_project.json`, `convergence_tests/`, and `./pseudo/*.UPF` files) directly to a local folder on disk.
- **ZIP Bundle Download**: Downloads a complete `.zip` project folder for immediate use on local workstations or HPC clusters.

---

## Project Structure

```text
seal4qe/
├── assets/
│   └── app.js                   # Prebuilt production JS bundle for GitHub Pages branch hosting
├── components/
│   ├── ModellingPanel.tsx       # Supercells, surface slabs, doping & coordinate transforms
│   ├── PeriodicTableModal.tsx   # Interactive periodic table for element selection
│   ├── ResultsDashboard.tsx     # SCF/ionic convergence charts, forces, stress & trajectory player
│   ├── RightPanel.tsx           # Input file preview, MPI runner & results tabs
│   ├── SettingsPanel.tsx        # QE namelist configuration & pseudopotential selector
│   └── StructureViewer.tsx      # Interactive 3D Three.js / React Three Fiber crystal canvas
├── public/
│   └── pseudopot/               # 372 PSLibrary .UPF pseudopotential files
├── utils/
│   ├── latticeUtils.ts          # Bravais lattice detection & reciprocal space utilities
│   ├── localParsers.ts          # Client-side parsers for CIF, XYZ, POSCAR, XSF, QE, PDB, JSON
│   ├── modellingUtils.ts        # Supercell, slab cleaving & defect algorithms
│   ├── nativeFileSystem.ts      # Browser File System Access API & IndexedDB handle persistence
│   ├── pseudopotentials.ts      # Pseudopotential catalog & metadata classifier
│   ├── qeGenerator.ts           # Quantum ESPRESSO pw.x, pp.x, ph.x & convergence file generator
│   ├── qeParser.ts              # QE output parser & ionic trajectory builder
│   ├── qeRunner.ts              # MPI/SLURM script generator & ZIP bundler
│   └── symmetryUtils.ts         # Crystallographic symmetry utilities
├── App.tsx                      # Main application state & layout
├── constants.ts                 # Default QE parameters, atomic masses & CPK element colors
├── index.html                   # Entry HTML
├── index.tsx                    # React DOM entry point
├── types.ts                     # TypeScript interfaces
└── vite.config.ts               # Vite configuration with GitHub Pages root bundle sync
```

---

## Local Development

**Prerequisites:** Node.js (v18+)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local development server (with Hot Module Replacement):**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

3. **Build for production:**
   ```bash
   npm run build
   ```
   > **Note:** Running `npm run build` compiles the TypeScript/React application into `dist/assets/app.js` and automatically syncs it to `assets/app.js` at the repository root so that GitHub Pages can serve the `main` branch directly.

---

## Deploying Updates to GitHub Pages

This repository is configured to work out of the box with GitHub Pages set to **Deploy from a branch (`main` / root)**:

1. After making any code changes in `.ts` / `.tsx` files, rebuild the production bundle:
   ```bash
   npm run build
   ```
2. Commit and push to `main`:
   ```bash
   git add -A
   git commit -m "Update application"
   git push origin main
   ```
3. GitHub Pages will automatically publish the updated site to [https://sebind.github.io/seal4qe/](https://sebind.github.io/seal4qe/).
