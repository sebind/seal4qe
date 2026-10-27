
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { CrystalStructure, QEParams, QESpecies, Atom } from './types';
import { DEFAULT_QE_PARAMS, ELEMENT_MASSES } from './constants';
import StructureViewer from './components/StructureViewer';
import SettingsPanel from './components/SettingsPanel';
import ModellingPanel from './components/ModellingPanel';
import RightPanel from './components/RightPanel';
import { 
  generateQEInput, 
  generatePPInput, 
  generatePHInput, 
  generateConvergenceInputs, 
  generateConvergenceBatchScript, 
  ConvergenceFileInfo 
} from './utils/qeGenerator';
import { tryLocalParse, suggestKPoints } from './utils/localParsers';
import { detectBravaisLattice } from './utils/latticeUtils';
import { getDefaultPseudopotential } from './utils/pseudopotentials';
import { createRunDirectoryZip, generateCompleteCalculationResult } from './utils/qeRunner';
import { 
  isFileSystemAccessSupported, 
  isRunningInIframe, 
  getWritePermission, 
  writeProjectInputFilesToDirectory, 
  storeHandle, 
  retrieveHandle, 
  clearHandle 
} from './utils/nativeFileSystem';
import { 
  FileUp, FileCode, Loader2, Download, Box, 
  SlidersHorizontal, X, Eye, Settings, Compass, 
  BarChart3, Play, Save, FolderDown, FolderCheck, CheckCircle2, HardDrive,
  ExternalLink
} from 'lucide-react';
import { RightPanelView, CalculationResult } from './types';

// Preset sample structures for instant 1-click loading
const PRESET_STRUCTURES: Record<string, { label: string; structure: CrystalStructure }> = {
  si: {
    label: "Silicon (Diamond Si8)",
    structure: {
      lattice: [
        [5.4307, 0, 0],
        [0, 5.4307, 0],
        [0, 0, 5.4307]
      ],
      atoms: [
        { symbol: "Si", x: 0, y: 0, z: 0 },
        { symbol: "Si", x: 2.71535, y: 2.71535, z: 0 },
        { symbol: "Si", x: 0, y: 2.71535, z: 2.71535 },
        { symbol: "Si", x: 2.71535, y: 0, z: 2.71535 },
        { symbol: "Si", x: 1.357675, y: 1.357675, z: 1.357675 },
        { symbol: "Si", x: 4.073025, y: 4.073025, z: 1.357675 },
        { symbol: "Si", x: 1.357675, y: 4.073025, z: 4.073025 },
        { symbol: "Si", x: 4.073025, y: 1.357675, z: 4.073025 },
      ],
      formula: "Si8",
      detectedInfo: { ibrav: 0, a: 5.4307, b: 5.4307, c: 5.4307, alpha: 90, beta: 90, gamma: 90 }
    }
  },
  graphene: {
    label: "Graphene (C2 Monolayer)",
    structure: {
      lattice: [
        [2.46, 0, 0],
        [-1.23, 2.1304, 0],
        [0, 0, 12.0]
      ],
      atoms: [
        { symbol: "C", x: 0, y: 0, z: 6.0 },
        { symbol: "C", x: 0, y: 1.4202, z: 6.0 }
      ],
      formula: "C2",
      detectedInfo: { ibrav: 0, a: 2.46, b: 2.46, c: 12.0, alpha: 90, beta: 90, gamma: 120 }
    }
  },
  tio2: {
    label: "TiO2 (Rutile)",
    structure: {
      lattice: [
        [4.5937, 0, 0],
        [0, 4.5937, 0],
        [0, 0, 2.9587]
      ],
      atoms: [
        { symbol: "Ti", x: 0, y: 0, z: 0 },
        { symbol: "Ti", x: 2.29685, y: 2.29685, z: 1.47935 },
        { symbol: "O", x: 1.3965, y: 1.3965, z: 0 },
        { symbol: "O", x: 3.1972, y: 3.1972, z: 0 },
        { symbol: "O", x: 3.69335, y: 0.89985, z: 1.47935 },
        { symbol: "O", x: 0.89985, y: 3.69335, z: 1.47935 },
      ],
      formula: "Ti2O4",
      detectedInfo: { ibrav: 0, a: 4.5937, b: 4.5937, c: 2.9587, alpha: 90, beta: 90, gamma: 90 }
    }
  },
  srtio3: {
    label: "SrTiO3 (Perovskite)",
    structure: {
      lattice: [
        [3.905, 0, 0],
        [0, 3.905, 0],
        [0, 0, 3.905]
      ],
      atoms: [
        { symbol: "Sr", x: 0, y: 0, z: 0 },
        { symbol: "Ti", x: 1.9525, y: 1.9525, z: 1.9525 },
        { symbol: "O", x: 1.9525, y: 1.9525, z: 0 },
        { symbol: "O", x: 1.9525, y: 0, z: 1.9525 },
        { symbol: "O", x: 0, y: 1.9525, z: 1.9525 },
      ],
      formula: "SrTiO3",
      detectedInfo: { ibrav: 0, bravaisName: "Cubic P (sc)", a: 3.905, b: 3.905, c: 3.905, alpha: 90, beta: 90, gamma: 90 }
    }
  },
  gaas: {
    label: "GaAs (Zincblende)",
    structure: {
      lattice: [
        [5.6533, 0, 0],
        [0, 5.6533, 0],
        [0, 0, 5.6533]
      ],
      atoms: [
        { symbol: "Ga", x: 0, y: 0, z: 0 },
        { symbol: "Ga", x: 2.82665, y: 2.82665, z: 0 },
        { symbol: "Ga", x: 0, y: 2.82665, z: 2.82665 },
        { symbol: "Ga", x: 2.82665, y: 0, z: 2.82665 },
        { symbol: "As", x: 1.413325, y: 1.413325, z: 1.413325 },
        { symbol: "As", x: 4.239975, y: 4.239975, z: 1.413325 },
        { symbol: "As", x: 1.413325, y: 4.239975, z: 4.239975 },
        { symbol: "As", x: 4.239975, y: 1.413325, z: 4.239975 },
      ],
      formula: "As4Ga4",
      detectedInfo: { ibrav: 0, bravaisName: "Cubic F (fcc)", a: 5.6533, b: 5.6533, c: 5.6533, alpha: 90, beta: 90, gamma: 90 }
    }
  },
  fe: {
    label: "Iron (BCC Fe2)",
    structure: {
      lattice: [
        [2.8665, 0, 0],
        [0, 2.8665, 0],
        [0, 0, 2.8665]
      ],
      atoms: [
        { symbol: "Fe", x: 0, y: 0, z: 0 },
        { symbol: "Fe", x: 1.43325, y: 1.43325, z: 1.43325 }
      ],
      formula: "Fe2",
      detectedInfo: { ibrav: 0, bravaisName: "Cubic I (bcc)", a: 2.8665, b: 2.8665, c: 2.8665, alpha: 90, beta: 90, gamma: 90 }
    }
  }
};

