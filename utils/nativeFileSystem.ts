/**
 * Native File System Access API helper
 * Handles native directory selection, requesting readwrite permissions,
 * creating/saving project folders, and persisting handles in IndexedDB.
 */

import { CrystalStructure, QEParams } from '../types';
import { generateQEInput, generatePPInput, generatePHInput, generateConvergenceInputs, generateConvergenceBatchScript } from './qeGenerator';

const DB_NAME = 'seal_qe_storage';
const STORE_NAME = 'handles';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeHandle(key: string, value: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to store handle in IndexedDB:', err);
  }
}

export async function retrieveHandle(key: string): Promise<any | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function clearHandle(key: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch {}
}

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Verify or actively request readwrite permission for a directory handle.
 */
export async function getWritePermission(handle: any): Promise<boolean> {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' as const };
    if (typeof handle.queryPermission === 'function') {
      const q = await handle.queryPermission(opts);
      if (q === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      const r = await handle.requestPermission(opts);
      return r === 'granted';
    }
  } catch (err) {
    console.warn('getWritePermission failed:', err);
  }
  return false;
}

export interface SaveProjectFilesOptions {
  parentDirHandle?: any;
  projectDirHandle: any;
  parentDirName: string;
  projectFolderName: string;
  structure: CrystalStructure;
  params: QEParams;
  prefix: string;
  calculation: string;
}

/**
 * Write all Quantum ESPRESSO input files and project files into target directory
 */
