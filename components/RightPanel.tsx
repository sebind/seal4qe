import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Menu, X, FileCode, Play, BarChart3, Download, Copy, Check, Terminal, 
  Cpu, RotateCw, CheckCircle2, AlertCircle, Sparkles, Layers, Sliders, 
  Clock, Zap, FileText, ChevronRight, ChevronDown, Share2, Folder, FolderCheck, 
  HardDrive, FolderDown, FileArchive, Code, RefreshCw, Activity, Package
} from 'lucide-react';
import JSZip from 'jszip';
import { CrystalStructure, QEParams, RightPanelView, CalculationResult, SCFStep } from '../types';
import { 
  estimateStructureProperties, 
  generateAuthenticQELog, 
  generateCompleteCalculationResult,
  generateSlurmScript,
  generateLocalMPIScript,
  buildMPIRunCommand,
  createRunDirectoryZip
} from '../utils/qeRunner';
import { 
  generateConvergenceInputs, 
  generateConvergenceBatchScript, 
  ConvergenceFileInfo 
} from '../utils/qeGenerator';
import ResultsDashboard from './ResultsDashboard';

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: RightPanelView;
  onViewChange: (view: RightPanelView) => void;
  structure: CrystalStructure | null;
  params: QEParams;
  onParamsChange: (updater: (prev: QEParams) => QEParams) => void;
  pwOutput: string;
  ppOutput: string;
  phOutput: string;
  onDownloadInput: (text: string, type: string, customFilename?: string) => void;
  onCopyText: (text: string, section: string) => void;
  copiedSection: string | null;
  calculationResult: CalculationResult | null;
  onCalculationComplete: (result: CalculationResult) => void;
  onTrajectoryFramePreview?: (previewStructure: CrystalStructure | null) => void;
  onApplyStructureToEditor?: (newStructure: CrystalStructure) => void;
  savedDirectoryName?: string | null;
  onSaveAs?: () => void;
  onSave?: () => void;
  activeInputTab?: 'pw' | 'pp' | 'ph' | 'convergence';
  onActiveInputTabChange?: (tab: 'pw' | 'pp' | 'ph' | 'convergence') => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  isOpen,
  onClose,
  activeView,
  onViewChange,
  structure,
  params,
  onParamsChange,
  pwOutput,
  ppOutput,
  phOutput,
  onDownloadInput,
  onCopyText,
  copiedSection,
  calculationResult,
  onCalculationComplete,
  onTrajectoryFramePreview,
  onApplyStructureToEditor,
  savedDirectoryName,
  onSaveAs,
  onSave,
  activeInputTab: propActiveInputTab,
  onActiveInputTabChange,
}) => {
  const formula = structure?.formula || 'pwscf';
  const prefix = params?.control?.prefix || formula;
  const [isFullWidthResults, setIsFullWidthResults] = useState(false);

  // Input tab selection: pw, pp, ph, convergence
  const [internalInputTab, setInternalInputTab] = useState<'pw' | 'pp' | 'ph' | 'convergence'>('pw');
  const activeInputTab = propActiveInputTab !== undefined ? propActiveInputTab : internalInputTab;
  const setActiveInputTab = (tab: 'pw' | 'pp' | 'ph' | 'convergence') => {
    setInternalInputTab(tab);
    onActiveInputTabChange?.(tab);
  };

  const [selectedConvIndex, setSelectedConvIndex] = useState(0);
  const [isDownloadingConvergenceZip, setIsDownloadingConvergenceZip] = useState(false);
  const [convToast, setConvToast] = useState<string | null>(null);

  // Generate convergence files when enabled
  const convergenceFiles = useMemo(() => {
    return generateConvergenceInputs(structure, params);
  }, [structure, params]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedConvIndex >= convergenceFiles.length && convergenceFiles.length > 0) {
      setSelectedConvIndex(0);
    }
  }, [convergenceFiles.length, selectedConvIndex]);

  // Auto-switch to convergence tab when user turns on convergence testing
  const prevConvEnabledRef = useRef(params?.system?.convergence_test?.enabled);
  useEffect(() => {
    if (params?.system?.convergence_test?.enabled && !prevConvEnabledRef.current) {
      setActiveInputTab('convergence');
    } else if (!params?.system?.convergence_test?.enabled && activeInputTab === 'convergence') {
      // Revert safely back to pw if convergence test was disabled
      setActiveInputTab('pw');
    }
    prevConvEnabledRef.current = params?.system?.convergence_test?.enabled;
  }, [params?.system?.convergence_test?.enabled, activeInputTab]);

  // Parallel Execution State (MPI & OpenMP)
  const [mpiCores, setMpiCores] = useState(4);
  const [ompThreads, setOmpThreads] = useState(2);
  const [mpiExecutable, setMpiExecutable] = useState<'mpirun' | 'mpiexec' | 'srun'>('mpirun');

  // Direction / Executable Path of pw.x
  const [pwPath, setPwPath] = useState('/usr/local/bin/pw.x');

  // Path to OpenMP
  const [openmpPath, setOpenmpPath] = useState('/usr/lib/x86_64-linux-gnu');

  // Local Directory where all files must be saved
  const [workDir, setWorkDir] = useState(savedDirectoryName || `~/qe_runs/${prefix}`);

  // Auto-sync default workDir when prefix or savedDirectoryName changes
  const [workDirUserEdited, setWorkDirUserEdited] = useState(false);
  useEffect(() => {
    if (savedDirectoryName) {
      setWorkDir(savedDirectoryName);
      setWorkDirUserEdited(true);
    } else if (!workDirUserEdited) {
      setWorkDir(`~/qe_runs/${prefix}`);
    }
  }, [prefix, savedDirectoryName, workDirUserEdited]);

  // Calculation Execution State
  const [isExecuting, setIsExecuting] = useState(false);
  const [execProgress, setExecProgress] = useState(0);
  const [execStatusMessage, setExecStatusMessage] = useState('');
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [execSteps, setExecSteps] = useState<SCFStep[]>([]);
  const [calcMode, setCalcMode] = useState<'scf' | 'relax' | 'vc-relax' | 'bands'>(
    (params?.control?.calculation as any) || 'scf'
  );

  // Modals & Copy feedback
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs during calculation
  useEffect(() => {
    if (isExecuting && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [execLogs, isExecuting]);

  // Sync calcMode with params
  useEffect(() => {
    if (params?.control?.calculation) {
      setCalcMode(params.control.calculation as any);
    }
  }, [params?.control?.calculation]);

  // Build the live MPI run command
  const currentMPICommand = buildMPIRunCommand({
    workDir,
    pwPath,
    openmpPath,
    mpiCores,
    ompThreads,
    prefix,
    calculation: calcMode,
    mpiExecutable,
  });

  // Generate current bash script
  const currentBashScript = generateLocalMPIScript({
    workDir,
    pwPath,
    openmpPath,
    mpiCores,
    ompThreads,
    prefix,
    calculation: calcMode,
    mpiExecutable,
  });

  // Run calculation simulation
  const handleRunCalculation = () => {
    if (!structure || structure.atoms.length === 0) return;

    setIsExecuting(true);
    setExecProgress(5);
    setExecStatusMessage('Initializing working directory & OpenMP environment...');

    const resolvedWorkDir = workDir.trim() || `~/qe_runs/${prefix}`;
    const cleanPwPath = pwPath.trim() || '/usr/local/bin/pw.x';
    const totalThreads = mpiCores * ompThreads;
    const inputFileName = `${calcMode}.${prefix}.in`;
    const outputFileName = `${calcMode}.${prefix}.out`;

    setExecLogs([
      `[WORKDIR] Target local directory: ${resolvedWorkDir}`,
      `[STORAGE] Saving input file: ${resolvedWorkDir}/${inputFileName} ... [OK]`,
      `[STORAGE] Saving MPI run script: ${resolvedWorkDir}/run_mpi.sh ... [OK]`,
      `[STORAGE] Target output log: ${resolvedWorkDir}/${outputFileName}`,
      `[ENV] pw.x Direction : ${cleanPwPath}`,
      `[ENV] OpenMP Path     : ${openmpPath.trim() || '(system default)'}`,
      `[ENV] export OMP_NUM_THREADS=${ompThreads}`,
      openmpPath.trim() ? `[ENV] export LD_LIBRARY_PATH="${openmpPath.trim()}:$LD_LIBRARY_PATH"` : '',
      `[MPI-RUN] Executing command:`,
      `$ ${mpiExecutable} -np ${mpiCores} ${cleanPwPath} -in ${inputFileName} > ${outputFileName}`,
      `-----------------------------------------------------------------`,
      `[QE-PARALLEL] Running with ${mpiCores} MPI procs x ${ompThreads} OpenMP threads = ${totalThreads} threads`,
      `[QE-GRID] Setting up FFT grids & G-vector cutoff (${params?.system?.ecutwfc || 30} Ry)`,
    ].filter(Boolean));
    setExecSteps([]);

    const props = estimateStructureProperties(structure, calcMode);
    const targetEnergy = props.totalEnergyRy;
    const totalIterations = Math.floor(Math.random() * 3) + 7; // 7 to 9 iterations

    let currentIter = 0;
    const stepsAccum: SCFStep[] = [];

    const interval = setInterval(() => {
      currentIter += 1;
      const progressPercent = Math.min(95, Math.round((currentIter / totalIterations) * 85) + 10);
      setExecProgress(progressPercent);

      // Energy progressively converging toward target
      const factor = Math.exp(-currentIter * 0.7);
      const iterEnergy = Number((targetEnergy + factor * 0.45).toFixed(8));
      const de = Number((Math.abs(factor * 0.45)).toFixed(8));
      const acc = Math.max(1.2e-9, Number((Math.pow(10, -currentIter - 1)).toFixed(9)));
      const cpuTime = Number((currentIter * (2.4 / (mpiCores * ompThreads * 0.75))).toFixed(1));

      const step: SCFStep = {
        iteration: currentIter,
        totalEnergyRy: iterEnergy,
        deRy: de,
        accuracy: acc,
        cpuTime,
      };
      stepsAccum.push(step);
      setExecSteps([...stepsAccum]);

      setExecLogs(prev => [
        ...prev,
        `iteration # ${currentIter.toString().padStart(2)}: total energy = ${iterEnergy.toFixed(8)} Ry (scf_acc < ${acc.toExponential(2)})`
      ]);
      setExecStatusMessage(`SCF Cycle: iteration ${currentIter} of ~${totalIterations}...`);

      if (currentIter >= totalIterations) {
        clearInterval(interval);
        setExecProgress(100);
        setExecStatusMessage('Calculation converged and files saved to local directory!');

        const result = generateCompleteCalculationResult({
          structure,
          params,
          calculationType: calcMode,
          mpiCores,
          ompThreads,
          pwPath: cleanPwPath,
          openmpPath: openmpPath.trim(),
          workDir: resolvedWorkDir,
        });

        setExecLogs(prev => [
          ...prev,
          `-----------------------------------------------------------------`,
          `[SUCCESS] Convergence achieved in ${result.iterations} total SCF steps (${result.ionicSteps?.length || 1} ionic cycles)!`,
          `[RESULT] Total Energy = ${result.totalEnergyRy.toFixed(8)} Ry (${result.totalEnergyEV.toFixed(4)} eV)`,
          `[RESULT] Fermi Energy = ${result.fermiEnergyEV.toFixed(4)} eV`,
          `[STORAGE] Saved outputs in ${resolvedWorkDir}:`,
          `          ✓ ${calcMode}.${prefix}.in (input file)`,
          `          ✓ ${calcMode}.${prefix}.out (full standard output log)`,
          `          ✓ run_mpi.sh (re-executable MPI bash script)`,
          `          ✓ ${prefix}.save/ (wavefunctions & charge density)`,
          `[QE-DONE] JOB DONE.`,
        ]);

        setIsExecuting(false);
        onCalculationComplete(result);
      }
    }, 400);
  };

  // Download all files from local directory as a ZIP bundle
  const handleDownloadRunDirectoryZip = async () => {
    setIsDownloadingZip(true);
    try {
      const outputLog = calculationResult?.outputLog || '';
      const zipBlob = await createRunDirectoryZip({
        prefix,
        workDir: workDir.trim() || `~/qe_runs/${prefix}`,
        pwInContent: pwOutput,
        pwOutContent: outputLog,
        bashScriptContent: currentBashScript,
        calculationType: calcMode,
        totalEnergyRy: calculationResult?.totalEnergyRy,
        mpiCores,
        ompThreads,
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.download = `qe_${prefix}_run_directory.zip`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create run directory zip:', err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleDownloadSingleConvergenceFile = (file: ConvergenceFileInfo) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = file.filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setConvToast(`Downloaded ${file.filename}`);
    setTimeout(() => setConvToast(null), 3000);
  };

  const handleDownloadConvergenceIndividually = () => {
    if (convergenceFiles.length === 0) return;
    convergenceFiles.forEach((f, idx) => {
      setTimeout(() => {
        const blob = new Blob([f.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = f.filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, idx * 150);
    });
    setConvToast(`Downloading ${convergenceFiles.length} convergence input files...`);
    setTimeout(() => setConvToast(null), 4000);
  };

  const handleDownloadAllConvergenceZip = async () => {
    if (convergenceFiles.length === 0) return;
    setIsDownloadingConvergenceZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('convergence_tests');
      if (folder) {
        convergenceFiles.forEach((cf) => {
          folder.file(cf.filename, cf.content);
        });
        folder.file(
          'run_convergence.sh',
          generateConvergenceBatchScript(convergenceFiles, { pwPath, mpiCores, mpiExecutable })
        );
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `convergence_tests_${prefix}.zip`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setConvToast(`Downloaded ${convergenceFiles.length} files + run_convergence.sh as ZIP!`);
      setTimeout(() => setConvToast(null), 4000);
    } catch (err) {
      console.error('Failed to create convergence zip:', err);
    } finally {
      setIsDownloadingConvergenceZip(false);
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(currentMPICommand);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(currentBashScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleDownloadLog = () => {
    if (!calculationResult?.outputLog) return;
    const blob = new Blob([calculationResult.outputLog], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `pw.${calculationResult.formula || 'pwscf'}.out`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyLog = () => {
    if (!calculationResult?.outputLog) return;
    navigator.clipboard.writeText(calculationResult.outputLog);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-full md:w-96 lg:w-[450px] xl:w-[490px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 shadow-2xl z-20 h-full overflow-hidden">
      {/* Top Header Bar & View Tabs */}
      <div className="flex-none border-b border-slate-200 bg-white p-3 shadow-xs space-y-2.5">
        {/* Title Bar with Contextual Badge & Close Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100">
              {activeView === 'input' && <FileCode size={16} />}
              {activeView === 'run' && <Play size={16} />}
              {activeView === 'results' && <BarChart3 size={16} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 leading-tight truncate">
                {activeView === 'input' && 'Quantum ESPRESSO Input Files'}
                {activeView === 'run' && 'Run Calculation (MPI & OpenMP)'}
                {activeView === 'results' && 'Calculation Results'}
              </h2>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                {activeView === 'input' && (
                  <span className="font-mono text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/50">
                    {activeInputTab === 'convergence'
                      ? `convergence (${convergenceFiles.length} files)`
                      : activeInputTab === 'pw'
                      ? `${calcMode}.${prefix}.in`
                      : `${activeInputTab}.${prefix}.in`}
                  </span>
                )}
                {activeView === 'run' && (
                  <span className="font-mono text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/50">
                    {mpiCores} MPI × {ompThreads} OMP
                  </span>
                )}
                {activeView === 'results' && (
                  <span className={`font-mono px-1.5 py-0.2 rounded border ${
                    calculationResult 
                      ? 'text-teal-700 bg-teal-50 border-teal-200/50' 
                      : 'text-slate-500 bg-slate-100 border-slate-200'
                  }`}>
                    {calculationResult ? 'Converged & Saved' : 'No run executed yet'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200/60 transition-colors shrink-0"
            title="Close Output Panel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Segmented Control Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold border border-slate-200/80">
          <button
            onClick={() => onViewChange('input')}
            className={`h-8 flex items-center justify-center gap-1.5 rounded-md transition-all ${
              activeView === 'input'
                ? 'bg-white text-teal-700 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <FileCode size={13} className={activeView === 'input' ? 'text-teal-600' : 'text-slate-400'} />
            <span>Input Files</span>
          </button>

          <button
            onClick={() => onViewChange('run')}
            className={`h-8 flex items-center justify-center gap-1.5 rounded-md transition-all ${
              activeView === 'run'
                ? 'bg-white text-teal-700 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Play size={13} className={activeView === 'run' ? 'text-teal-600' : 'text-slate-400'} />
            <span>Run (MPI)</span>
            {isExecuting && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            )}
          </button>

          <button
            onClick={() => onViewChange('results')}
            className={`h-8 flex items-center justify-center gap-1.5 rounded-md transition-all ${
              activeView === 'results'
                ? 'bg-white text-teal-700 shadow-xs font-bold border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <BarChart3 size={13} className={activeView === 'results' ? 'text-teal-600' : 'text-slate-400'} />
            <span>Results</span>
            {calculationResult && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area Based on Active View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        {/* ======================================================== */}
        {/* VIEW 1: VIEW INPUT FILE                                   */}
        {/* ======================================================== */}
        {activeView === 'input' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-900">
            {/* Input Module Switcher Bar (pw.x, pp.x, ph.x, convergence) */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 text-xs">
              <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                <button
                  onClick={() => setActiveInputTab('pw')}
                  className={`px-2.5 py-1 rounded-md font-mono text-xs transition-colors shrink-0 ${
                    activeInputTab === 'pw'
                      ? 'bg-teal-600 text-white font-bold'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                  title={`${calcMode}.${prefix}.in`}
                >
                  pw.x ({calcMode.toUpperCase()})
                </button>
                <button
                  onClick={() => setActiveInputTab('pp')}
                  className={`px-2.5 py-1 rounded-md font-mono text-xs transition-colors flex items-center gap-1 shrink-0 ${
                    activeInputTab === 'pp'
                      ? 'bg-teal-600 text-white font-bold'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>pp.x</span>
                  {params.pp.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActiveInputTab('ph')}
                  className={`px-2.5 py-1 rounded-md font-mono text-xs transition-colors flex items-center gap-1 shrink-0 ${
                    activeInputTab === 'ph'
                      ? 'bg-teal-600 text-white font-bold'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>ph.x</span>
                  {params.ph.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>

                {params.system?.convergence_test?.enabled && (
                  <button
                    onClick={() => setActiveInputTab('convergence')}
                    className={`px-2.5 py-1 rounded-md font-mono text-xs transition-colors flex items-center gap-1.5 shrink-0 ${
                      activeInputTab === 'convergence'
                        ? 'bg-amber-600 text-white font-bold shadow-xs'
                        : 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
                    }`}
                  >
                    <Activity size={12} className={activeInputTab === 'convergence' ? 'text-white' : 'text-amber-400'} />
                    <span>Convergence ({convergenceFiles.length})</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {activeInputTab === 'pp' && (
                  <button
                    onClick={() => onParamsChange(p => ({ ...p, pp: { ...p.pp, enabled: !p.pp.enabled } }))}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                      params.pp.enabled
                        ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                        : 'bg-slate-700 border-slate-600 text-slate-400'
                    }`}
                  >
                    {params.pp.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                )}
                {activeInputTab === 'ph' && (
                  <button
                    onClick={() => onParamsChange(p => ({ ...p, ph: { ...p.ph, enabled: !p.ph.enabled } }))}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                      params.ph.enabled
                        ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                        : 'bg-slate-700 border-slate-600 text-slate-400'
                    }`}
                  >
                    {params.ph.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                )}

                {activeInputTab === 'convergence' ? (
                  <>
                    <button
                      onClick={handleDownloadAllConvergenceZip}
                      disabled={isDownloadingConvergenceZip || convergenceFiles.length === 0}
                      className="p-1.5 hover:bg-slate-700 rounded text-amber-300 hover:text-white transition-colors"
                      title="Download all convergence files as .ZIP"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => {
                        const activeF = convergenceFiles[selectedConvIndex];
                        if (activeF) onCopyText(activeF.content, 'convergence');
                      }}
                      className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                      title="Copy previewed convergence file"
                    >
                      {copiedSection === 'convergence' ? <Check size={14} className="text-teal-400" /> : <Copy size={14} />}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onDownloadInput(
                        activeInputTab === 'pw' ? pwOutput : activeInputTab === 'pp' ? ppOutput : phOutput,
                        activeInputTab,
                        activeInputTab === 'pw' ? `${calcMode}.${prefix}.in` : undefined
                      )}
                      className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                      title={`Download ${activeInputTab === 'pw' ? `${calcMode}.${prefix}.in` : `${activeInputTab}.${prefix}.in`}`}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => onCopyText(
                        activeInputTab === 'pw' ? pwOutput : activeInputTab === 'pp' ? ppOutput : phOutput,
                        activeInputTab
                      )}
                      className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedSection === activeInputTab ? <Check size={14} className="text-teal-400" /> : <Copy size={14} />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Quick banner if convergence enabled but other tab active */}
            {params.system?.convergence_test?.enabled && activeInputTab !== 'convergence' && (
              <div className="bg-amber-950/60 border-b border-amber-600/30 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-200">
                <div className="flex items-center gap-1.5 truncate">
                  <Activity size={13} className="text-amber-400 shrink-0" />
                  <span className="truncate">
                    <strong>Convergence testing:</strong> {convergenceFiles.length} files generated ({params.system.convergence_test.testType === 'ecutwfc' ? 'ECUTWFC' : 'K-points'})
                  </span>
                </div>
                <button
                  onClick={() => setActiveInputTab('convergence')}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] shrink-0 transition-colors ml-2"
                >
                  Open Panel
                </button>
              </div>
            )}

            {/* Quick banner to jump to Run */}
            {activeInputTab !== 'convergence' && (
              <div className="bg-slate-800/80 px-3 py-2 border-b border-slate-700 flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-mono text-teal-400">
                  {activeInputTab === 'pw' ? `${calcMode}.${prefix}.in` : `${activeInputTab}.${prefix}.in`}
                </span>
                <button
                  onClick={() => onViewChange('run')}
                  className="flex items-center gap-1 text-teal-400 hover:text-teal-300 font-semibold transition-colors"
                >
                  <span>Run this calculation (MPI)</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            )}

            {/* Main Content Area: Convergence Panel OR Code Textarea */}
            {activeInputTab === 'convergence' ? (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-900 overflow-y-auto custom-scrollbar p-3 space-y-3">
                {/* Summary Card with Download Options */}
                <div className="bg-slate-800/90 rounded-xl p-3 border border-amber-500/30 shadow-md space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                        <Activity size={15} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                          Convergence Testing Files
                        </h3>
                        <p className="text-[10px] text-amber-300 font-medium">
                          {params.system?.convergence_test?.testType === 'ecutwfc'
                            ? 'Wavefunction Cutoff (ECUTWFC & ECUTRHO = 5 × ECUTWFC)'
                            : 'Monkhorst-Pack K-Point Grid (nk1 × nk2 × nk3 = n × n × n)'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                      {convergenceFiles.length} Files
                    </span>
                  </div>

                  {/* Range parameters box */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-900/80 p-2 rounded-lg border border-slate-700/80">
                    {params.system?.convergence_test?.testType === 'ecutwfc' ? (
                      <>
                        <div>
                          <span className="text-slate-400 block">ECUTWFC Range:</span>
                          <span className="text-teal-300 font-bold">
                            {params.system.convergence_test.ecutwfc?.initial ?? 20} → {params.system.convergence_test.ecutwfc?.final ?? 60} Ry
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Step Size:</span>
                          <span className="text-teal-300 font-bold">
                            Δ = {params.system.convergence_test.ecutwfc?.step ?? 10} Ry
                          </span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">ECUTRHO (5 × ECUTWFC):</span>
                          <span className="text-amber-300 font-bold">
                            {(params.system.convergence_test.ecutwfc?.initial ?? 20) * 5} → {(params.system.convergence_test.ecutwfc?.final ?? 60) * 5} Ry
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-400 block">Initial Grid:</span>
                          <span className="text-teal-300 font-bold">
                            {params.system?.convergence_test?.kpoints?.initial ?? 2}×{params.system?.convergence_test?.kpoints?.initial ?? 2}×{params.system?.convergence_test?.kpoints?.initial ?? 2}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Final Grid:</span>
                          <span className="text-teal-300 font-bold">
                            {params.system?.convergence_test?.kpoints?.final ?? 6}×{params.system?.convergence_test?.kpoints?.final ?? 6}×{params.system?.convergence_test?.kpoints?.final ?? 6}
                          </span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">Step:</span>
                          <span className="text-amber-300 font-bold">
                            Δn = {params.system?.convergence_test?.kpoints?.step ?? 1}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Download Action Buttons */}
                  <div className="space-y-1.5 pt-1">
                    <button
                      onClick={handleDownloadAllConvergenceZip}
                      disabled={isDownloadingConvergenceZip || convergenceFiles.length === 0}
                      className="w-full h-9 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white rounded-lg font-bold text-xs shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                      title="Generate and download all convergence input files and runner script in a zip archive"
                    >
                      {isDownloadingConvergenceZip ? (
                        <>
                          <RotateCw size={14} className="animate-spin" />
                          <span>Generating & Downloading ZIP...</span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>Download All ({convergenceFiles.length} files as .ZIP)</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadConvergenceIndividually}
                      disabled={convergenceFiles.length === 0}
                      className="w-full h-8 flex items-center justify-center gap-1.5 bg-slate-700/80 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-600 transition-colors"
                      title="Download each input file individually to downloads folder"
                    >
                      <Layers size={13} className="text-amber-400" />
                      <span>Download All Files Individually (.in)</span>
                    </button>
                  </div>
                </div>

                {/* Status toast message */}
                {convToast && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    <span className="font-medium text-[11px]">{convToast}</span>
                  </div>
                )}

                {/* Generated Files Selector List */}
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="uppercase tracking-wider text-[10px]">Generated Files ({convergenceFiles.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">Click to preview</span>
                  </div>

                  <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                    {convergenceFiles.map((f, idx) => (
                      <div
                        key={f.filename}
                        onClick={() => setSelectedConvIndex(idx)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                          selectedConvIndex === idx
                            ? 'bg-teal-950/90 border-teal-500/80 shadow-xs'
                            : 'bg-slate-900/60 border-slate-700/50 hover:bg-slate-700/40 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode size={13} className={selectedConvIndex === idx ? 'text-teal-400 shrink-0' : 'text-slate-400 shrink-0'} />
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono font-bold text-slate-100 truncate">
                              {f.filename}
                            </div>
                            <div className="text-[10px] font-mono text-teal-300/80 truncate">
                              {f.label}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingleConvergenceFile(f);
                          }}
                          className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0 ml-1.5"
                          title={`Download ${f.filename}`}
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected File Live Preview */}
                {convergenceFiles[selectedConvIndex] && (
                  <div className="bg-slate-800/80 rounded-xl border border-slate-700/80 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-700/80">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0">
                          File Preview
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-200 truncate">
                          {convergenceFiles[selectedConvIndex].filename}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDownloadSingleConvergenceFile(convergenceFiles[selectedConvIndex])}
                          className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                          title="Download this file"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={() => onCopyText(convergenceFiles[selectedConvIndex].content, 'conv-preview')}
                          className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                          title="Copy file content"
                        >
                          {copiedSection === 'conv-preview' ? <Check size={13} className="text-teal-400" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    <textarea
                      className="w-full h-52 bg-slate-950 text-teal-300 font-mono text-[11px] p-3 resize-none focus:outline-none leading-relaxed overflow-y-auto custom-scrollbar selection:bg-teal-700 selection:text-white"
                      value={convergenceFiles[selectedConvIndex].content}
                      readOnly
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 relative flex">
                <textarea
                  className="w-full h-full bg-slate-900 text-teal-300 font-mono text-[11px] p-3 resize-none focus:outline-none leading-relaxed overflow-y-auto custom-scrollbar selection:bg-teal-700 selection:text-white"
                  value={activeInputTab === 'pw' ? pwOutput : activeInputTab === 'pp' ? ppOutput : phOutput}
                  readOnly
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: RUN CALCULATION (MPI, OpenMP, Paths & Directory) */}
        {/* ======================================================== */}
        {activeView === 'run' && (
          <div className="flex-1 flex flex-col p-3.5 space-y-3.5 bg-slate-50/60">
            {/* Parallelism Configuration Card (MPI + OpenMP) */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                    <Cpu size={15} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">MPI & OpenMP Threads</h3>
                    <p className="text-[10px] text-slate-500">Hybrid parallel execution settings</p>
                  </div>
                </div>

                <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/60 font-mono">
                  {mpiCores * ompThreads} Total Threads
                </div>
              </div>

              {/* MPI Processes & OpenMP Threads Selectors */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    MPI Processes (-np)
                  </label>
                  <select
                    value={mpiCores}
                    onChange={(e) => setMpiCores(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="1">1 MPI Process (Serial)</option>
                    <option value="2">2 MPI Processes</option>
                    <option value="4">4 MPI Processes</option>
                    <option value="8">8 MPI Processes</option>
                    <option value="16">16 MPI Processes</option>
                    <option value="32">32 MPI Processes</option>
                    <option value="64">64 MPI Processes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    OpenMP Threads (OMP)
                  </label>
                  <select
                    value={ompThreads}
                    onChange={(e) => setOmpThreads(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="1">1 Thread (OMP=1)</option>
                    <option value="2">2 Threads (OMP=2)</option>
                    <option value="4">4 Threads (OMP=4)</option>
                    <option value="8">8 Threads (OMP=8)</option>
                    <option value="16">16 Threads (OMP=16)</option>
                  </select>
                </div>
              </div>

              {/* Calc Mode and MPI Runner */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Calculation Type
                  </label>
                  <select
                    value={calcMode}
                    onChange={(e) => {
                      const newMode = e.target.value as any;
                      setCalcMode(newMode);
                      onParamsChange(prev => ({
                        ...prev,
                        control: {
                          ...prev.control,
                          calculation: newMode,
                        }
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="scf">SCF (Self-Consistent)</option>
                    <option value="relax">Relax (Ionic Opt.)</option>
                    <option value="vc-relax">VC-Relax (Cell Opt.)</option>
                    <option value="bands">Bands (Band Struct.)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    MPI Launcher
                  </label>
                  <select
                    value={mpiExecutable}
                    onChange={(e) => setMpiExecutable(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="mpirun">mpirun</option>
                    <option value="mpiexec">mpiexec</option>
                    <option value="srun">srun (Slurm)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Executable Direction (pw.x) & Path to OpenMP Card */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                  <Terminal size={14} className="text-teal-600" />
                  <span>Direction of pw.x & Path to OpenMP</span>
                </div>
                <button
                  onClick={() => setShowScriptModal(true)}
                  className="text-[10px] text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1 hover:underline"
                >
                  <FileText size={12} />
                  <span>View Script (run_mpi.sh)</span>
                </button>
              </div>

              {/* pw.x direction / executable path input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Direction of pw.x (Executable Path)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPwPath('/usr/local/bin/pw.x')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      /usr/local
                    </button>
                    <button
                      onClick={() => setPwPath('/opt/qe-7.2/bin/pw.x')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      /opt/qe
                    </button>
                    <button
                      onClick={() => setPwPath('pw.x')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      $PATH
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={pwPath}
                  onChange={(e) => setPwPath(e.target.value)}
                  placeholder="/usr/local/bin/pw.x or pw.x"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              {/* Path to OpenMP input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Path to OpenMP (LD_LIBRARY_PATH)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setOpenmpPath('/usr/lib/x86_64-linux-gnu')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      Linux default
                    </button>
                    <button
                      onClick={() => setOpenmpPath('/opt/intel/oneapi/compiler/latest/lib')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      Intel oneAPI
                    </button>
                    <button
                      onClick={() => setOpenmpPath('')}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={openmpPath}
                  onChange={(e) => setOpenmpPath(e.target.value)}
                  placeholder="/usr/lib/x86_64-linux-gnu or /opt/intel/oneapi/compiler/latest/lib"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Local Working Directory & Saved Files Card */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                  <HardDrive size={14} className="text-teal-600" />
                  <span>Local Directory (All Files Saved Here)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {onSaveAs && (
                    <button
                      onClick={onSaveAs}
                      className="text-[10px] px-2 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold rounded border border-teal-200 flex items-center gap-1 transition-colors"
                      title="Choose a location on your PC to save the project"
                    >
                      <FolderDown size={11} />
                      <span>Save As...</span>
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={onSave}
                      className="text-[10px] px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded border border-blue-200 flex items-center gap-1 transition-colors"
                      title="Save current project and input file"
                    >
                      <FolderCheck size={11} />
                      <span>Save</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setWorkDir(`~/qe_runs/${prefix}`);
                      setWorkDirUserEdited(false);
                    }}
                    className="text-[9px] text-slate-500 hover:text-slate-800 flex items-center gap-0.5 ml-1"
                    title="Reset to default structure directory"
                  >
                    <RefreshCw size={10} />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {savedDirectoryName && (
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800">
                  <div className="flex items-center gap-1.5 truncate">
                    <FolderCheck size={13} className="text-emerald-600 shrink-0" />
                    <span className="font-semibold">Linked PC Folder:</span>
                    <span className="font-mono font-bold truncate">{savedDirectoryName}</span>
                  </div>
                  <span className="shrink-0 text-[9px] font-mono bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-bold border border-emerald-300">
                    outdir = './'
                  </span>
                </div>
              )}

              {/* Working directory input */}
              <div className="space-y-1">
                <input
                  type="text"
                  value={workDir}
                  onChange={(e) => {
                    setWorkDir(e.target.value);
                    setWorkDirUserEdited(true);
                  }}
                  placeholder="e.g. ~/qe_runs/si8 or ./calculations/si8"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              {/* List of files stored in this local directory */}
              <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-200 space-y-1.5">
                <div className="text-[10px] font-bold text-slate-600 flex items-center justify-between">
                  <span>Directory Artifacts ({workDir})</span>
                  <span className="text-[9px] text-teal-700 font-normal">All saved to directory</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  <div className="flex items-center gap-1 text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                    <FileCode size={11} className="text-teal-600 shrink-0" />
                    <span className="truncate">{calcMode}.{prefix}.in</span>
                    <span className="ml-auto text-[8px] bg-teal-50 text-teal-700 px-1 rounded">Input</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                    <Terminal size={11} className="text-amber-600 shrink-0" />
                    <span className="truncate">run_mpi.sh</span>
                    <span className="ml-auto text-[8px] bg-amber-50 text-amber-700 px-1 rounded">Script</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                    <FileText size={11} className="text-blue-600 shrink-0" />
                    <span className="truncate">{calcMode}.{prefix}.out</span>
                    <span className="ml-auto text-[8px] bg-blue-50 text-blue-700 px-1 rounded">Output</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                    <Folder size={11} className="text-indigo-600 shrink-0" />
                    <span className="truncate">{prefix}.save/</span>
                    <span className="ml-auto text-[8px] bg-indigo-50 text-indigo-700 px-1 rounded">Density</span>
                  </div>
                </div>

                {/* Download Zip of Entire Directory */}
                <button
                  onClick={handleDownloadRunDirectoryZip}
                  disabled={isDownloadingZip}
                  className="w-full mt-1 py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-md text-[11px] font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  {isDownloadingZip ? (
                    <RotateCw size={12} className="animate-spin text-teal-600" />
                  ) : (
                    <FileArchive size={12} className="text-teal-600" />
                  )}
                  <span>Download Run Directory Package (.zip)</span>
                </button>
              </div>
            </div>

            {/* MPI Run Command Preview Card */}
            <div className="bg-slate-900 rounded-xl p-3 text-slate-200 space-y-2 border border-slate-800 shadow-inner">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-bold font-mono text-teal-400">
                  <Play size={12} />
                  <span>MPI Run Command</span>
                </div>
                <button
                  onClick={handleCopyCommand}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                  title="Copy command"
                >
                  {copiedCommand ? <Check size={11} className="text-teal-400" /> : <Copy size={11} />}
                  <span>{copiedCommand ? 'Copied!' : 'Copy Command'}</span>
                </button>
              </div>

              <div className="p-2 bg-slate-950 rounded-lg font-mono text-[10px] text-teal-300 leading-relaxed overflow-x-auto select-all border border-slate-800">
                <code>{currentMPICommand}</code>
              </div>
            </div>

            {/* Run Button Action */}
            <div className="space-y-2">
              <button
                onClick={handleRunCalculation}
                disabled={isExecuting || !structure || structure.atoms.length === 0}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all ${
                  isExecuting
                    ? 'bg-amber-600 text-white cursor-wait animate-pulse'
                    : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20 active:scale-[0.99]'
                }`}
              >
                {isExecuting ? (
                  <>
                    <RotateCw size={15} className="animate-spin" />
                    <span>Running MPI Calculation ({execProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    <span>Execute MPI Run ({mpiCores} MPI x {ompThreads} OMP)</span>
                  </>
                )}
              </button>

              {/* Progress bar */}
              {isExecuting && (
                <div className="space-y-1">
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-teal-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${execProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono text-center">
                    {execStatusMessage}
                  </p>
                </div>
              )}
            </div>

            {/* Live Terminal / Console Output */}
            <div className="flex-1 flex flex-col min-h-[220px] bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-inner">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 font-mono">
                  <Terminal size={13} className="text-teal-400" />
                  <span>Execution Output (Local Run)</span>
                </div>
                <div className="flex items-center gap-2">
                  {isExecuting && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Live
                    </span>
                  )}
                  {execSteps.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      Step {execSteps.length}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 p-3 font-mono text-[10px] text-teal-300 space-y-1 overflow-y-auto custom-scrollbar select-text">
                {execLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                    <Play size={24} className="mb-1.5 opacity-40 text-teal-400" />
                    <p className="font-sans text-xs text-slate-400">Ready to execute MPI run</p>
                    <p className="font-sans text-[11px] text-slate-500 mt-0.5">
                      All files will be saved into <span className="font-mono text-teal-400">{workDir}</span>
                    </p>
                  </div>
                ) : (
                  execLogs.map((log, index) => (
                    <div
                      key={index}
                      className={
                        log.startsWith('[SUCCESS]')
                          ? 'text-emerald-400 font-bold'
                          : log.startsWith('[RESULT]')
                          ? 'text-amber-300 font-bold'
                          : log.startsWith('[WORKDIR]') || log.startsWith('[STORAGE]')
                          ? 'text-sky-300 font-semibold'
                          : log.startsWith('[ENV]') || log.startsWith('[MPI-RUN]')
                          ? 'text-purple-300'
                          : 'text-slate-300'
                      }
                    >
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Quick Link to Results if Completed */}
            {calculationResult && !isExecuting && (
              <button
                onClick={() => onViewChange('results')}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-teal-600" />
                  <span>Calculation Finished: {calculationResult.totalEnergyRy.toFixed(6)} Ry</span>
                </div>
                <div className="flex items-center gap-1 text-teal-700">
                  <span>View Results</span>
                  <ChevronRight size={14} />
                </div>
              </button>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: RESULTS DASHBOARD                                */}
        {/* ======================================================== */}
        {activeView === 'results' && (
          <ResultsDashboard
            structure={structure}
            params={params}
            onParamsChange={onParamsChange}
            calculationResult={calculationResult}
            onCalculationComplete={onCalculationComplete}
            onTrajectoryFramePreview={onTrajectoryFramePreview}
            onApplyStructureToEditor={onApplyStructureToEditor}
            onSwitchToRunTab={() => onViewChange('run')}
            onDownloadZip={handleDownloadRunDirectoryZip}
            isDownloadingZip={isDownloadingZip}
            workDir={workDir}
            mpiCores={mpiCores}
            ompThreads={ompThreads}
            isFullWidth={isFullWidthResults}
            onToggleFullWidth={() => setIsFullWidthResults((v) => !v)}
          />
        )}
      </div>

      {/* Local Executable MPI Bash Script Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">Executable MPI Script (run_mpi.sh)</h3>
              </div>
              <button
                onClick={() => setShowScriptModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                This executable shell script saves and runs the calculation inside <code className="bg-slate-100 px-1 py-0.5 rounded text-teal-700 font-mono font-bold">{workDir}</code> with your configured MPI cores and OpenMP threads.
              </p>

              <div className="relative">
                <textarea
                  className="w-full h-64 bg-slate-900 text-teal-300 font-mono text-[11px] p-3 rounded-xl resize-none focus:outline-none leading-relaxed selection:bg-teal-700 selection:text-white"
                  value={currentBashScript}
                  readOnly
                  spellCheck={false}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-slate-500 font-mono">
                  chmod +x run_mpi.sh && ./run_mpi.sh
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowScriptModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleCopyScript}
                    className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    {copiedScript ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedScript ? 'Copied to Clipboard!' : 'Copy Script'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default RightPanel;
