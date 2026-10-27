# Seal — Quantum ESPRESSO Studio

A client-side, 3D interactive crystal structure studio and input generator for **Quantum ESPRESSO** (`pw.x`, `pp.x`, `ph.x`, and automated convergence testing). Runs 100% in the browser with **no external API calls** or backend required.

## Key Features

- **100% Client-Side Structure Parser**: Instant local parsing for `.cif` (including space-group symmetry expansion), `.xyz` (standard & extended XYZ), VASP (`POSCAR` / `CONTCAR` / `.vasp`), XCrySDen (`.xsf`), `.pdb`, Quantum ESPRESSO (`.in` / `.pw`), and `seal_project.json`.
- **Interactive 3D Crystal Viewer & Builder**: Supercell generation, surface slab cleaving, vacancy/substitution doping, Bravais lattice auto-detection, and interactive periodic table selector.
- **Built-in Pseudopotential Library**: Includes 372 curated PSLibrary `.UPF` files (PAW, USPP, NC) across the periodic table.
- **Complete Input & Script Generation**: Generates `pw.x`, `pp.x`, `ph.x`, convergence test suites (`ecutwfc` & `K_POINTS`), and MPI/OpenMP/SLURM job scripts.
- **Direct PC Folder Save & ZIP Export**: Save directly to local disk via the browser File System Access API or download self-contained project `.zip` archives.

## Local Development

**Prerequisites:** Node.js (v18+)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production static bundle (outputs to ./dist)
npm run build

# Preview production build locally
npm run preview
```

## Hosting on GitHub Pages

This project is pre-configured with relative asset paths (`base: './'` in `vite.config.ts`), a `public/.nojekyll` file, and an automated GitHub Actions deployment workflow (`.github/workflows/deploy.yml`).

### Steps to Deploy:

1. Push this repository to GitHub (to the `main` or `master` branch).
2. In your GitHub repository, navigate to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. The **Deploy to GitHub Pages** workflow will automatically build the app and publish it to `https://<your-username>.github.io/<your-repo-name>/`.