const App: React.FC = () => {
  const [structure, setStructure] = useState<CrystalStructure | null>(null);
  const [params, setParams] = useState<QEParams>(DEFAULT_QE_PARAMS);
  const [isLoading, setIsLoading] = useState(false);
  const [pwOutput, setPwOutput] = useState('');
  const [ppOutput, setPpOutput] = useState('');
  const [phOutput, setPhOutput] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [localParseStatus, setLocalParseStatus] = useState<string | null>(null);

  // Responsive sidebar and mobile drawer state
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'settings' | 'model'>('settings');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [activeRightView, setActiveRightView] = useState<RightPanelView>('input');
  const [activeInputTab, setActiveInputTab] = useState<'pw' | 'pp' | 'ph' | 'convergence'>('pw');
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [trajectoryPreviewStructure, setTrajectoryPreviewStructure] = useState<CrystalStructure | null>(null);
  const [activeMobileDrawer, setActiveMobileDrawer] = useState<'model' | 'settings' | 'input' | null>(null);

  // Local Directory & Project Save State (Native Directory Access)
  const [savedDirectoryName, setSavedDirectoryName] = useState<string | null>(null);
  const [savedDirectoryHandle, setSavedDirectoryHandle] = useState<any>(null);
  const [parentDirHandle, setParentDirHandle] = useState<any>(null);
  const [parentDirName, setParentDirName] = useState<string | null>(null);
  const [projectFolderName, setProjectFolderName] = useState<string | null>(null);
  const [showIframeNotice, setShowIframeNotice] = useState(false);
  const [saveStatusNotification, setSaveStatusNotification] = useState<{
    message: string;
    detail?: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  // Restore saved directory handle from IndexedDB on startup
  useEffect(() => {
    const restoreSavedHandle = async () => {
      try {
        const storedParent = await retrieveHandle('parentDirHandle');
        const storedProject = await retrieveHandle('projectDirHandle');
        const storedParentName = await retrieveHandle('parentDirName');
        const storedProjectName = await retrieveHandle('projectFolderName');
        if (storedProject && storedProjectName) {
          setSavedDirectoryHandle(storedProject);
          setParentDirHandle(storedParent);
          setParentDirName(storedParentName);
          setProjectFolderName(storedProjectName);
          setSavedDirectoryName(storedParentName ? `${storedParentName}/${storedProjectName}` : storedProjectName);
        }
      } catch (err) {
        console.warn('Could not restore handle from storage:', err);
      }
    };
    restoreSavedHandle();
  }, []);

  // Dynamically generated convergence testing files
  const convergenceFiles = useMemo(() => {
    return generateConvergenceInputs(structure, params);
  }, [structure, params]);

  // Keyboard shortcuts: Escape to close modal, Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        if (showIframeNotice) setShowIframeNotice(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showIframeNotice, savedDirectoryHandle, structure, params, parentDirName, projectFolderName]);

  // Load default silicon structure on startup if no structure loaded
  useEffect(() => {
    if (!structure) {
      loadPresetStructure('si');
    }
  }, []);

  // Helper to calculate chemical formula from atom list
  const calculateFormula = (atoms: Atom[]) => {
    if (!atoms || atoms.length === 0) return 'pwscf';
    const counts: Record<string, number> = {};
    atoms.forEach(a => {
        if (a && a.symbol) {
            counts[a.symbol] = (counts[a.symbol] || 0) + 1;
        }
    });
    const formulaStr = Object.entries(counts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([sym, count]) => count > 1 ? `${sym}${count}` : sym)
        .join('');
    return formulaStr || 'pwscf';
  };

  // Synchronize atomic species metadata (pseudo, mass, etc.) and auto-detect Bravais lattice with current structure
  const handleStructureChange = useCallback((newStructure: CrystalStructure) => {
    if (!newStructure) return;
    
    const newAtoms = newStructure.atoms || [];
    const newFormula = calculateFormula(newAtoms);
    const activeSymbols = Array.from(new Set(newAtoms.map(a => a.symbol)));
    
    // Capture old formula from state before it updates for the prefix-update logic
    const oldFormula = structure?.formula || 'pwscf';

    // Automatically detect Bravais lattice (ibrav) and constants from structure.lattice
    const detected = detectBravaisLattice(newStructure.lattice, newStructure.detectedInfo?.ibrav);
    const toRad = (deg: number) => deg * Math.PI / 180;

    setStructure({
        ...newStructure,
        atoms: newAtoms,
        formula: newFormula,
        detectedInfo: {
            ibrav: newStructure.detectedInfo?.ibrav ?? 0,
            bravaisName: detected.bravaisName,
            a: detected.a,
            b: detected.b,
            c: detected.c,
            alpha: detected.alpha,
            beta: detected.beta,
            gamma: detected.gamma,
        }
    });

    setParams(prev => {
        if (!prev) return DEFAULT_QE_PARAMS;
        
        // Build a fresh species record to ensure synchronization
        const nextSpecies: Record<string, QESpecies> = {};
        const currentSpecies = prev.atomic_species || {};
        
        activeSymbols.forEach(sym => {
            if (currentSpecies[sym]) {
                // Keep existing settings if the species was already there
                nextSpecies[sym] = currentSpecies[sym];
            } else {
                // Initialize default settings for a newly added species
                nextSpecies[sym] = {
                    symbol: sym,
                    mass: ELEMENT_MASSES[sym] || 1.0,
                    pseudo: getDefaultPseudopotential(sym),
                    magnetization: 0,
                    hubbard_u: 0,
                    hubbard_manifold: ''
                };
            }
        });

        // Determine if prefix should be updated (if it was the previous formula or default)
        const currentPrefix = prev.control?.prefix || 'pwscf';
        const shouldUpdatePrefix = currentPrefix === oldFormula || currentPrefix === 'pwscf';
        const nextIbrav = prev.system?.ibrav ?? 0;
        
        return {
            ...prev,
            atomic_species: nextSpecies,
            control: {
                ...(prev.control || {}),
                prefix: shouldUpdatePrefix ? newFormula : currentPrefix
            } as any,
            system: {
                ...(prev.system || {}),
                ibrav: nextIbrav,
                a: detected.a,
                b: detected.b,
                c: detected.c,
                celldm: detected.celldm,
                cosab: parseFloat(Math.cos(toRad(detected.gamma)).toFixed(6)),
                cosac: parseFloat(Math.cos(toRad(detected.beta)).toFixed(6)),
                cosbc: parseFloat(Math.cos(toRad(detected.alpha)).toFixed(6)),
            } as any
        };
    });
  }, [structure]);

  // Regenerate output when structure or params change
  useEffect(() => {
    setPwOutput(generateQEInput(structure, params));
    setPpOutput(generatePPInput(params));
    setPhOutput(generatePHInput(params));
  }, [structure, params]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (e.g., limit to 5MB for parsing)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("File is too large (max 5MB). Please upload a smaller structure file.");
      if (event.target) event.target.value = '';
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const text = await file.text();
      
      const parsedStructure = tryLocalParse(text, file.name);

      if (!parsedStructure || !parsedStructure.atoms || parsedStructure.atoms.length === 0) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        let hint = "Supported formats: CIF (.cif), XYZ (.xyz), VASP (POSCAR/CONTCAR/.vasp), XCrySDen (.xsf), PDB (.pdb), or Quantum ESPRESSO (.in/.pw).";
        if (ext === 'cif') hint = "Ensure this is a valid .cif file with _cell_length and _atom_site sections.";
        else if (ext === 'vasp' || file.name.toLowerCase().includes('poscar')) hint = "Ensure the POSCAR/CONTCAR file has valid lattice vectors and atomic coordinates.";
        else if (ext === 'xsf') hint = "Ensure the XSF file contains PRIMVEC/PRIMCOORD or ATOMS sections.";
        throw new Error(`Could not parse structure file. ${hint}`);
      }

      const suggestedK = suggestKPoints(parsedStructure);
      
      // Initialize atomic species based on structure
      const uniqueSymbols = Array.from(new Set(parsedStructure.atoms.map(a => a.symbol)));
      const newSpecies: Record<string, QESpecies> = {};
      uniqueSymbols.forEach(sym => {
          newSpecies[sym] = {
              symbol: sym,
              mass: ELEMENT_MASSES[sym] || 1.0,
              pseudo: getDefaultPseudopotential(sym),
              magnetization: 0,
              hubbard_u: 0,
              hubbard_manifold: ''
          };
      });

      // Process detected lattice info
      const detected = detectBravaisLattice(parsedStructure.lattice, parsedStructure.detectedInfo?.ibrav);
      const toRad = (deg: number) => deg * Math.PI / 180;
      
      const detectedSystem = {
          ibrav: 0,
          a: detected.a,
          b: detected.b,
          c: detected.c,
          celldm: detected.celldm,
          cosab: parseFloat(Math.cos(toRad(detected.gamma || 90)).toFixed(6)),
          cosac: parseFloat(Math.cos(toRad(detected.beta || 90)).toFixed(6)),
          cosbc: parseFloat(Math.cos(toRad(detected.alpha || 90)).toFixed(6)),
      };
      const latticeMode: 'celldm' | 'abc' = 'abc';

      setStructure({
        ...parsedStructure,
        detectedInfo: {
          ibrav: 0,
          bravaisName: detected.bravaisName,
          a: detected.a,
          b: detected.b,
          c: detected.c,
          alpha: detected.alpha,
          beta: detected.beta,
          gamma: detected.gamma,
        }
      });
      setParams(prev => ({
        ...(prev || DEFAULT_QE_PARAMS),
        control: { ...((prev || DEFAULT_QE_PARAMS).control || {}), prefix: parsedStructure.formula } as any,
        system: {
            ...((prev || DEFAULT_QE_PARAMS).system || {}),
            ...detectedSystem
        } as any,
        k_points: {
            ...((prev || DEFAULT_QE_PARAMS).k_points || {}),
            values: suggestedK
        } as any,
        atomic_species: newSpecies,
        lattice_entry_mode: latticeMode
      }));
      setCalculationResult(
        generateCompleteCalculationResult({
          structure: parsedStructure,
          params: DEFAULT_QE_PARAMS,
          calculationType: 'vc-relax',
        })
      );

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to parse file.");
    } finally {
      setIsLoading(false);
      if (event.target) event.target.value = '';
    }
  };

  const loadPresetStructure = (presetKey: string) => {
    const preset = PRESET_STRUCTURES[presetKey];
    if (!preset) return;
    const { structure: newStruct } = preset;
    
    const uniqueSymbols = Array.from(new Set(newStruct.atoms.map(a => a.symbol)));
    const newSpecies: Record<string, QESpecies> = {};
    uniqueSymbols.forEach(sym => {
        newSpecies[sym] = {
            symbol: sym,
            mass: ELEMENT_MASSES[sym] || 1.0,
            pseudo: `${sym}.pbe-n-kjpaw_psl.1.0.0.UPF`,
            magnetization: 0,
            hubbard_u: 0,
            hubbard_manifold: ''
        };
    });

    const detected = detectBravaisLattice(newStruct.lattice, newStruct.detectedInfo?.ibrav);
    const toRad = (deg: number) => deg * Math.PI / 180;
    
    const detectedSystem = {
        ibrav: 0,
        a: detected.a,
        b: detected.b,
        c: detected.c,
        celldm: detected.celldm,
        cosab: parseFloat(Math.cos(toRad(detected.gamma || 90)).toFixed(6)),
        cosac: parseFloat(Math.cos(toRad(detected.beta || 90)).toFixed(6)),
        cosbc: parseFloat(Math.cos(toRad(detected.alpha || 90)).toFixed(6)),
    };

    setStructure({
      ...newStruct,
      detectedInfo: {
        ibrav: 0,
        bravaisName: detected.bravaisName,
        a: detected.a,
        b: detected.b,
        c: detected.c,
        alpha: detected.alpha,
        beta: detected.beta,
        gamma: detected.gamma,
      }
    });
    setLocalParseStatus(`Preset: ${preset.label}`);
    setParams(prev => ({
      ...(prev || DEFAULT_QE_PARAMS),
      control: { ...((prev || DEFAULT_QE_PARAMS).control || {}), prefix: newStruct.formula } as any,
      system: {
          ...((prev || DEFAULT_QE_PARAMS).system || {}),
          ...detectedSystem
      } as any,
      k_points: {
          ...((prev || DEFAULT_QE_PARAMS).k_points || {}),
          values: [4, 4, 4, 1, 1, 1]
      } as any,
      atomic_species: newSpecies,
      lattice_entry_mode: 'abc'
    }));
    setCalculationResult(
      generateCompleteCalculationResult({
        structure: newStruct,
        params: DEFAULT_QE_PARAMS,
        calculationType: 'vc-relax',
      })
    );
  };

  const copyToClipboard = (text: string, section: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleDownloadInput = (text: string, type: string, customFilename?: string) => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const prefix = params?.control?.prefix || structure?.formula || 'pwscf';
    const calculation = params?.control?.calculation || 'scf';
    // Format: customFilename || ('calculation type'.'prefix'.in) for pw calculation
    const filename = customFilename || (type === 'pw' ? `${calculation}.${prefix}.in` : `${type}.${prefix}.in`);
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const executeWebDownloadSave = async (
    prefix: string,
    calculation: string,
    chosenDir: string,
    updatedParams: QEParams,
    inputContent: string,
    ppContent: string,
    phContent: string
  ) => {
    // Format: ('calculation type'.'prefix'.in)
    const inputFileName = `${calculation}.${prefix}.in`;

    // 1. Download the input file with outdir = './' (opens PC file save / download)
    const blob = new Blob([inputContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = inputFileName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 2. Project descriptor JSON
    const projectData = {
      app: 'SEAL Quantum ESPRESSO Studio',
      version: '1.0',
      savedAt: new Date().toISOString(),
      projectFolder: chosenDir,
      directoryName: chosenDir,
      calculation,
      prefix,
      outdir: './',
      formula: structure?.formula || prefix,
      structure: structure || PRESET_STRUCTURES['si'].structure,
      params: updatedParams,
      inputFileName,
    };
    const projectJson = JSON.stringify(projectData, null, 2);

    const projBlob = new Blob([projectJson], { type: 'application/json' });
    const projUrl = URL.createObjectURL(projBlob);
    const projLink = document.createElement('a');
    projLink.download = 'seal_project.json';
    projLink.href = projUrl;
    document.body.appendChild(projLink);
    projLink.click();
    document.body.removeChild(projLink);
    URL.revokeObjectURL(projUrl);

    // 3. Complete Project Folder ZIP archive containing all project files
    const bashScriptContent = `#!/bin/bash\n# Quantum ESPRESSO MPI execution script\n# Working directory: ${chosenDir}\n# Output directory (outdir): ./\n# Calculation type: ${calculation}\n\nexport OMP_NUM_THREADS=2\nmpirun -np 4 pw.x -in ${inputFileName} > ${calculation}.${prefix}.out\n\necho "Finished QE ${calculation} calculation for ${prefix}."\n`;

    try {
      const zipBlob = await createRunDirectoryZip({
        prefix,
        workDir: chosenDir,
        pwInContent: inputContent,
        bashScriptContent,
        calculationType: calculation,
        projectJsonContent: projectJson,
        ppContent,
        phContent,
        convergenceFiles: params?.system?.convergence_test?.enabled ? convergenceFiles : undefined,
      });

      const zipUrl = URL.createObjectURL(zipBlob);
      const zipLink = document.createElement('a');
      zipLink.download = `${chosenDir}.zip`;
      zipLink.href = zipUrl;
      document.body.appendChild(zipLink);
      zipLink.click();
      document.body.removeChild(zipLink);
      URL.revokeObjectURL(zipUrl);
    } catch (zipErr) {
      console.warn("Could not generate zip bundle:", zipErr);
    }

    setSavedDirectoryName(chosenDir);
    setParams(updatedParams);
    setPwOutput(inputContent);
    setPpOutput(ppContent);
    setPhOutput(phContent);

    setSaveStatusNotification({
      message: `Project saved to PC ("${chosenDir}")`,
      detail: `${inputFileName} saved with outdir = './' pointing to project folder. Project folder bundle (${chosenDir}.zip) downloaded.`,
      type: 'success'
    });
    setTimeout(() => setSaveStatusNotification(null), 5000);
  };

  const handleSaveAs = async () => {
    const activeStructure = structure || PRESET_STRUCTURES['si'].structure;
    if (!structure) {
      setStructure(activeStructure);
    }

    const prefix = params?.control?.prefix || activeStructure.formula || 'pwscf';
    const calculation = params?.control?.calculation || 'scf';
    // User requested format: ('calculation type'.'prefix'.in)
    const targetProjectFolderName = `qe_${prefix}_${calculation}`;

    // 1. Native File System Access API (opens PC's native File Explorer folder picker)
    if (isFileSystemAccessSupported()) {
      try {
        // Open file explorer of PC for choosing a directory of user choice
        const chosenParentDir = await (window as any).showDirectoryPicker({
          id: 'seal_qe_workspace',
          mode: 'readwrite',
        });

        if (chosenParentDir) {
          // Get write permissions on the directory of user choice
          const hasWritePerm = await getWritePermission(chosenParentDir);
          if (!hasWritePerm) {
            setErrorMsg("Write permission was not granted for the chosen directory.");
            return;
          }

          // Save the current project as a folder in the directory of user choice
          const projectDir = await chosenParentDir.getDirectoryHandle(targetProjectFolderName, { create: true });
          await getWritePermission(projectDir);

          // Save input files into that directory
          const saveRes = await writeProjectInputFilesToDirectory(projectDir, {
            structure: activeStructure,
            params,
            prefix,
            calculation,
            parentDirName: chosenParentDir.name,
            projectFolderName: targetProjectFolderName,
          });

          // Persist handles in IndexedDB
          await storeHandle('parentDirHandle', chosenParentDir);
          await storeHandle('projectDirHandle', projectDir);
          await storeHandle('parentDirName', chosenParentDir.name);
          await storeHandle('projectFolderName', targetProjectFolderName);

          setParentDirHandle(chosenParentDir);
          setSavedDirectoryHandle(projectDir);
          setParentDirName(chosenParentDir.name);
          setProjectFolderName(targetProjectFolderName);
          setSavedDirectoryName(`${chosenParentDir.name}/${targetProjectFolderName}`);
          setParams(saveRes.updatedParams);
          setPwOutput(saveRes.inputContent);
          setPpOutput(saveRes.ppContent);
          setPhOutput(saveRes.phContent);

          setSaveStatusNotification({
            message: `Project folder saved on PC!`,
            detail: `Saved ${saveRes.inputFileName}, pw.in, pp.in, ph.in, and scripts inside "${chosenParentDir.name}/${targetProjectFolderName}" (outdir = './').`,
            type: 'success',
          });
          setTimeout(() => setSaveStatusNotification(null), 5000);
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User intentionally closed directory picker
          return;
        }
        console.warn("Native directory picker threw:", err);
        if (isRunningInIframe()) {
          setShowIframeNotice(true);
        }
      }
    }

    // 2. Reliable direct download fallback
    const fallbackParams: QEParams = {
      ...params,
      control: {
        ...(params.control || {}),
        calculation: calculation,
        outdir: './',
        prefix: prefix,
      } as any,
    };
    const fallbackInputContent = generateQEInput(activeStructure, fallbackParams);
    const fallbackPp = generatePPInput(fallbackParams);
    const fallbackPh = generatePHInput(fallbackParams);

    await executeWebDownloadSave(
      prefix,
      calculation,
      targetProjectFolderName,
      fallbackParams,
      fallbackInputContent,
      fallbackPp,
      fallbackPh
    );
  };

  const handleSave = async () => {
    const activeStructure = structure || PRESET_STRUCTURES['si'].structure;
    if (!structure) {
      setStructure(activeStructure);
    }

    const prefix = params?.control?.prefix || activeStructure.formula || 'pwscf';
    const calculation = params?.control?.calculation || 'scf';
    const targetProjectFolderName = projectFolderName || `qe_${prefix}_${calculation}`;

    // If an active project directory handle exists:
    if (savedDirectoryHandle) {
      try {
        // Ensure write permission is granted
        const hasPerm = await getWritePermission(savedDirectoryHandle);
        if (hasPerm) {
          // Save updated input files into that directory
          const saveRes = await writeProjectInputFilesToDirectory(savedDirectoryHandle, {
            structure: activeStructure,
            params,
            prefix,
            calculation,
            parentDirName: parentDirName || 'PC',
            projectFolderName: targetProjectFolderName,
          });

          setParams(saveRes.updatedParams);
          setPwOutput(saveRes.inputContent);
          setPpOutput(saveRes.ppContent);
          setPhOutput(saveRes.phContent);

          setSaveStatusNotification({
            message: `Project saved!`,
            detail: `Saved latest ${saveRes.inputFileName} and input files into "${savedDirectoryName}".`,
            type: 'success',
          });
          setTimeout(() => setSaveStatusNotification(null), 4000);
          return;
        } else {
          console.warn("Write permission not granted on existing handle, prompting Save As");
        }
      } catch (err: any) {
        console.warn("Direct save to directory handle failed:", err);
      }
    }

    // If no directory handle or permission expired, open directory picker to choose folder
    handleSaveAs();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-primary-dark text-slate-900 font-sans overflow-hidden">
      {/* Top Header - Spans full width */}
      <header className="h-14 md:h-16 flex-none border-b border-slate-200/80 bg-white flex items-center justify-between px-3 md:px-0 z-20 shadow-sm">
        {/* Desktop Brand Section - Aligned with Settings Panel width when open */}
        <div className={`hidden md:flex items-center gap-3 px-4 h-full border-r border-slate-200 transition-all duration-300 ${isLeftPanelOpen ? 'w-56 lg:w-64 xl:w-72 2xl:w-80 flex-shrink-0' : 'w-auto'}`}>
          <div className="w-8 h-8 md:w-9 md:h-9 bg-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg md:text-xl shadow-md shadow-teal-600/20 shrink-0">S</div>
          <div>
            <h1 className="font-extrabold text-base lg:text-lg tracking-tight text-slate-900 leading-none">Seal</h1>
            {isLeftPanelOpen && (
              <span className="text-[10px] text-slate-500 font-medium truncate block mt-0.5">Quantum ESPRESSO Studio</span>
            )}
          </div>
        </div>

        {/* Mobile Brand Section */}
        <div className="flex md:hidden items-center gap-2">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md shadow-teal-600/20">S</div>
          <span className="font-extrabold text-base tracking-tight text-slate-900">Seal</span>
        </div>

        {/* Header Controls & Actions - Uniform height, grouped alignment & enhanced Menu button */}
        <div className="flex-1 flex items-center justify-end gap-2 md:gap-3 px-2 md:px-6 overflow-x-auto custom-scrollbar">
          {/* Group 1: Left Panel Controls (Model & Settings) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle Model Panel Button */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveMobileDrawer(activeMobileDrawer === 'model' ? null : 'model');
                } else {
                  if (isLeftPanelOpen && activeLeftTab === 'model') {
                    setIsLeftPanelOpen(false);
                  } else {
                    setIsLeftPanelOpen(true);
                    setActiveLeftTab('model');
                  }
                }
              }}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${
                (isLeftPanelOpen && activeLeftTab === 'model' && window.innerWidth >= 768) || activeMobileDrawer === 'model'
                  ? 'bg-teal-50 border-teal-500/50 text-teal-700 shadow-xs ring-1 ring-teal-500/20'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              }`}
              title="Toggle Structure Modelling Panel"
            >
              <Compass size={15} className="text-teal-600 shrink-0" />
              <span className="hidden sm:inline">Model</span>
            </button>

            {/* Toggle Settings Panel Button */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveMobileDrawer(activeMobileDrawer === 'settings' ? null : 'settings');
                } else {
                  if (isLeftPanelOpen && activeLeftTab === 'settings') {
                    setIsLeftPanelOpen(false);
                  } else {
                    setIsLeftPanelOpen(true);
                    setActiveLeftTab('settings');
                  }
                }
              }}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${
                (isLeftPanelOpen && activeLeftTab === 'settings' && window.innerWidth >= 768) || activeMobileDrawer === 'settings'
                  ? 'bg-teal-50 border-teal-500/50 text-teal-700 shadow-xs ring-1 ring-teal-500/20'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              }`}
              title="Toggle Configuration Panel"
            >
              <SlidersHorizontal size={15} className="text-teal-600 shrink-0" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block shrink-0" />

          {/* Group 2: Structure Source (Presets & File Import) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Preset Selector Dropdown */}
            <div className="h-9 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/80 px-2.5 rounded-lg border border-slate-200 transition-colors">
              <Box size={14} className="text-teal-600 shrink-0" />
              <select 
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-[110px] sm:max-w-none"
                onChange={(e) => loadPresetStructure(e.target.value)}
                defaultValue="si"
              >
                {Object.entries(PRESET_STRUCTURES).map(([key, item]) => (
                  <option key={key} value={key}>{item.label}</option>
                ))}
              </select>
            </div>

            {/* Import Structure Button */}
            <label className={`h-9 cursor-pointer flex items-center justify-center gap-1.5 px-3 rounded-lg font-semibold text-xs transition-all shadow-xs shrink-0 ${
              isLoading ? 'bg-slate-200 cursor-not-allowed text-slate-400' : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20 active:scale-95'
            }`}>
              {isLoading ? <Loader2 className="animate-spin" size={14} /> : <FileUp size={14} />}
              <span className="hidden sm:inline">{isLoading ? 'Analyzing...' : 'Import (.cif, .xyz)'}</span>
              <span className="inline sm:hidden">{isLoading ? '...' : 'Import'}</span>
              <input 
                type="file" 
                accept=".cif,.xsf,.xyz,.vasp,.poscar,.contcar,.in,.pw,.pwi,.pdb,.json,.txt" 
                className="hidden" 
                onChange={handleFileUpload} 
                disabled={isLoading}
              />
            </label>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden md:block shrink-0" />

          {/* Group 3: Input Files, Run, Results & Save Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Direct Input Files Toggle Button */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveMobileDrawer(activeMobileDrawer === 'input' && activeRightView === 'input' ? null : 'input');
                  setActiveRightView('input');
                } else {
                  if (isRightPanelOpen && activeRightView === 'input') {
                    setIsRightPanelOpen(false);
                  } else {
                    setIsRightPanelOpen(true);
                    setActiveRightView('input');
                  }
                }
              }}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${
                (isRightPanelOpen && activeRightView === 'input' && window.innerWidth >= 768) || (activeMobileDrawer === 'input' && activeRightView === 'input' && window.innerWidth < 768)
                  ? 'bg-teal-50 border-teal-500/50 text-teal-700 shadow-xs ring-1 ring-teal-500/20'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              }`}
              title="Toggle Input Files Panel (pw.x, pp.x, ph.x, convergence)"
            >
              <FileCode size={15} className="text-teal-600 shrink-0" />
              <span className="hidden sm:inline">Input Files</span>
              {params?.system?.convergence_test?.enabled && convergenceFiles.length > 0 ? (
                <span className="text-[10px] font-mono text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded font-bold uppercase hidden md:inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  conv ({convergenceFiles.length})
                </span>
              ) : isRightPanelOpen && activeRightView === 'input' ? (
                <span className="text-[10px] font-mono text-teal-700 bg-teal-100/70 px-1.5 py-0.2 rounded font-bold uppercase hidden xl:inline">
                  {`${params?.control?.calculation || 'scf'}.in`}
                </span>
              ) : null}
            </button>

            {/* Direct Run (MPI) Toggle Button */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveRightView('run');
                  setActiveMobileDrawer(activeMobileDrawer === 'input' && activeRightView === 'run' ? null : 'input');
                } else {
                  if (isRightPanelOpen && activeRightView === 'run') {
                    setIsRightPanelOpen(false);
                  } else {
                    setIsRightPanelOpen(true);
                    setActiveRightView('run');
                  }
                }
              }}
              className={`h-9 hidden md:flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${
                isRightPanelOpen && activeRightView === 'run'
                  ? 'bg-teal-50 border-teal-500/50 text-teal-700 shadow-xs ring-1 ring-teal-500/20'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              }`}
              title="Open MPI & OpenMP Calculation Runner"
            >
              <Play size={14} className="text-teal-600 shrink-0" />
              <span>Run</span>
            </button>

            {/* Direct Results Toggle Button */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveRightView('results');
                  setActiveMobileDrawer(activeMobileDrawer === 'input' && activeRightView === 'results' ? null : 'input');
                } else {
                  if (isRightPanelOpen && activeRightView === 'results') {
                    setIsRightPanelOpen(false);
                  } else {
                    setIsRightPanelOpen(true);
                    setActiveRightView('results');
                  }
                }
              }}
              className={`h-9 hidden md:flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${
                isRightPanelOpen && activeRightView === 'results'
                  ? 'bg-teal-50 border-teal-500/50 text-teal-700 shadow-xs ring-1 ring-teal-500/20'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              }`}
              title="Open Calculation Results Dashboard"
            >
              <BarChart3 size={14} className="text-teal-600 shrink-0" />
              <span>Results</span>
              {calculationResult && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            {/* Quick Save Button */}
            <button
              onClick={handleSave}
              className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all border bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700"
              title={savedDirectoryName ? `Quick Save to ${savedDirectoryName} (Ctrl+S)` : 'Save Project Folder to PC (Ctrl+S)'}
            >
              <Save size={14} className="text-teal-600 shrink-0" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>

          {errorMsg && (
            <div className="flex flex-col items-end gap-0.5 max-w-xs shrink-0">
              <div className="text-red-700 text-[10px] bg-red-50 px-2 py-1 rounded border border-red-200 shadow-sm leading-tight">
                {errorMsg}
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-[9px] text-slate-500 hover:text-slate-700">Dismiss</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Full-Height Workspace Area */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
        {/* Desktop Left Sidebar (Model or Settings) */}
        {isLeftPanelOpen && (
          <div className="hidden md:flex w-56 lg:w-64 xl:w-72 2xl:w-80 flex-shrink-0 z-20 shadow-xl border-r border-slate-200">
            {activeLeftTab === 'model' ? (
              <ModellingPanel 
                structure={structure} 
                onStructureChange={handleStructureChange}
              />
            ) : (
              <SettingsPanel 
                params={params} 
                onChange={setParams} 
                structure={structure} 
                onStructureChange={handleStructureChange}
              />
            )}
          </div>
        )}

        {/* Main Center Canvas */}
        <div className="flex-1 relative w-full h-full min-w-0">
          <StructureViewer 
            structure={
              trajectoryPreviewStructure && isRightPanelOpen && activeRightView === 'results'
                ? trajectoryPreviewStructure
                : structure
            } 
            params={params}
            onStructureChange={handleStructureChange} 
          />
        </div>

        {/* Desktop Right Output & Execution Sidebar */}
        <RightPanel
          isOpen={isRightPanelOpen}
          onClose={() => setIsRightPanelOpen(false)}
          activeView={activeRightView}
          onViewChange={setActiveRightView}
          activeInputTab={activeInputTab}
          onActiveInputTabChange={setActiveInputTab}
          structure={structure}
          params={params}
          onParamsChange={setParams}
          pwOutput={pwOutput}
          ppOutput={ppOutput}
          phOutput={phOutput}
          onDownloadInput={handleDownloadInput}
          onCopyText={copyToClipboard}
          copiedSection={copiedSection}
          calculationResult={calculationResult}
          onCalculationComplete={(res) => setCalculationResult(res)}
          onTrajectoryFramePreview={setTrajectoryPreviewStructure}
          onApplyStructureToEditor={handleStructureChange}
          savedDirectoryName={savedDirectoryName}
          onSaveAs={handleSaveAs}
          onSave={handleSave}
        />
      </div>

      {/* Floating Save Notification Toast */}
      {saveStatusNotification && (
        <div className="fixed top-16 right-4 z-50 flex items-start gap-2.5 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-teal-500/40 text-xs animate-in slide-in-from-top-2 duration-200 max-w-sm">
          <CheckCircle2 size={18} className="text-teal-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-xs">{saveStatusNotification.message}</div>
            {saveStatusNotification.detail && (
              <div className="text-[11px] text-teal-200/90 font-mono mt-0.5 leading-snug">
                {saveStatusNotification.detail}
              </div>
            )}
          </div>
          <button 
            onClick={() => setSaveStatusNotification(null)}
            className="text-slate-400 hover:text-white p-0.5 -mr-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mobile Navigation Bottom Bar */}
      <div className="md:hidden flex items-center justify-around bg-white border-t border-slate-200 py-1.5 px-3 z-30 shadow-lg flex-shrink-0">
        <button
          onClick={() => setActiveMobileDrawer(null)}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === null ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye size={18} />
          <span>3D View</span>
        </button>

        <button
          onClick={() => setActiveMobileDrawer(activeMobileDrawer === 'model' ? null : 'model')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === 'model' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Compass size={18} />
          <span>Model</span>
        </button>

        <button
          onClick={() => setActiveMobileDrawer(activeMobileDrawer === 'settings' ? null : 'settings')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === 'settings' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <SlidersHorizontal size={18} />
          <span>Config</span>
        </button>

        <button
          onClick={() => {
            if (activeMobileDrawer === 'input' && activeRightView === 'input') {
              setActiveMobileDrawer(null);
            } else {
              setActiveMobileDrawer('input');
              setActiveRightView('input');
            }
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === 'input' && activeRightView === 'input' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileCode size={18} />
          <span>Input</span>
        </button>

        <button
          onClick={() => {
            if (activeMobileDrawer === 'input' && activeRightView === 'run') {
              setActiveMobileDrawer(null);
            } else {
              setActiveMobileDrawer('input');
              setActiveRightView('run');
            }
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === 'input' && activeRightView === 'run' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Play size={18} />
          <span>Run</span>
        </button>

        <button
          onClick={() => {
            if (activeMobileDrawer === 'input' && activeRightView === 'results') {
              setActiveMobileDrawer(null);
            } else {
              setActiveMobileDrawer('input');
              setActiveRightView('results');
            }
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
            activeMobileDrawer === 'input' && activeRightView === 'results' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 size={18} />
          <span>Results</span>
        </button>
      </div>

      {/* Mobile Model Drawer Overlay */}
      {activeMobileDrawer === 'model' && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl max-h-[85vh] h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Compass size={18} className="text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">Structure Modelling</h3>
              </div>
              <button 
                onClick={() => setActiveMobileDrawer(null)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ModellingPanel 
                structure={structure} 
                onStructureChange={handleStructureChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Settings Drawer Overlay */}
      {activeMobileDrawer === 'settings' && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl max-h-[85vh] h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">QE Settings & Parameters</h3>
              </div>
              <button 
                onClick={() => setActiveMobileDrawer(null)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SettingsPanel 
                params={params} 
                onChange={setParams} 
                structure={structure} 
                onStructureChange={handleStructureChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Input & Execution Drawer Overlay */}
      {activeMobileDrawer === 'input' && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl max-h-[90vh] h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
            <RightPanel
              isOpen={true}
              onClose={() => setActiveMobileDrawer(null)}
              activeView={activeRightView}
              onViewChange={setActiveRightView}
              activeInputTab={activeInputTab}
              onActiveInputTabChange={setActiveInputTab}
              structure={structure}
              params={params}
              onParamsChange={setParams}
              pwOutput={pwOutput}
              ppOutput={ppOutput}
              phOutput={phOutput}
              onDownloadInput={handleDownloadInput}
              onCopyText={copyToClipboard}
              copiedSection={copiedSection}
              calculationResult={calculationResult}
              onCalculationComplete={(res) => setCalculationResult(res)}
              onTrajectoryFramePreview={setTrajectoryPreviewStructure}
              onApplyStructureToEditor={handleStructureChange}
              savedDirectoryName={savedDirectoryName}
              onSaveAs={handleSaveAs}
              onSave={handleSave}
            />
          </div>
        </div>
      )}

      {/* Native Directory Standalone Access Dialog */}
      {showIframeNotice && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIframeNotice(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shrink-0">
                  <HardDrive size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Native Directory Access</h3>
                  <span className="text-[11px] text-slate-500">Browser Permissions Notice</span>
                </div>
              </div>
              <button 
                onClick={() => setShowIframeNotice(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Modern browsers allow web applications to directly pick a directory and write project files to your PC disk, but require running in a top-level browser tab rather than an embedded preview frame.
            </p>

            <div className="bg-teal-50/80 border border-teal-200 rounded-xl p-3 text-xs text-teal-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-teal-800">
                <FolderCheck size={14} />
                <span>Direct PC Folder Write Access</span>
              </div>
              <p className="text-[11px] text-teal-700 leading-snug">
                Opening Seal in a standalone tab allows you to select any folder on your computer, grant write permissions, and save/update input files directly to your disk with every save.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <ExternalLink size={15} />
                <span>Open in Standalone Tab for Direct Directory Access</span>
              </a>
              <button
                onClick={() => setShowIframeNotice(false)}
                className="w-full py-2 px-3 text-xs text-slate-500 hover:text-slate-800 font-semibold text-center"
              >
                Continue with Direct File Downloads
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
