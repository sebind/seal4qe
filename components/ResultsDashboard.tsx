import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderOpen,
  FileUp,
  RefreshCw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from 'lucide-react';
import {
  Atom,
  CalculationResult,
  CrystalStructure,
  QEParams,
} from '../types';
import {
  parseQEOutputLog,
  ParsedQELogData,
} from '../utils/qeParser';
import {
  isFileSystemAccessSupported,
  readOutFilesFromDirectory,
  LocalOutFileEntry,
} from '../utils/nativeFileSystem';

interface ResultsDashboardProps {
  structure: CrystalStructure | null;
  params: QEParams;
  onParamsChange: (updater: (prev: QEParams) => QEParams) => void;
  calculationResult: CalculationResult | null;
  onCalculationComplete: (result: CalculationResult) => void;
  onTrajectoryFramePreview?: (previewStructure: CrystalStructure | null) => void;
  onApplyStructureToEditor?: (newStructure: CrystalStructure) => void;
  onSwitchToRunTab: () => void;
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
  workDir: string;
  mpiCores: number;
  ompThreads: number;
  savedDirectoryName?: string | null;
  savedDirectoryHandle?: any;
  onDirectoryHandleChange?: (handle: any, name: string) => void;
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

type GraphToggleMode = 'scf' | 'relax' | 'trj' | 'band' | 'dos';

// Persist Results tab state across mobile drawer open/close and view switches
let cachedFolderFiles: LocalOutFileEntry[] = [];
let cachedSelectedFilePath = '';
let cachedLocalFolderName: string | null = null;
let cachedActiveToggle: GraphToggleMode | null = 'scf';
let cachedFrameIndex = 0;
let cachedLastSyncedFilePath = '';

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  structure,
  params,
  onParamsChange,
  calculationResult,
  onCalculationComplete,
  onTrajectoryFramePreview,
  onApplyStructureToEditor,
  workDir,
  mpiCores,
  ompThreads,
  savedDirectoryName,
  savedDirectoryHandle,
  onDirectoryHandleChange,
}) => {
  const [activeToggle, setActiveToggle] = useState<GraphToggleMode | null>(cachedActiveToggle);
  const [folderFiles, setFolderFiles] = useState<LocalOutFileEntry[]>(cachedFolderFiles);
  const [selectedFilePath, setSelectedFilePath] = useState<string>(cachedSelectedFilePath);
  const [localFolderName, setLocalFolderName] = useState<string | null>(
    cachedLocalFolderName || savedDirectoryName || null
  );
  const [isScanningFolder, setIsScanningFolder] = useState<boolean>(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: string } | null>(null);

  // Trajectory Movie playback state
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(cachedFrameIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Sync state back to module cache for seamless mobile drawer persistence
  useEffect(() => {
    cachedFolderFiles = folderFiles;
  }, [folderFiles]);
  useEffect(() => {
    cachedSelectedFilePath = selectedFilePath;
  }, [selectedFilePath]);
  useEffect(() => {
    cachedLocalFolderName = localFolderName;
  }, [localFolderName]);
  useEffect(() => {
    cachedActiveToggle = activeToggle;
  }, [activeToggle]);
  useEffect(() => {
    cachedFrameIndex = currentFrameIndex;
  }, [currentFrameIndex]);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync folder files when savedDirectoryHandle is available
  const loadFromDirectoryHandle = async (handle: any, dirLabel?: string) => {
    if (!handle) return;
    setIsScanningFolder(true);
    try {
      const files = await readOutFilesFromDirectory(handle);
      const outFilesOnly = files.filter((f) => f.name.toLowerCase().endsWith('.out'));
      setFolderFiles(outFilesOnly);
      if (dirLabel || handle.name) {
        setLocalFolderName(dirLabel || handle.name);
      }
      if (outFilesOnly.length > 0) {
        setSelectedFilePath(outFilesOnly[0].path);
      } else {
        setSelectedFilePath('');
      }
    } catch (err) {
      console.warn('Failed to scan local folder for .out files:', err);
    } finally {
      setIsScanningFolder(false);
    }
  };

  useEffect(() => {
    if (savedDirectoryHandle) {
      loadFromDirectoryHandle(savedDirectoryHandle, savedDirectoryName || savedDirectoryHandle.name);
    }
  }, [savedDirectoryHandle, savedDirectoryName]);

  // Also include calculationResult.outputLog if produced by a run and no folder files loaded yet
  useEffect(() => {
    if (calculationResult?.outputLog && folderFiles.length === 0) {
      const fileName = calculationResult.timestamp?.endsWith('.out')
        ? calculationResult.timestamp
        : `${calculationResult.calculationType || 'scf'}.${calculationResult.formula || 'pwscf'}.out`;
      const entry: LocalOutFileEntry = {
        name: fileName,
        path: fileName,
        content: calculationResult.outputLog,
        lastModified: Date.now(),
      };
      setFolderFiles([entry]);
      setSelectedFilePath(entry.path);
    }
  }, [calculationResult?.outputLog]);

  // Open local folder via File System Access API or fallback webkitdirectory input
  const handleSelectLocalFolder = async () => {
    if (isFileSystemAccessSupported()) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({
          id: 'seal_qe_results_dir',
          mode: 'read',
        });
        if (dirHandle) {
          onDirectoryHandleChange?.(dirHandle, dirHandle.name);
          await loadFromDirectoryHandle(dirHandle, dirHandle.name);
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        // Fallback to directory file input if blocked by iframe or browser policy
      }
    }
    folderInputRef.current?.click();
  };

  // Fallback handler for <input webkitdirectory multiple>
  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsScanningFolder(true);
    try {
      const extracted: LocalOutFileEntry[] = [];
      let detectedFolder = '';

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const lower = file.name.toLowerCase();
        const relPath = (file as any).webkitRelativePath || file.name;
        if (!detectedFolder && relPath.includes('/')) {
          detectedFolder = relPath.split('/')[0];
        }
        if (lower.endsWith('.out')) {
          if (file.size <= 25 * 1024 * 1024) {
            const content = await file.text();
            extracted.push({
              name: file.name,
              path: relPath,
              content,
              lastModified: file.lastModified || 0,
            });
          }
        }
      }

      extracted.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name));

      setFolderFiles(extracted);
      setLocalFolderName(detectedFolder || 'Selected Folder');
      if (extracted.length > 0) {
        setSelectedFilePath(extracted[0].path);
      } else {
        setSelectedFilePath('');
      }
    } catch (err) {
      console.error('Failed to read folder files:', err);
    } finally {
      setIsScanningFolder(false);
      e.target.value = '';
    }
  };

  // Handler for selecting individual .out files
  const handleOutFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const newEntries: LocalOutFileEntry[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const content = await file.text();
        newEntries.push({
          name: file.name,
          path: file.name,
          content,
          lastModified: file.lastModified || Date.now(),
        });
      }
      setFolderFiles((prev) => {
        const map = new Map<string, LocalOutFileEntry>();
        [...newEntries, ...prev].forEach((item) => map.set(item.path, item));
        return Array.from(map.values());
      });
      if (newEntries.length > 0) {
        setSelectedFilePath(newEntries[0].path);
      }
    } catch (err) {
      console.error('Error loading .out file:', err);
    } finally {
      e.target.value = '';
    }
  };

  // Parse all loaded .out files in the folder independently of the default editor structure
  const parsedFolderMap = useMemo(() => {
    const map = new Map<string, ParsedQELogData>();
    for (const file of folderFiles) {
      map.set(file.path, parseQEOutputLog(file.content));
    }
    return map;
  }, [folderFiles]);

  const activeFileEntry = useMemo(() => {
    return folderFiles.find((f) => f.path === selectedFilePath) || folderFiles[0] || null;
  }, [folderFiles, selectedFilePath]);

  const activeParsed = useMemo<ParsedQELogData | null>(() => {
    if (!activeFileEntry) return null;
    return parsedFolderMap.get(activeFileEntry.path) || null;
  }, [activeFileEntry, parsedFolderMap]);

  // Identify .out files starting with "band" and "dos" in the folder
  const bandFileEntry = useMemo(() => {
    if (
      activeFileEntry &&
      activeFileEntry.name.toLowerCase().startsWith('band') &&
      activeFileEntry.name.toLowerCase().endsWith('.out')
    ) {
      return activeFileEntry;
    }
    return (
      folderFiles.find(
        (f) => f.name.toLowerCase().startsWith('band') && f.name.toLowerCase().endsWith('.out')
      ) || null
    );
  }, [folderFiles, activeFileEntry]);

  const dosFileEntry = useMemo(() => {
    if (
      activeFileEntry &&
      activeFileEntry.name.toLowerCase().startsWith('dos') &&
      activeFileEntry.name.toLowerCase().endsWith('.out')
    ) {
      return activeFileEntry;
    }
    return (
      folderFiles.find(
        (f) => f.name.toLowerCase().startsWith('dos') && f.name.toLowerCase().endsWith('.out')
      ) || null
    );
  }, [folderFiles, activeFileEntry]);

  const bandParsed = useMemo<ParsedQELogData | null>(() => {
    if (!bandFileEntry) return null;
    return parsedFolderMap.get(bandFileEntry.path) || null;
  }, [bandFileEntry, parsedFolderMap]);

  const dosParsed = useMemo<ParsedQELogData | null>(() => {
    if (!dosFileEntry) return null;
    return parsedFolderMap.get(dosFileEntry.path) || null;
  }, [dosFileEntry, parsedFolderMap]);

  // Notify parent when active file changes and sync extracted parameters
  useEffect(() => {
    if (!activeParsed || !activeFileEntry) return;

    if (activeParsed.extractedParams) {
      const ep = activeParsed.extractedParams;
      if (
        ep.ecutwfc !== undefined ||
        ep.ecutrho !== undefined ||
        ep.conv_thr !== undefined ||
        ep.mixing_beta !== undefined
      ) {
        onParamsChange((prev) => ({
          ...prev,
          system: {
            ...prev.system,
            ...(ep.ecutwfc !== undefined ? { ecutwfc: ep.ecutwfc } : {}),
            ...(ep.ecutrho !== undefined ? { ecutrho: ep.ecutrho } : {}),
          },
          electrons: {
            ...prev.electrons,
            ...(ep.conv_thr !== undefined ? { conv_thr: ep.conv_thr } : {}),
            ...(ep.mixing_beta !== undefined ? { mixing_beta: ep.mixing_beta } : {}),
          },
        }));
      }
    }

    if (
      activeParsed.allScfSteps.length === 0 &&
      activeParsed.ionicSteps.length === 0 &&
      !activeParsed.bandStructure &&
      activeParsed.dosData.length === 0 &&
      !activeParsed.extractedStructure
    ) {
      return;
    }
    onCalculationComplete({
      calculationType: activeParsed.calculationType,
      converged: activeParsed.converged,
      totalEnergyRy: activeParsed.totalEnergyRy,
      totalEnergyEV: activeParsed.totalEnergyEV,
      fermiEnergyEV: activeParsed.fermiEnergyEV,
      bandGapEV: activeParsed.bandGapEV,
      isMetallic: activeParsed.isMetallic,
      maxForceRyBohr: activeParsed.maxForceRyBohr,
      stressKbar: activeParsed.stressKbar,
      iterations: activeParsed.allScfSteps.length,
      scfSteps: activeParsed.allScfSteps,
      ionicSteps: activeParsed.ionicSteps,
      tprnfor: activeParsed.hasForcesInLog,
      tstress: activeParsed.hasStressInLog,
      wallTimeSec: activeParsed.wallTimeSec,
      cpuTimeSec: activeParsed.cpuTimeSec,
      outputLog: activeFileEntry.content,
      timestamp: activeFileEntry.name,
      formula: activeParsed.formula,
      nat: activeParsed.nat,
      mpiCores,
      ompThreads,
      workDir,
    });
  }, [activeFileEntry?.path, activeParsed]);

  // Resolve SCF and Relax data from the selected .out file (or non-band/dos .out files in the folder)
  const scfSteps = useMemo(() => {
    if (activeParsed && activeParsed.allScfSteps.length > 0) return activeParsed.allScfSteps;
    for (const [path, p] of parsedFolderMap.entries()) {
      const lower = path.split('/').pop()?.toLowerCase() || '';
      if (!lower.startsWith('band') && !lower.startsWith('dos') && p.allScfSteps.length > 0) {
        return p.allScfSteps;
      }
    }
    return [];
  }, [activeParsed, parsedFolderMap]);

  const relaxSteps = useMemo(() => {
    if (activeParsed && activeParsed.ionicSteps.length > 0) return activeParsed.ionicSteps;
    for (const [path, p] of parsedFolderMap.entries()) {
      const lower = path.split('/').pop()?.toLowerCase() || '';
      if (!lower.startsWith('band') && !lower.startsWith('dos') && p.ionicSteps.length > 1) {
        return p.ionicSteps;
      }
    }
    for (const [path, p] of parsedFolderMap.entries()) {
      const lower = path.split('/').pop()?.toLowerCase() || '';
      if (!lower.startsWith('band') && !lower.startsWith('dos') && p.ionicSteps.length > 0) {
        return p.ionicSteps;
      }
    }
    return [];
  }, [activeParsed, parsedFolderMap]);

  // Band and DOS data are ONLY loaded from .out files starting with "band" or "dos" respectively
  const bandStructure = useMemo(() => {
    return bandParsed?.bandStructure || null;
  }, [bandParsed]);

  const dosData = useMemo(() => {
    return dosParsed?.dosData || [];
  }, [dosParsed]);

  // Keep trajectory frame index in bounds, and default to the final frame when a new .out file is opened
  const totalFrames = relaxSteps.length;
  useEffect(() => {
    const currentPath = activeFileEntry?.path || '';
    if (currentPath !== cachedLastSyncedFilePath) {
      cachedLastSyncedFilePath = currentPath;
      if (totalFrames > 0) {
        setCurrentFrameIndex(totalFrames - 1);
      } else {
        setCurrentFrameIndex(0);
      }
    } else if (currentFrameIndex >= totalFrames) {
      setCurrentFrameIndex(Math.max(0, totalFrames - 1));
    }
  }, [activeFileEntry?.path, totalFrames]);

  // Trajectory movie playback interval
  useEffect(() => {
    if (!isPlaying || (activeToggle !== 'trj' && activeToggle !== 'relax') || totalFrames <= 1) return;
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % totalFrames);
    }, 550);
    return () => clearInterval(timer);
  }, [isPlaying, activeToggle, totalFrames]);

  // Keep 3D visualization canvas, Left Panel details, and Input File synchronized with the
  // open .out material system or the active frame in Relax / Trj Movie at all times
  const fallbackFolderStructure = useMemo<CrystalStructure | null>(() => {
    if (activeParsed?.extractedStructure) return activeParsed.extractedStructure;
    for (const p of parsedFolderMap.values()) {
      if (p.extractedStructure) return p.extractedStructure;
    }
    return null;
  }, [activeParsed, parsedFolderMap]);

  useEffect(() => {
    if (!activeFileEntry) return;

    let targetStructure: CrystalStructure | null = null;
    const isFrameMode = activeToggle === 'trj' || activeToggle === 'relax';

    if (isFrameMode && relaxSteps.length > 0) {
      const safeIdx = Math.min(Math.max(0, currentFrameIndex), relaxSteps.length - 1);
      const frame = relaxSteps[safeIdx];
      if (frame && frame.atoms && frame.atoms.length > 0) {
        targetStructure = {
          lattice: frame.lattice.map((r) => [...r]),
          atoms: frame.atoms.map((a) => ({ ...a })) as Atom[],
          formula:
            activeParsed?.formula ||
            fallbackFolderStructure?.formula ||
            'pwscf',
        };
      }
    }

    if (!targetStructure && fallbackFolderStructure) {
      targetStructure = {
        lattice: fallbackFolderStructure.lattice.map((r) => [...r]),
        atoms: fallbackFolderStructure.atoms.map((a) => ({ ...a })),
        formula: fallbackFolderStructure.formula,
      };
    }

    if (targetStructure && targetStructure.atoms.length > 0) {
      onTrajectoryFramePreview?.(null);
      onApplyStructureToEditor?.(targetStructure);
    }
  }, [
    activeFileEntry?.path,
    activeToggle,
    currentFrameIndex,
    relaxSteps,
    fallbackFolderStructure,
  ]);

  // Format tick numbers cleanly
  const formatTick = (v: number, span: number) => {
    if (Math.abs(v) >= 1000) return v.toFixed(1);
    if (span < 0.005) return v.toFixed(5);
    if (span < 0.05) return v.toFixed(4);
    if (span < 1) return v.toFixed(3);
    return v.toFixed(2);
  };

  // Render the simple square graph with:
  // 1. White background
  // 2. Spherical symbol for data points
  // 3. Arial font for text in the graph
  // 4. Legend showing the final energy in the data
  const renderSquareGraph = () => {
    if (!activeToggle) return null;

    const SIZE = 400;
    const padL = 74;
    const padR = 26;
    const padT = 30;
    const padB = 70;
    const plotW = SIZE - padL - padR; // 300
    const plotH = SIZE - padT - padB; // 300 (1:1 exact square plot area)

    const fontStyle: React.CSSProperties = { fontFamily: 'Arial, sans-serif' };

    // Determine dataset and final energy legend based on activeToggle
    let xLabel = '';
    let yLabel = '';
    let xMin = 0;
    let xMax = 1;
    let yMin = 0;
    let yMax = 1;
    let seriesList: { points: { x: number; y: number; label: string; value: string; frameIdx?: number }[] }[] = [];
    let hasData = false;
    let refLineY: number | null = null;
    let finalEnergyLegend = '';

    if (activeToggle === 'scf') {
      xLabel = 'SCF Iteration';
      yLabel = 'Total Energy (Ry)';
      if (scfSteps.length > 0) {
        hasData = true;
        const pts = scfSteps.map((s, idx) => ({
          x: idx + 1,
          y: s.totalEnergyRy,
          label: `Iteration #${idx + 1}`,
          value: `${s.totalEnergyRy.toFixed(6)} Ry`,
        }));
        seriesList = [{ points: pts }];
        xMin = 1;
        xMax = Math.max(2, pts.length);
        const yVals = pts.map((p) => p.y);
        yMin = Math.min(...yVals);
        yMax = Math.max(...yVals);
        const finalE = scfSteps[scfSteps.length - 1].totalEnergyRy;
        finalEnergyLegend = `Final Energy: ${finalE.toFixed(6)} Ry`;
      }
    } else if (activeToggle === 'relax') {
      xLabel = 'Ionic Step';
      yLabel = 'Total Energy (Ry)';
      if (relaxSteps.length > 0) {
        hasData = true;
        const pts = relaxSteps.map((s, idx) => ({
          x: idx + 1,
          y: s.totalEnergyRy,
          label: `Step #${idx + 1}`,
          value: `${s.totalEnergyRy.toFixed(6)} Ry`,
          frameIdx: idx,
        }));
        seriesList = [{ points: pts }];
        xMin = 1;
        xMax = Math.max(2, pts.length);
        const yVals = pts.map((p) => p.y);
        yMin = Math.min(...yVals);
        yMax = Math.max(...yVals);
        const finalE = relaxSteps[relaxSteps.length - 1].totalEnergyRy;
        finalEnergyLegend = `Final Energy: ${finalE.toFixed(6)} Ry`;
      }
    } else if (activeToggle === 'trj') {
      xLabel = 'Trajectory Frame';
      yLabel = 'Total Energy (Ry)';
      if (relaxSteps.length > 0) {
        hasData = true;
        const pts = relaxSteps.map((s, idx) => ({
          x: idx + 1,
          y: s.totalEnergyRy,
          label: `Frame #${idx + 1}`,
          value: `${s.totalEnergyRy.toFixed(6)} Ry`,
          frameIdx: idx,
        }));
        seriesList = [{ points: pts }];
        xMin = 1;
        xMax = Math.max(2, pts.length);
        const yVals = pts.map((p) => p.y);
        yMin = Math.min(...yVals);
        yMax = Math.max(...yVals);
        const finalE = relaxSteps[relaxSteps.length - 1].totalEnergyRy;
        finalEnergyLegend = `Final Energy: ${finalE.toFixed(6)} Ry`;
      }
    } else if (activeToggle === 'band') {
      xLabel = 'Wavevector k';
      yLabel = 'Energy (eV)';
      if (bandFileEntry && bandStructure && bandStructure.bands.length > 0) {
        hasData = true;
        const ef = bandStructure.fermiEnergyEV ?? 0;
        seriesList = bandStructure.bands.map((b) => ({
          points: b.points.map((pt) => ({
            x: pt.kDistance,
            y: pt.energyEV - ef,
            label: `Band ${b.bandIndex} (k=#${pt.kIndex})`,
            value: `${(pt.energyEV - ef).toFixed(3)} eV`,
          })),
        }));
        const allPts = seriesList.flatMap((s) => s.points);
        const xVals = allPts.map((p) => p.x);
        const yVals = allPts.map((p) => p.y);
        xMin = Math.min(...xVals);
        xMax = Math.max(...xVals);
        if (xMax <= xMin) xMax = xMin + 1;
        yMin = Math.min(...yVals);
        yMax = Math.max(...yVals);
        if (ef !== 0) {
          yLabel = 'E - Ef (eV)';
          refLineY = 0;
        }
        if (bandParsed && bandParsed.totalEnergyRy !== 0) {
          finalEnergyLegend = `Final Energy: ${bandParsed.totalEnergyRy.toFixed(6)} Ry`;
        } else if (bandStructure.fermiEnergyEV !== undefined) {
          finalEnergyLegend = `Final Energy: ${bandStructure.fermiEnergyEV.toFixed(4)} eV`;
        } else if (allPts.length > 0) {
          finalEnergyLegend = `Final Energy: ${allPts[allPts.length - 1].y.toFixed(4)} eV`;
        }
      }
    } else if (activeToggle === 'dos') {
      xLabel = 'Energy (eV)';
      yLabel = 'DOS (states/eV)';
      if (dosFileEntry && dosData.length > 0) {
        hasData = true;
        const pts = dosData.map((d) => ({
          x: d.energyEV,
          y: d.dos,
          label: `E = ${d.energyEV.toFixed(2)} eV`,
          value: `${d.dos.toFixed(3)} states/eV`,
        }));
        seriesList = [{ points: pts }];
        const xVals = pts.map((p) => p.x);
        const yVals = pts.map((p) => p.y);
        xMin = Math.min(...xVals);
        xMax = Math.max(...xVals);
        yMin = Math.min(0, ...yVals);
        yMax = Math.max(...yVals);
        if (dosParsed && dosParsed.totalEnergyRy !== 0) {
          finalEnergyLegend = `Final Energy: ${dosParsed.totalEnergyRy.toFixed(6)} Ry`;
        } else if (dosParsed && dosParsed.fermiEnergyEV !== 0) {
          finalEnergyLegend = `Final Energy: ${dosParsed.fermiEnergyEV.toFixed(4)} eV`;
        } else {
          finalEnergyLegend = `Final Energy: ${dosData[dosData.length - 1].energyEV.toFixed(4)} eV`;
        }
      }
    }

    if (!hasData) {
      const isBandOrDosMissing = activeToggle === 'band' || activeToggle === 'dos';
      return (
        <div
          className="w-full max-w-[400px] mx-auto aspect-square bg-white border border-slate-300 rounded-lg flex flex-col items-center justify-center p-6 text-center"
          style={fontStyle}
        >
          {isBandOrDosMissing ? (
            <p className="text-xs font-semibold text-slate-700 leading-relaxed" style={fontStyle}>
              Data not available provide band and dos data in band.prefix.out and dos.prefix.out files, respectively
            </p>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-700" style={fontStyle}>
                {folderFiles.length === 0
                  ? 'No .out file loaded'
                  : `No ${activeToggle.toUpperCase()} data found in ${activeFileEntry?.name || '.out file'}`}
              </p>
              <p className="text-[11px] text-slate-500 mt-1" style={fontStyle}>
                {folderFiles.length === 0
                  ? 'Select a local folder or .out file above to extract data.'
                  : 'Select a matching .out file from the folder dropdown.'}
              </p>
            </>
          )}
        </div>
      );
    }

    // Add padding to Y range so spheres and legend never clip the plot frame
    const rawYSpan = yMax - yMin;
    const yPadBottom = rawYSpan > 0 ? rawYSpan * 0.08 : Math.max(Math.abs(yMax) * 0.05, 0.1);
    const yPadTop = rawYSpan > 0 ? rawYSpan * 0.16 : Math.max(Math.abs(yMax) * 0.1, 0.2);
    const plotYMin = activeToggle === 'dos' ? Math.max(0, yMin) : yMin - yPadBottom;
    const plotYMax = yMax + yPadTop;
    const ySpan = Math.max(1e-9, plotYMax - plotYMin);
    const xSpan = Math.max(1e-9, xMax - xMin);

    const xToPx = (x: number) => {
      if (seriesList[0]?.points.length === 1 && xMax === xMin) return padL + plotW / 2;
      return padL + ((x - xMin) / xSpan) * plotW;
    };
    const yToPx = (y: number) => padT + plotH - ((y - plotYMin) / ySpan) * plotH;

    // 5 evenly spaced Y ticks and X ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => plotYMax - t * ySpan);
    const isDiscreteSteps = activeToggle === 'scf' || activeToggle === 'relax' || activeToggle === 'trj';
    const totalDiscrete = seriesList[0]?.points.length || 1;
    const xTicks: number[] = isDiscreteSteps
      ? totalDiscrete <= 6
        ? Array.from({ length: totalDiscrete }, (_, i) => i + 1)
        : [
            1,
            Math.round(1 + (totalDiscrete - 1) * 0.25),
            Math.round(1 + (totalDiscrete - 1) * 0.5),
            Math.round(1 + (totalDiscrete - 1) * 0.75),
            totalDiscrete,
          ]
      : [0, 0.25, 0.5, 0.75, 1].map((t) => xMin + t * xSpan);

    const totalPointsCount = seriesList.reduce((acc, s) => acc + s.points.length, 0);
    const sphereRadius = totalPointsCount > 120 ? 3.2 : totalPointsCount > 40 ? 4.2 : 5.5;

    // Legend box dimensions inside top-right of plot area
    const legendWidth = Math.max(165, finalEnergyLegend.length * 6.5 + 26);
    const legendHeight = 24;
    const legendX = padL + plotW - legendWidth - 8;
    const legendY = padT + 8;

    return (
      <div className="w-full max-w-[400px] mx-auto aspect-square bg-white border border-slate-300 rounded-lg p-2 shadow-2xs">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full h-full select-none"
          style={fontStyle}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            {/* 3D Spherical symbol gradient for data points on white background */}
            <radialGradient id="spherePointGrad" cx="50%" cy="50%" r="50%" fx="32%" fy="30%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="28%" stopColor="#93c5fd" />
              <stop offset="68%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>

            {/* Highlighted 3D Spherical symbol gradient for active/hovered point */}
            <radialGradient id="spherePointActiveGrad" cx="50%" cy="50%" r="50%" fx="32%" fy="30%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="28%" stopColor="#fca5a5" />
              <stop offset="68%" stopColor="#dc2626" />
              <stop offset="100%" stopColor="#450a0a" />
            </radialGradient>

            <clipPath id="squarePlotClip">
              <rect x={padL - 8} y={padT - 8} width={plotW + 16} height={plotH + 16} />
            </clipPath>
          </defs>

          {/* White Background */}
          <rect x="0" y="0" width={SIZE} height={SIZE} fill="#ffffff" />

          {/* Grid lines */}
          {yTicks.map((yv, idx) => {
            const py = yToPx(yv);
            return (
              <line
                key={`yg-${idx}`}
                x1={padL}
                y1={py}
                x2={padL + plotW}
                y2={py}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          {xTicks.map((xv, idx) => {
            const px = xToPx(xv);
            return (
              <line
                key={`xg-${idx}`}
                x1={px}
                y1={padT}
                x2={px}
                y2={padT + plotH}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}

          {/* Reference line (e.g. Fermi level E - Ef = 0) */}
          {refLineY !== null && refLineY >= plotYMin && refLineY <= plotYMax && (
            <line
              x1={padL}
              y1={yToPx(refLineY)}
              x2={padL + plotW}
              y2={yToPx(refLineY)}
              stroke="#64748b"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
          )}

          {/* Square Plot Border */}
          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="none"
            stroke="#0f172a"
            strokeWidth="1.5"
          />

          {/* Y-axis ticks & labels (Arial) */}
          {yTicks.map((yv, idx) => {
            const py = yToPx(yv);
            return (
              <g key={`yt-${idx}`}>
                <line x1={padL - 5} y1={py} x2={padL} y2={py} stroke="#0f172a" strokeWidth="1.2" />
                <text
                  x={padL - 8}
                  y={py + 4}
                  textAnchor="end"
                  fill="#0f172a"
                  fontSize="11"
                  fontFamily="Arial, sans-serif"
                  style={fontStyle}
                >
                  {formatTick(yv, ySpan)}
                </text>
              </g>
            );
          })}

          {/* X-axis ticks & labels (Arial) */}
          {xTicks.map((xv, idx) => {
            const px = xToPx(xv);
            return (
              <g key={`xt-${idx}`}>
                <line
                  x1={px}
                  y1={padT + plotH}
                  x2={px}
                  y2={padT + plotH + 5}
                  stroke="#0f172a"
                  strokeWidth="1.2"
                />
                <text
                  x={px}
                  y={padT + plotH + 18}
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="11"
                  fontFamily="Arial, sans-serif"
                  style={fontStyle}
                >
                  {isDiscreteSteps ? Math.round(xv) : formatTick(xv, xSpan)}
                </text>
              </g>
            );
          })}

          {/* Axis Titles (Arial) */}
          <text
            x={padL + plotW / 2}
            y={SIZE - 18}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
            style={fontStyle}
          >
            {xLabel}
          </text>

          <text
            x={18}
            y={padT + plotH / 2}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
            style={fontStyle}
            transform={`rotate(-90, 18, ${padT + plotH / 2})`}
          >
            {yLabel}
          </text>

          {/* Hovered point readout at top of square graph (Arial) */}
          {hoveredPoint && (
            <text
              x={padL + plotW}
              y={padT - 8}
              textAnchor="end"
              fill="#0f172a"
              fontSize="11"
              fontFamily="Arial, sans-serif"
              style={fontStyle}
            >
              {hoveredPoint.label}: {hoveredPoint.value}
            </text>
          )}

          {/* Connecting Lines & Spherical Data Point Symbols */}
          <g clipPath="url(#squarePlotClip)">
            {seriesList.map((series, sIdx) => {
              if (series.points.length === 0) return null;
              const pathD = series.points
                .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xToPx(pt.x).toFixed(1)},${yToPx(pt.y).toFixed(1)}`)
                .join(' ');
              return (
                <g key={`series-${sIdx}`}>
                  {series.points.length > 1 && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#334155"
                      strokeWidth="1.4"
                    />
                  )}
                  {series.points.map((pt, pIdx) => {
                    const cx = xToPx(pt.x);
                    const cy = yToPx(pt.y);
                    const isCurrentFrame =
                      (activeToggle === 'trj' || activeToggle === 'relax') &&
                      pt.frameIdx !== undefined &&
                      pt.frameIdx === currentFrameIndex;
                    const r = isCurrentFrame ? sphereRadius + 2 : sphereRadius;
                    return (
                      <circle
                        key={`pt-${sIdx}-${pIdx}`}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={isCurrentFrame ? 'url(#spherePointActiveGrad)' : 'url(#spherePointGrad)'}
                        stroke="#0f172a"
                        strokeWidth="0.6"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint({ label: pt.label, value: pt.value })}
                        onClick={() => {
                          if (
                            (activeToggle === 'trj' || activeToggle === 'relax') &&
                            pt.frameIdx !== undefined
                          ) {
                            setIsPlaying(false);
                            setCurrentFrameIndex(pt.frameIdx);
                          }
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* Graph Legend showing Final Energy in the data (Arial) */}
          {finalEnergyLegend && (
            <g>
              <rect
                x={legendX}
                y={legendY}
                width={legendWidth}
                height={legendHeight}
                rx="3"
                fill="#ffffff"
                fillOpacity="0.95"
                stroke="#0f172a"
                strokeWidth="1"
              />
              <circle
                cx={legendX + 12}
                cy={legendY + legendHeight / 2}
                r={4.5}
                fill="url(#spherePointGrad)"
                stroke="#0f172a"
                strokeWidth="0.6"
              />
              <text
                x={legendX + 22}
                y={legendY + legendHeight / 2 + 4}
                fill="#0f172a"
                fontSize="11"
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
                style={fontStyle}
              >
                {finalEnergyLegend}
              </text>
            </g>
          )}
        </svg>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-white p-3 space-y-3 overflow-y-auto custom-scrollbar">
      {/* Hidden Folder & File Pickers */}
      <input
        ref={folderInputRef}
        type="file"
        {...({ webkitdirectory: '', directory: '' } as any)}
        multiple
        onChange={handleFolderInputChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".out"
        multiple
        onChange={handleOutFilesUpload}
        className="hidden"
      />

      {/* Local Folder & .out File Bar */}
      <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={handleSelectLocalFolder}
            className="h-7 px-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Select local project folder to extract .out files"
          >
            <FolderOpen size={13} />
            <span className="truncate max-w-[150px]">
              {localFolderName ? localFolderName : 'Open Local Folder'}
            </span>
          </button>

          <div className="flex items-center gap-1">
            {savedDirectoryHandle && (
              <button
                onClick={() => loadFromDirectoryHandle(savedDirectoryHandle, localFolderName || undefined)}
                disabled={isScanningFolder}
                className="h-7 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer"
                title="Refresh .out files from local folder"
              >
                <RefreshCw size={12} className={isScanningFolder ? 'animate-spin text-teal-600' : ''} />
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-7 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title="Select .out file(s)"
            >
              <FileUp size={12} className="text-teal-600" />
              <span>.out</span>
            </button>
          </div>
        </div>

        {folderFiles.length > 0 && (
          <select
            value={selectedFilePath}
            onChange={(e) => {
              setSelectedFilePath(e.target.value);
              setCurrentFrameIndex(0);
              setIsPlaying(false);
            }}
            className="w-full h-7 px-2 bg-white border border-slate-200 rounded-md text-xs font-mono text-slate-800 focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            {folderFiles.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Mode Toggles: SCF / Relax / Trj Movie / Band / DOS */}
      <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        {(
          [
            { id: 'scf', label: 'SCF' },
            { id: 'relax', label: 'Relax' },
            { id: 'trj', label: 'Trj Movie' },
            { id: 'band', label: 'Band' },
            { id: 'dos', label: 'DOS' },
          ] as const
        ).map((item) => {
          const isOn = activeToggle === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setIsPlaying(false);
                setHoveredPoint(null);
                setActiveToggle((prev) => (prev === item.id ? null : item.id));
              }}
              className={`h-7 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                isOn
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Simple Square Graph when Toggle is On */}
      {renderSquareGraph()}

      {/* Minimal Frame Controls when Relax or Trj Movie toggle is on and frames exist */}
      {(activeToggle === 'trj' || activeToggle === 'relax') && totalFrames > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-700">
            <span>
              Frame {currentFrameIndex + 1} / {totalFrames}
            </span>
            <span>
              {relaxSteps[currentFrameIndex]?.totalEnergyRy.toFixed(6)} Ry
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            step={1}
            value={currentFrameIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentFrameIndex(Number(e.target.value));
            }}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
          />

          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIndex(0);
              }}
              className="h-7 px-2 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center cursor-pointer"
              title="First frame"
            >
              <SkipBack size={13} />
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIndex((p) => Math.max(0, p - 1));
              }}
              className="h-7 px-2 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center cursor-pointer"
              title="Previous frame"
            >
              <StepBack size={13} />
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              disabled={totalFrames <= 1}
              className="h-7 px-3 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIndex((p) => Math.min(totalFrames - 1, p + 1));
              }}
              className="h-7 px-2 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center cursor-pointer"
              title="Next frame"
            >
              <StepForward size={13} />
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIndex(Math.max(0, totalFrames - 1));
              }}
              className="h-7 px-2 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center cursor-pointer"
              title="Last frame"
            >
              <SkipForward size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDashboard;