export async function writeProjectInputFilesToDirectory(
  projectDirHandle: any,
  options: {
    structure: CrystalStructure;
    params: QEParams;
    prefix: string;
    calculation: string;
    parentDirName: string;
    projectFolderName: string;
  }
): Promise<{
  inputFileName: string;
  updatedParams: QEParams;
  inputContent: string;
  ppContent: string;
  phContent: string;
}> {
  const { structure, params, prefix, calculation, parentDirName, projectFolderName } = options;
  const inputFileName = `${calculation}.${prefix}.in`;

  // Output directory in input file updated to this project folder's path ('./')
  const updatedParams: QEParams = {
    ...params,
    control: {
      ...(params.control || {}),
      calculation: calculation,
      outdir: './', // Updated to this project folder's path
      prefix: prefix,
    } as any,
  };

  const inputContent = generateQEInput(structure, updatedParams);
  const ppContent = generatePPInput(updatedParams);
  const phContent = generatePHInput(updatedParams);

  // 1. Write the primary QE input file: ('calculation type'.'prefix'.in)
  const fileHandle = await projectDirHandle.getFileHandle(inputFileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(inputContent);
  await writable.close();

  // 2. Also write standard pw.in alias for convenience
  try {
    const pwInHandle = await projectDirHandle.getFileHandle('pw.in', { create: true });
    const pwInWritable = await pwInHandle.createWritable();
    await pwInWritable.write(inputContent);
    await pwInWritable.close();
  } catch {}

  // 3. Write postprocessing input (pp.in)
  try {
    const ppHandle = await projectDirHandle.getFileHandle('pp.in', { create: true });
    const ppWritable = await ppHandle.createWritable();
    await ppWritable.write(ppContent);
    await ppWritable.close();
  } catch {}

  // 4. Write phonon input (ph.in)
  try {
    const phHandle = await projectDirHandle.getFileHandle('ph.in', { create: true });
    const phWritable = await phHandle.createWritable();
    await phWritable.write(phContent);
    await phWritable.close();
  } catch {}

  // 5. Write executable MPI script: run_mpi.sh
  const scriptContent = `#!/bin/bash
# Quantum ESPRESSO MPI execution script
# Directory: ${parentDirName}/${projectFolderName}
# Output directory (outdir): ./
# Calculation type: ${calculation}

export OMP_NUM_THREADS=2
mpirun -np 4 pw.x -in ${inputFileName} > ${calculation}.${prefix}.out

echo "Finished QE ${calculation} calculation for ${prefix}."
`;
  const scriptHandle = await projectDirHandle.getFileHandle('run_mpi.sh', { create: true });
  const scriptWritable = await scriptHandle.createWritable();
  await scriptWritable.write(scriptContent);
  await scriptWritable.close();

  // 6. Write seal_project.json descriptor
  const projectData = {
    app: 'SEAL Quantum ESPRESSO Studio',
    version: '1.0',
    savedAt: new Date().toISOString(),
    parentDirectory: parentDirName,
    projectFolder: projectFolderName,
    fullPath: `${parentDirName}/${projectFolderName}`,
    calculation,
    prefix,
    outdir: './',
    formula: structure.formula || prefix,
    structure,
    params: updatedParams,
    inputFileName,
  };
  const projHandle = await projectDirHandle.getFileHandle('seal_project.json', { create: true });
  const projWritable = await projHandle.createWritable();
  await projWritable.write(JSON.stringify(projectData, null, 2));
  await projWritable.close();

  // 7. Write README.txt
  const readmeContent = `Quantum ESPRESSO Project Folder
==================================================
Project Folder: ${projectFolderName}
Parent Directory: ${parentDirName}
Calculation Mode: ${calculation.toUpperCase()}
Prefix: ${prefix}
Output Directory (outdir): ./

Input Files Saved In This Folder:
- ${inputFileName} : Primary Quantum ESPRESSO input file (${calculation} mode)
- pw.in            : Standard alias of the input file
- pp.in            : Post-processing calculation input
- ph.in            : Phonon calculation input
- run_mpi.sh       : Executable bash MPI runner script
- seal_project.json: SEAL Quantum ESPRESSO Studio project file

To run calculation directly from your terminal:
  cd "${projectFolderName}"
  bash run_mpi.sh
Or:
  mpirun -np 4 pw.x -in ${inputFileName} > ${calculation}.${prefix}.out
`;
  try {
    const readmeHandle = await projectDirHandle.getFileHandle('README.txt', { create: true });
    const readmeWritable = await readmeHandle.createWritable();
    await readmeWritable.write(readmeContent);
    await readmeWritable.close();
  } catch (err) {
    console.warn('Failed to write README.txt:', err);
  }

  // 8. If convergence testing is enabled, write all generated convergence input files
  if (params?.system?.convergence_test?.enabled) {
    try {
      const convFiles = generateConvergenceInputs(structure, updatedParams);
      if (convFiles.length > 0) {
        const convDir = await projectDirHandle.getDirectoryHandle('convergence_tests', { create: true });
        for (const cf of convFiles) {
          const cfHandle = await convDir.getFileHandle(cf.filename, { create: true });
          const cfWritable = await cfHandle.createWritable();
          await cfWritable.write(cf.content);
          await cfWritable.close();
        }
        const batchHandle = await convDir.getFileHandle('run_convergence.sh', { create: true });
        const batchWritable = await batchHandle.createWritable();
        await batchWritable.write(generateConvergenceBatchScript(convFiles));
        await batchWritable.close();
      }
    } catch (err) {
      console.warn('Failed to save convergence input files into directory handle:', err);
    }
  }

  // 9. Copy selected pseudopotential (.UPF) files from /pseudopot/ into ./pseudo/ inside the project folder
  try {
    const speciesValues = Object.values(updatedParams.atomic_species || {});
    if (speciesValues.length > 0) {
      const pseudoDir = await projectDirHandle.getDirectoryHandle('pseudo', { create: true });
      for (const sp of speciesValues) {
        if (!sp.pseudo) continue;
        try {
          let resp = await fetch(`./public/pseudopot/${encodeURIComponent(sp.pseudo)}`);
          if (!resp.ok) {
            resp = await fetch(`./pseudopot/${encodeURIComponent(sp.pseudo)}`);
          }
          if (resp.ok) {
            const upfText = await resp.text();
            const upfHandle = await pseudoDir.getFileHandle(sp.pseudo, { create: true });
            const upfWritable = await upfHandle.createWritable();
            await upfWritable.write(upfText);
            await upfWritable.close();
          }
        } catch (upfErr) {
          console.warn(`Could not copy UPF file ${sp.pseudo}:`, upfErr);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to create pseudo directory or copy UPF files:', err);
  }

  return {
    inputFileName,
    updatedParams,
    inputContent,
    ppContent,
    phContent,
  };
}
