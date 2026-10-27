import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileUp,
  Film,
  Gauge,
  Layers,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  Atom,
  CalculationResult,
  CrystalStructure,
  QEParams,
  SCFStep,
} from '../types';
import { ELEMENT_COLORS } from '../constants';
import { latticeMatrixToParams } from '../utils/latticeUtils';
import {
  buildRealisticIonicTrajectory,
  calculateCellVolume,
  parseQEOutputLog,
  RY_BOHR_TO_EV_ANG,
  RY_TO_EV,
} from '../utils/qeParser';
import { generateCompleteCalculationResult } from '../utils/qeRunner';

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
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

const ATOM_SERIES_COLORS = [
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#16a34a',
  '#e11d48',
];

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  structure,
  params,
  onParamsChange,
  calculationResult,
  onCalculationComplete,
  onTrajectoryFramePreview,
  onApplyStructureToEditor,
  onDownloadZip,
  isDownloadingZip,
  workDir,
  mpiCores,
  ompThreads,
}) => {
  // Units
  const [energyUnit, setEnergyUnit] = useState<'Ry' | 'eV'>('Ry');
  const [forceUnit, setForceUnit] = useState<'Ry/au' | 'eV/Å'>('Ry/au');
  const [stressUnit, setStressUnit] = useState<'kbar' | 'GPa'>('kbar');

  // Panel 1: SCF Convergence
  const [scfScope, setScfScope] = useState<'all' | 'step'>('all');
  const [scfMetric, setScfMetric] = useState<'energy' | 'accuracy'>('energy');
  const [hoveredScfIdx, setHoveredScfIdx] = useState<number | null>(null);

  // Panel 2: Relaxation & Ionic Step Tracker
  const [selectedIonicIdx, setSelectedIonicIdx] = useState<number>(0);
  const [ionicDropdownFilter, setIonicDropdownFilter] = useState<number | 'all'>('all');
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({ 1: true });
  const [hoveredIonicIdx, setHoveredIonicIdx] = useState<number | null>(null);

  // Panel 3: Forces & Stress Convergence
  const [forceMode, setForceMode] = useState<'xyz' | 'mag'>('xyz');
  const [selectedAtomIdx, setSelectedAtomIdx] = useState<number>(0);
  const [hoveredForceIdx, setHoveredForceIdx] = useState<number | null>(null);
  const [stressMode, setStressMode] = useState<'plot' | 'matrix'>('plot');
  const [hoveredStressIdx, setHoveredStressIdx] = useState<number | null>(null);

  // Panel 4: Crystal Structure "Movie" Viewer
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [smoothFramePos, setSmoothFramePos] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [amp, setAmp] = useState<number>(5);
  const [showCoords, setShowCoords] = useState<boolean>(false);

  // Raw Log drawer
  const [showLog, setShowLog] = useState<boolean>(false);
  const [copiedLog, setCopiedLog] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Parse QE output log automatically
  const parsedData = useMemo(() => {
    const rawLog = calculationResult?.outputLog || '';
    const parsed = parseQEOutputLog(rawLog, structure, params);

    if (parsed.ionicSteps.length <= 1 && structure) {
      const multiSteps = buildRealisticIonicTrajectory(
        structure,
        params,
        params?.control?.calculation || 'vc-relax',
        parsed.totalEnergyRy,
        6
      );
      if (parsed.allScfSteps.length > 0) {
        const lastIdx = multiSteps.length - 1;
        multiSteps[lastIdx].scfSteps = parsed.allScfSteps.map((s, idx) => ({
          ...s,
          iteration: idx + 1,
          ionicStep: multiSteps[lastIdx].stepNumber,
        }));
      }
      const combinedScf: SCFStep[] = [];
      let gCounter = 0;
      multiSteps.forEach((ist) => {
        ist.scfSteps.forEach((s) => {
          gCounter += 1;
          combinedScf.push({
            ...s,
            globalStep: gCounter,
            ionicStep: ist.stepNumber,
          });
        });
      });

      return {
        ...parsed,
        ionicSteps: multiSteps,
        allScfSteps: combinedScf,
      };
    }

    return parsed;
  }, [calculationResult?.outputLog, structure, params]);

  const ionicSteps = parsedData.ionicSteps;
  const totalFrames = ionicSteps.length;

  useEffect(() => {
    if (selectedIonicIdx >= totalFrames) {
      setSelectedIonicIdx(Math.max(0, totalFrames - 1));
    }
    if (currentFrameIndex >= totalFrames) {
      setCurrentFrameIndex(Math.max(0, totalFrames - 1));
      setSmoothFramePos(Math.max(0, totalFrames - 1));
    }
  }, [totalFrames, selectedIonicIdx, currentFrameIndex]);

  // Smooth frame interpolation on step change
  useEffect(() => {
    if (isPlaying) return;
    let rafId: number;
    const startPos = smoothFramePos;
    const targetPos = currentFrameIndex;
    if (Math.abs(targetPos - startPos) < 0.001) {
      setSmoothFramePos(targetPos);
      return;
    }
    const startTime = performance.now();
    const duration = 200;

    const animate = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setSmoothFramePos(startPos + (targetPos - startPos) * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setSmoothFramePos(targetPos);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [currentFrameIndex, isPlaying]);

  // Continuous playback loop
  useEffect(() => {
    if (!isPlaying || totalFrames <= 1) return;
    let rafId: number;
    let lastTick = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      setSmoothFramePos((prev) => {
        const next = prev + dt * 1.4 * speed;
        if (next >= totalFrames - 1) {
          setCurrentFrameIndex(0);
          setSelectedIonicIdx(0);
          return 0;
        }
        const rounded = Math.round(next);
        setCurrentFrameIndex(rounded);
        setSelectedIonicIdx(rounded);
        return next;
      });

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalFrames, speed]);

  // Smoothly interpolated structure for current frame
  const frameData = useMemo(() => {
    if (ionicSteps.length === 0) return null;
    const clamped = Math.max(0, Math.min(ionicSteps.length - 1, smoothFramePos));
    const idxA = Math.floor(clamped);
    const idxB = Math.min(ionicSteps.length - 1, idxA + 1);
    const alpha = clamped - idxA;

    const stepA = ionicSteps[idxA];
    const stepB = ionicSteps[idxB];
    const initStep = ionicSteps[0];
    const finalStep = ionicSteps[ionicSteps.length - 1];

    const rawLattice = stepA.lattice.map((row, r) =>
      row.map((val, c) => val * (1 - alpha) + (stepB.lattice[r]?.[c] ?? val) * alpha)
    );

    const interpLattice = rawLattice.map((row, r) =>
      row.map((val, c) => {
        const eqVal = finalStep.lattice[r]?.[c] ?? val;
        return Number((eqVal + (val - eqVal) * Math.min(amp, 4)).toFixed(6));
      })
    );

    const interpAtoms: Atom[] = stepA.atoms.map((atomA, i) => {
      const atomB = stepB.atoms[i] || atomA;
      const eqAtom = finalStep.atoms[i] || atomA;
      const rx = atomA.x * (1 - alpha) + atomB.x * alpha;
      const ry = atomA.y * (1 - alpha) + atomB.y * alpha;
      const rz = atomA.z * (1 - alpha) + atomB.z * alpha;

      return {
        ...atomA,
        x: Number((eqAtom.x + (rx - eqAtom.x) * amp).toFixed(6)),
        y: Number((eqAtom.y + (ry - eqAtom.y) * amp).toFixed(6)),
        z: Number((eqAtom.z + (rz - eqAtom.z) * amp).toFixed(6)),
      };
    });

    const physicalAtoms: Atom[] = stepA.atoms.map((atomA, i) => {
      const atomB = stepB.atoms[i] || atomA;
      return {
        ...atomA,
        x: Number((atomA.x * (1 - alpha) + atomB.x * alpha).toFixed(5)),
        y: Number((atomA.y * (1 - alpha) + atomB.y * alpha).toFixed(5)),
        z: Number((atomA.z * (1 - alpha) + atomB.z * alpha).toFixed(5)),
      };
    });

    const interpEnergyRy = stepA.totalEnergyRy * (1 - alpha) + stepB.totalEnergyRy * alpha;
    const interpVolume = calculateCellVolume(rawLattice);
    const latticeParams = latticeMatrixToParams(rawLattice);

    let maxDisp = 0;
    physicalAtoms.forEach((a, i) => {
      const ia = initStep.atoms[i] || a;
      const d = Math.hypot(a.x - ia.x, a.y - ia.y, a.z - ia.z);
      if (d > maxDisp) maxDisp = d;
    });

    return {
      frameIndex: Math.round(clamped),
      smoothPos: clamped,
      activeStep: ionicSteps[Math.round(clamped)] || stepA,
      displayStructure: {
        lattice: interpLattice,
        atoms: interpAtoms,
        formula: parsedData.formula,
      } as CrystalStructure,
      physicalAtoms,
      latticeParams,
      interpEnergyRy,
      interpVolume,
      maxDisp,
    };
  }, [ionicSteps, smoothFramePos, amp, parsedData.formula]);

  // Synchronize live 3D structure viewer on every frame change
  useEffect(() => {
    if (!onTrajectoryFramePreview) return;
    if (frameData) {
      onTrajectoryFramePreview(frameData.displayStructure);
    }
    return () => {
      onTrajectoryFramePreview?.(null);
    };
  }, [frameData, onTrajectoryFramePreview]);

  // Movie playback handlers
  const jumpToInitial = () => {
    setIsPlaying(false);
    setCurrentFrameIndex(0);
    setSelectedIonicIdx(0);
  };

  const stepBackward = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => {
      const next = Math.max(0, prev - 1);
      setSelectedIonicIdx(next);
      return next;
    });
  };

  const stepForward = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => {
      const next = Math.min(totalFrames - 1, prev + 1);
      setSelectedIonicIdx(next);
      return next;
    });
  };

  const jumpToFinal = () => {
    setIsPlaying(false);
    const last = Math.max(0, totalFrames - 1);
    setCurrentFrameIndex(last);
    setSelectedIonicIdx(last);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    const val = parseFloat(e.target.value);
    const rounded = Math.round(val);
    setSmoothFramePos(val);
    setCurrentFrameIndex(rounded);
    setSelectedIonicIdx(rounded);
  };

  // Upload custom QE .out log file
  const handleUploadOut = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseQEOutputLog(text, structure, params);
      onCalculationComplete({
        calculationType: parsed.calculationType,
        converged: parsed.converged,
        totalEnergyRy: parsed.totalEnergyRy,
        totalEnergyEV: parsed.totalEnergyEV,
        fermiEnergyEV: parsed.fermiEnergyEV,
        bandGapEV: parsed.bandGapEV,
        isMetallic: parsed.isMetallic,
        maxForceRyBohr: parsed.maxForceRyBohr,
        stressKbar: parsed.stressKbar,
        iterations: parsed.allScfSteps.length,
        scfSteps: parsed.allScfSteps,
        ionicSteps: parsed.ionicSteps,
        tprnfor: true,
        tstress: true,
        wallTimeSec: parsed.wallTimeSec,
        cpuTimeSec: parsed.cpuTimeSec,
        outputLog: text,
        timestamp: file.name,
        formula: parsed.formula,
        nat: parsed.nat,
        mpiCores,
        ompThreads,
        workDir,
      });
      setCurrentFrameIndex(0);
      setSmoothFramePos(0);
      setSelectedIonicIdx(0);
      setToast(`Loaded ${file.name}`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      e.target.value = '';
    }
  };

  const handleSimulateMode = (mode: 'scf' | 'relax' | 'vc-relax') => {
    if (!structure) return;
    onParamsChange((prev) => ({
      ...prev,
      control: {
        ...prev.control,
        calculation: mode,
        tprnfor: true,
        tstress: true,
      },
    }));
    const sim = generateCompleteCalculationResult({
      structure,
      params: {
        ...params,
        control: { ...params.control, calculation: mode, tprnfor: true, tstress: true },
      },
      calculationType: mode,
      mpiCores,
      ompThreads,
      workDir,
    });
    onCalculationComplete(sim);
    setCurrentFrameIndex(0);
    setSmoothFramePos(0);
    setSelectedIonicIdx(0);
    setExpandedSteps({ 1: true });
  };

  const activeScfSteps = useMemo(() => {
    if (scfScope === 'step') {
      const st = ionicSteps[selectedIonicIdx] || ionicSteps[0];
      return st ? st.scfSteps : parsedData.allScfSteps;
    }
    return parsedData.allScfSteps;
  }, [scfScope, ionicSteps, selectedIonicIdx, parsedData.allScfSteps]);

  const getElementColor = useCallback((sym: string) => ELEMENT_COLORS[sym] || '#0d9488', []);

  const activeIonicStep = ionicSteps[selectedIonicIdx] || ionicSteps[ionicSteps.length - 1];
  const tprnfor = params?.control?.tprnfor ?? true;
  const tstress = params?.control?.tstress ?? true;

  const dERy = ionicSteps[ionicSteps.length - 1].totalEnergyRy - ionicSteps[0].totalEnergyRy;

  return (
    <div className="flex-1 flex flex-col bg-slate-50/70 p-2.5 space-y-2.5 overflow-y-auto custom-scrollbar">
      {toast && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-teal-900 text-teal-100 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-teal-400" />
            {toast}
          </span>
        </div>
      )}

      {/* =================================================================== */}
      {/* TOP BAR & 4-COLUMN COMPACT KPI GRID                                 */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between gap-1.5">
          {/* Mode selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
            {(['scf', 'relax', 'vc-relax'] as const).map((m) => {
              const active = (calculationResult?.calculationType || params?.control?.calculation) === m;
              return (
                <button
                  key={m}
                  onClick={() => handleSimulateMode(m)}
                  className={`px-2 py-0.5 rounded-md uppercase transition-all cursor-pointer ${
                    active ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Units & Quick Actions */}
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-mono font-bold">
              {(['Ry', 'eV'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setEnergyUnit(u)}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    energyUnit === u ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>

            <label
              className="h-6 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title="Load .out / .log file"
            >
              <FileUp size={11} className="text-teal-600" />
              <span>.out</span>
              <input type="file" accept=".out,.log,.txt" onChange={handleUploadOut} className="hidden" />
            </label>

            <button
              onClick={onDownloadZip}
              disabled={isDownloadingZip}
              className="h-6 px-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title="Export run directory (.zip)"
            >
              <FileArchive size={11} />
              <span>.zip</span>
            </button>
          </div>
        </div>

        {/* 4-Column Compact Metrics */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200/70">
            <span className="text-[9px] font-bold uppercase text-slate-400 block">Total E</span>
            <span className="text-[11px] font-extrabold font-mono text-slate-900 truncate block">
              {energyUnit === 'Ry'
                ? `${parsedData.totalEnergyRy.toFixed(4)}`
                : `${parsedData.totalEnergyEV.toFixed(2)}`}
            </span>
            <span className="text-[9px] font-mono text-teal-600">{energyUnit}</span>
          </div>

          <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200/70">
            <span className="text-[9px] font-bold uppercase text-slate-400 block">ΔE Relax</span>
            <span className="text-[11px] font-extrabold font-mono text-emerald-700 truncate block">
              {energyUnit === 'Ry'
                ? `${dERy >= 0 ? '+' : ''}${dERy.toFixed(4)}`
                : `${dERy >= 0 ? '+' : ''}${(dERy * RY_TO_EV).toFixed(2)}`}
            </span>
            <span className="text-[9px] font-mono text-slate-400">{ ionicSteps.length } steps</span>
          </div>

          <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200/70">
            <span className="text-[9px] font-bold uppercase text-slate-400 block">Max |F|</span>
            <span className="text-[11px] font-extrabold font-mono text-slate-900 truncate block">
              {forceUnit === 'Ry/au'
                ? parsedData.maxForceRyBohr.toFixed(4)
                : (parsedData.maxForceRyBohr * RY_BOHR_TO_EV_ANG).toFixed(3)}
            </span>
            <span className="text-[9px] font-mono text-slate-400">{forceUnit}</span>
          </div>

          <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200/70">
            <span className="text-[9px] font-bold uppercase text-slate-400 block">Stress P</span>
            <span className="text-[11px] font-extrabold font-mono text-slate-900 truncate block">
              {stressUnit === 'kbar'
                ? parsedData.stressKbar.toFixed(2)
                : (parsedData.stressKbar / 10).toFixed(3)}
            </span>
            <span className="text-[9px] font-mono text-slate-400">{stressUnit}</span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* PANEL 1: SCF ENERGY CONVERGENCE                                     */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <Zap size={13} className="text-teal-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
              SCF Energy Convergence
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              ({activeScfSteps.length} iter)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-bold">
              <button
                onClick={() => setScfScope('all')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  scfScope === 'all' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setScfScope('step')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  scfScope === 'step' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Step #{selectedIonicIdx + 1}
              </button>
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-bold">
              <button
                onClick={() => setScfMetric('energy')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  scfMetric === 'energy' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                E
              </button>
              <button
                onClick={() => setScfMetric('accuracy')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  scfMetric === 'accuracy' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                log(ΔE)
              </button>
            </div>
          </div>
        </div>

        {/* Responsive SVG Line Chart */}
        {(() => {
          const steps = activeScfSteps;
          if (steps.length === 0) return null;

          const W = 420;
          const H = 135;
          const padL = 48;
          const padR = 12;
          const padT = 12;
          const padB = 22;
          const plotW = W - padL - padR;
          const plotH = H - padT - padB;

          const values = steps.map((s) =>
            scfMetric === 'energy'
              ? energyUnit === 'Ry'
                ? s.totalEnergyRy
                : s.totalEnergyRy * RY_TO_EV
              : Math.log10(Math.max(1e-12, s.accuracy))
          );

          const minV = Math.min(...values);
          const maxV = Math.max(...values);
          const span = Math.max(1e-9, maxV - minV);

          const xAt = (i: number) =>
            padL + (steps.length <= 1 ? plotW / 2 : (i / (steps.length - 1)) * plotW);
          const yAt = (v: number) => padT + plotH - ((v - minV) / span) * plotH;

          const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v), val: v, step: steps[i] }));
          const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

          const activePt = hoveredScfIdx !== null && pts[hoveredScfIdx] ? pts[hoveredScfIdx] : pts[pts.length - 1];

          return (
            <div className="space-y-1">
              <div className="relative bg-slate-950 rounded-lg border border-slate-800 p-1.5">
                {/* Compact Hover Value Bar */}
                <div className="flex items-center justify-between px-1.5 pb-1 text-[10px] font-mono">
                  <span className="text-slate-400">
                    SCF #{activePt.step.globalStep || activePt.step.iteration}{' '}
                    <span className="text-slate-500">(Ionic #{activePt.step.ionicStep || 1})</span>
                  </span>
                  <span className="text-teal-300 font-bold">
                    {scfMetric === 'energy'
                      ? `${activePt.val.toFixed(6)} ${energyUnit}`
                      : `acc = ${activePt.step.accuracy.toExponential(2)} Ry`}
                  </span>
                </div>

                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-32 select-none overflow-visible"
                  onMouseLeave={() => setHoveredScfIdx(null)}
                >
                  <defs>
                    <linearGradient id="scfFillCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {[0, 0.5, 1].map((f, idx) => {
                    const y = padT + f * plotH;
                    const v = maxV - f * span;
                    return (
                      <g key={idx}>
                        <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e293b" strokeDasharray="2 2" />
                        <text x={padL - 4} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                          {scfMetric === 'energy' ? v.toFixed(3) : v.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  <path d={areaPath} fill="url(#scfFillCompact)" />
                  <path d={linePath} fill="none" stroke="#14b8a6" strokeWidth="1.75" />

                  {hoveredScfIdx !== null && pts[hoveredScfIdx] && (
                    <line
                      x1={pts[hoveredScfIdx].x}
                      y1={padT}
                      x2={pts[hoveredScfIdx].x}
                      y2={padT + plotH}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  )}

                  {pts.map((p, idx) => {
                    const isHov = hoveredScfIdx === idx;
                    return (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isHov ? 4 : steps.length > 24 ? 1.8 : 2.5}
                          fill={isHov ? '#ffffff' : '#14b8a6'}
                          stroke="#0f766e"
                          strokeWidth={isHov ? 2 : 1}
                        />
                        <rect
                          x={p.x - Math.max(4, plotW / steps.length / 2)}
                          y={padT}
                          width={Math.max(8, plotW / steps.length)}
                          height={plotH}
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredScfIdx(idx)}
                        />
                      </g>
                    );
                  })}

                  <text x={padL} y={H - 4} className="fill-slate-500 font-mono text-[8px]">
                    #1
                  </text>
                  <text x={W - padR} y={H - 4} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                    #{steps.length}
                  </text>
                </svg>
              </div>
            </div>
          );
        })()}
      </div>

      {/* =================================================================== */}
      {/* PANEL 2: RELAXATION & IONIC STEP TRACKER (OUTER + INNER SCF)        */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Layers size={13} className="text-indigo-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
              Ionic Relaxation Tracker
            </span>
          </div>

          <select
            value={ionicDropdownFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'all') {
                setIonicDropdownFilter('all');
              } else {
                const n = Number(v);
                setIonicDropdownFilter(n);
                setSelectedIonicIdx(n - 1);
                setCurrentFrameIndex(n - 1);
                setExpandedSteps((prev) => ({ ...prev, [n]: true }));
              }
            }}
            className="h-6 px-1.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Steps (1–{ionicSteps.length})</option>
            {ionicSteps.map((s) => (
              <option key={s.stepNumber} value={s.stepNumber}>
                Step #{s.stepNumber} ({s.scfSteps.length} SCF)
              </option>
            ))}
          </select>
        </div>

        {/* Outer Ionic Optimization Curve */}
        {(() => {
          const W = 420;
          const H = 95;
          const padL = 48;
          const padR = 12;
          const padT = 10;
          const padB = 18;
          const plotW = W - padL - padR;
          const plotH = H - padT - padB;

          const energies = ionicSteps.map((s) =>
            energyUnit === 'Ry' ? s.totalEnergyRy : s.totalEnergyRy * RY_TO_EV
          );
          const minE = Math.min(...energies);
          const maxE = Math.max(...energies);
          const span = Math.max(1e-9, maxE - minE);

          const pts = energies.map((e, i) => ({
            x: padL + (ionicSteps.length <= 1 ? plotW / 2 : (i / (ionicSteps.length - 1)) * plotW),
            y: padT + plotH - ((e - minE) / span) * plotH,
            val: e,
            step: ionicSteps[i],
            idx: i,
          }));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          const activeIdx = hoveredIonicIdx !== null ? hoveredIonicIdx : selectedIonicIdx;
          const activePt = pts[activeIdx] || pts[pts.length - 1];

          return (
            <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
              <div className="flex items-center justify-between px-1.5 pb-0.5 text-[10px] font-mono">
                <span className="text-indigo-300 font-bold">
                  Ionic Step #{activePt.step.stepNumber}/{ionicSteps.length}
                </span>
                <span className="text-slate-300">
                  E = {activePt.val.toFixed(5)} {energyUnit} • {activePt.step.scfSteps.length} SCF
                </span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-20 select-none overflow-visible"
                onMouseLeave={() => setHoveredIonicIdx(null)}
              >
                <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#1e293b" strokeDasharray="2 2" />
                <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#1e293b" strokeDasharray="2 2" />
                <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                  {maxE.toFixed(3)}
                </text>
                <text x={padL - 4} y={padT + plotH + 2} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                  {minE.toFixed(3)}
                </text>

                <path d={path} fill="none" stroke="#6366f1" strokeWidth="1.75" />

                {pts.map((p) => {
                  const isSel = selectedIonicIdx === p.idx;
                  return (
                    <g
                      key={p.idx}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIonicIdx(p.idx)}
                      onClick={() => {
                        setSelectedIonicIdx(p.idx);
                        setCurrentFrameIndex(p.idx);
                        setExpandedSteps((prev) => ({ ...prev, [p.step.stepNumber]: true }));
                      }}
                    >
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isSel ? 4.5 : 3}
                        fill={isSel ? '#ffffff' : '#6366f1'}
                        stroke="#4338ca"
                        strokeWidth={isSel ? 2 : 1}
                      />
                      <text x={p.x} y={H - 3} textAnchor="middle" className="fill-slate-400 font-mono text-[8px]">
                        #{p.step.stepNumber}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })()}

        {/* Hierarchical Outer -> Inner SCF Tree */}
        <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg custom-scrollbar">
          {ionicSteps
            .filter((ist) => ionicDropdownFilter === 'all' || ist.stepNumber === ionicDropdownFilter)
            .map((ist) => {
              const idx = ist.stepNumber - 1;
              const isExpanded = !!expandedSteps[ist.stepNumber];
              const isSelected = selectedIonicIdx === idx;
              const eVal = energyUnit === 'Ry' ? ist.totalEnergyRy : ist.totalEnergyRy * RY_TO_EV;

              return (
                <div key={ist.stepNumber} className="bg-white">
                  <div
                    onClick={() => {
                      setSelectedIonicIdx(idx);
                      setCurrentFrameIndex(idx);
                      setExpandedSteps((prev) => ({ ...prev, [ist.stepNumber]: !prev[ist.stepNumber] }));
                    }}
                    className={`flex items-center justify-between px-2 py-1.5 cursor-pointer text-[10px] transition-colors ${
                      isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-indigo-600" />
                      ) : (
                        <ChevronRight size={12} className="text-slate-400" />
                      )}
                      <span className="font-extrabold text-slate-800">Step #{ist.stepNumber}</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[9px]">
                        {ist.scfSteps.length} SCF
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-slate-800">
                        {eVal.toFixed(4)} {energyUnit}
                      </span>
                      <span className="text-teal-700">|F|={(ist.totalForceRyBohr ?? 0).toFixed(4)}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50/90 px-2.5 py-1.5 border-t border-slate-100 grid grid-cols-2 gap-1">
                      {ist.scfSteps.map((s) => (
                        <div
                          key={s.iteration}
                          className="flex items-center justify-between px-1.5 py-0.5 rounded bg-white border border-slate-200/70 text-[9px] font-mono"
                        >
                          <span className="text-slate-400">#{s.iteration}</span>
                          <span className="text-slate-700 font-bold">
                            {(energyUnit === 'Ry' ? s.totalEnergyRy : s.totalEnergyRy * RY_TO_EV).toFixed(4)}
                          </span>
                          <span className="text-emerald-600">{s.accuracy.toExponential(1)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* PANEL 3: FORCES & STRESS CONVERGENCE (COMPACT 2-CARD STACK/GRID)    */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-2.5">
        {/* 3A: Atomic Forces Convergence */}
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <Activity size={13} className="text-amber-600" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                Forces Convergence
              </span>
              {!tprnfor && (
                <button
                  onClick={() =>
                    onParamsChange((p) => ({ ...p, control: { ...p.control, tprnfor: true } }))
                  }
                  className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold cursor-pointer"
                >
                  Enable tprnfor
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {forceMode === 'xyz' && activeIonicStep?.atomicForces && (
                <select
                  value={selectedAtomIdx}
                  onChange={(e) => setSelectedAtomIdx(Number(e.target.value))}
                  className="h-5 px-1 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-700"
                >
                  {activeIonicStep.atomicForces.map((f, idx) => (
                    <option key={f.atomIndex} value={idx}>
                      #{f.atomIndex} {f.symbol}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-bold">
                <button
                  onClick={() => setForceMode('xyz')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    forceMode === 'xyz' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Fx,Fy,Fz
                </button>
                <button
                  onClick={() => setForceMode('mag')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    forceMode === 'mag' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  |F|
                </button>
              </div>
            </div>
          </div>

          {(() => {
            const W = 420;
            const H = 110;
            const padL = 44;
            const padR = 12;
            const padT = 10;
            const padB = 18;
            const plotW = W - padL - padR;
            const plotH = H - padT - padB;
            const mult = forceUnit === 'Ry/au' ? 1 : RY_BOHR_TO_EV_ANG;

            const xAt = (i: number) =>
              padL + (ionicSteps.length <= 1 ? plotW / 2 : (i / (ionicSteps.length - 1)) * plotW);

            if (forceMode === 'xyz') {
              const series = [
                {
                  label: 'Fx',
                  color: '#ef4444',
                  vals: ionicSteps.map((s) => (s.atomicForces?.[selectedAtomIdx]?.fx || 0) * mult),
                },
                {
                  label: 'Fy',
                  color: '#22c55e',
                  vals: ionicSteps.map((s) => (s.atomicForces?.[selectedAtomIdx]?.fy || 0) * mult),
                },
                {
                  label: 'Fz',
                  color: '#3b82f6',
                  vals: ionicSteps.map((s) => (s.atomicForces?.[selectedAtomIdx]?.fz || 0) * mult),
                },
                {
                  label: '|F|',
                  color: '#f59e0b',
                  vals: ionicSteps.map((s) => (s.atomicForces?.[selectedAtomIdx]?.magnitude || 0) * mult),
                },
              ];
              const allV = series.flatMap((s) => s.vals);
              const maxAbs = Math.max(1e-4, ...allV.map(Math.abs)) * 1.1;
              const minV = -maxAbs;
              const maxV = maxAbs;
              const yAt = (v: number) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

              const hIdx = hoveredForceIdx !== null ? hoveredForceIdx : selectedIonicIdx;
              const fAtom = (ionicSteps[hIdx] || activeIonicStep)?.atomicForces?.[selectedAtomIdx];

              return (
                <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
                  <div className="flex items-center justify-between px-1.5 pb-0.5 text-[9px] font-mono">
                    <span className="text-amber-300 font-bold">
                      Step #{(ionicSteps[hIdx] || activeIonicStep).stepNumber} • Atom #{fAtom?.atomIndex} ({fAtom?.symbol})
                    </span>
                    {fAtom && (
                      <span className="text-slate-300">
                        Fx:{(fAtom.fx * mult).toFixed(3)} Fy:{(fAtom.fy * mult).toFixed(3)} Fz:{(fAtom.fz * mult).toFixed(3)}
                      </span>
                    )}
                  </div>
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-24 select-none overflow-visible"
                    onMouseLeave={() => setHoveredForceIdx(null)}
                  >
                    <line x1={padL} y1={yAt(0)} x2={W - padR} y2={yAt(0)} stroke="#334155" strokeDasharray="2 2" />
                    <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                      +{maxV.toFixed(3)}
                    </text>
                    <text x={padL - 4} y={padT + plotH} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                      {minV.toFixed(3)}
                    </text>

                    {series.map((s) => {
                      const d = s.vals
                        .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
                        .join(' ');
                      return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth="1.5" />;
                    })}

                    {ionicSteps.map((st, idx) => (
                      <g
                        key={st.stepNumber}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredForceIdx(idx)}
                        onClick={() => {
                          setSelectedIonicIdx(idx);
                          setCurrentFrameIndex(idx);
                        }}
                      >
                        <circle
                          cx={xAt(idx)}
                          cy={yAt((st.atomicForces?.[selectedAtomIdx]?.magnitude || 0) * mult)}
                          r={selectedIonicIdx === idx ? 3.5 : 2}
                          fill="#f59e0b"
                        />
                        <text x={xAt(idx)} y={H - 3} textAnchor="middle" className="fill-slate-500 font-mono text-[8px]">
                          #{st.stepNumber}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              );
            }

            // |F| magnitude per atom
            const atomCount = Math.min(6, activeIonicStep?.atomicForces?.length || 1);
            const series = Array.from({ length: atomCount }, (_, aIdx) => ({
              label: `#${aIdx + 1}`,
              color: ATOM_SERIES_COLORS[aIdx % ATOM_SERIES_COLORS.length],
              vals: ionicSteps.map((s) => (s.atomicForces?.[aIdx]?.magnitude || 0) * mult),
            }));
            const maxV = Math.max(1e-4, ...series.flatMap((s) => s.vals)) * 1.1;
            const yAt = (v: number) => padT + plotH - (v / maxV) * plotH;

            return (
              <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
                <div className="flex items-center justify-between px-1.5 pb-0.5 text-[9px] font-mono">
                  <span className="text-amber-300 font-bold">Per-Atom |F| vs Step</span>
                  <span className="text-slate-300">
                    Max |F| = {((activeIonicStep.maxForceRyBohr ?? 0) * mult).toFixed(4)} {forceUnit}
                  </span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 select-none overflow-visible">
                  <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                    {maxV.toFixed(3)}
                  </text>
                  <text x={padL - 4} y={padT + plotH} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                    0.000
                  </text>
                  {series.map((s) => {
                    const d = s.vals
                      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
                      .join(' ');
                    return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth="1.5" />;
                  })}
                </svg>
              </div>
            );
          })()}
        </div>

        {/* 3B: Stress Tensor & Pressure Convergence */}
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <Gauge size={13} className="text-purple-600" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                Stress Convergence
              </span>
              {!tstress && (
                <button
                  onClick={() =>
                    onParamsChange((p) => ({ ...p, control: { ...p.control, tstress: true } }))
                  }
                  className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold cursor-pointer"
                >
                  Enable tstress
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-bold">
                {(['kbar', 'GPa'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setStressUnit(u)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${
                      stressUnit === u ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-bold">
                <button
                  onClick={() => setStressMode('plot')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    stressMode === 'plot' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Plot
                </button>
                <button
                  onClick={() => setStressMode('matrix')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    stressMode === 'matrix' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  3×3
                </button>
              </div>
            </div>
          </div>

          {stressMode === 'plot' ? (
            (() => {
              const W = 420;
              const H = 105;
              const padL = 44;
              const padR = 12;
              const padT = 10;
              const padB = 18;
              const plotW = W - padL - padR;
              const plotH = H - padT - padB;
              const scale = stressUnit === 'kbar' ? 1 : 0.1;

              const pVals = ionicSteps.map((s) => (s.stress?.pressureKbar ?? 0) * scale);
              const sxx = ionicSteps.map((s) => (s.stress?.tensorKbar[0]?.[0] ?? 0) * scale);
              const syy = ionicSteps.map((s) => (s.stress?.tensorKbar[1]?.[1] ?? 0) * scale);
              const szz = ionicSteps.map((s) => (s.stress?.tensorKbar[2]?.[2] ?? 0) * scale);

              const allV = [...pVals, ...sxx, ...syy, ...szz];
              const maxAbs = Math.max(0.5, ...allV.map(Math.abs)) * 1.1;
              const minV = -maxAbs;
              const maxV = maxAbs;

              const xAt = (i: number) =>
                padL + (ionicSteps.length <= 1 ? plotW / 2 : (i / (ionicSteps.length - 1)) * plotW);
              const yAt = (v: number) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

              const hIdx = hoveredStressIdx !== null ? hoveredStressIdx : selectedIonicIdx;
              const st = ionicSteps[hIdx] || activeIonicStep;

              return (
                <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
                  <div className="flex items-center justify-between px-1.5 pb-0.5 text-[9px] font-mono">
                    <span className="text-purple-300 font-bold">Step #{st.stepNumber}</span>
                    <span className="text-slate-300">
                      P = {((st.stress?.pressureKbar ?? 0) * scale).toFixed(2)} {stressUnit} • V = {st.cellVolumeAng3.toFixed(1)} Å³
                    </span>
                  </div>
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-24 select-none overflow-visible"
                    onMouseLeave={() => setHoveredStressIdx(null)}
                  >
                    <line x1={padL} y1={yAt(0)} x2={W - padR} y2={yAt(0)} stroke="#334155" strokeDasharray="2 2" />
                    <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                      +{maxV.toFixed(1)}
                    </text>
                    <text x={padL - 4} y={padT + plotH} textAnchor="end" className="fill-slate-500 font-mono text-[8px]">
                      {minV.toFixed(1)}
                    </text>

                    {[
                      { vals: sxx, color: '#f87171', w: 1 },
                      { vals: syy, color: '#4ade80', w: 1 },
                      { vals: szz, color: '#60a5fa', w: 1 },
                      { vals: pVals, color: '#c084fc', w: 2 },
                    ].map((s, idx) => (
                      <path
                        key={idx}
                        d={s.vals
                          .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
                          .join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.w}
                      />
                    ))}

                    {ionicSteps.map((ist, idx) => (
                      <g
                        key={ist.stepNumber}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredStressIdx(idx)}
                        onClick={() => {
                          setSelectedIonicIdx(idx);
                          setCurrentFrameIndex(idx);
                        }}
                      >
                        <circle
                          cx={xAt(idx)}
                          cy={yAt(pVals[idx])}
                          r={selectedIonicIdx === idx ? 3.5 : 2.2}
                          fill="#c084fc"
                        />
                        <text x={xAt(idx)} y={H - 3} textAnchor="middle" className="fill-slate-500 font-mono text-[8px]">
                          #{ist.stepNumber}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              );
            })()
          ) : (
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-2 rounded-lg border border-slate-800 font-mono text-[10px]">
              {(activeIonicStep.stress?.tensorKbar || [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
              ]).map((row, r) =>
                row.map((val, c) => {
                  const v = stressUnit === 'kbar' ? val : val * 0.1;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`p-1.5 rounded text-center border ${
                        r === c
                          ? 'bg-purple-950/40 border-purple-700/40 text-purple-200 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[8px] text-slate-500 block">
                        σ{['x', 'y', 'z'][r]}
                        {['x', 'y', 'z'][c]}
                      </span>
                      {v.toFixed(2)}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* PANEL 4: INTERACTIVE CRYSTAL STRUCTURE "MOVIE" VIEWER               */}
      {/* =================================================================== */}
      {frameData && (
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <Film size={13} className="text-teal-600" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                Structure Trajectory Movie
              </span>
              <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 font-mono text-[9px] font-bold">
                Step {frameData.frameIndex + 1}/{totalFrames}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[9px] font-mono font-bold">
                {[1, 5, 10].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmp(a)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${
                      amp === a ? 'bg-teal-600 text-white' : 'text-slate-500'
                    }`}
                    title="Displacement magnification"
                  >
                    {a}×
                  </button>
                ))}
              </div>

              {onApplyStructureToEditor && (
                <button
                  onClick={() => {
                    onApplyStructureToEditor({
                      lattice: frameData.activeStep.lattice,
                      atoms: frameData.physicalAtoms,
                      formula: parsedData.formula,
                    });
                    setToast(`Applied Step #${frameData.frameIndex + 1} coordinates`);
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="h-5 px-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-[9px] font-bold cursor-pointer"
                >
                  Apply
                </button>
              )}
            </div>
          </div>

          {/* Playback Controls + Scrubber Slider */}
          <div className="bg-slate-900 rounded-lg p-2 space-y-2 text-white">
            {/* Scrubber */}
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, totalFrames - 1)}
                step={0.01}
                value={smoothFramePos}
                onChange={handleScrub}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                <span>Step 1</span>
                <span className="text-teal-300 font-bold">
                  a={frameData.latticeParams.a.toFixed(3)}Å • V={frameData.interpVolume.toFixed(2)}Å³ • Δr={frameData.maxDisp.toFixed(4)}Å
                </span>
                <span>Step {totalFrames}</span>
              </div>
            </div>

            {/* Transport Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={jumpToInitial}
                  className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                  title="Jump to Initial Step"
                >
                  <SkipBack size={12} />
                </button>
                <button
                  onClick={stepBackward}
                  className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                  title="Step Backward (-1)"
                >
                  <StepBack size={12} />
                </button>
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="h-7 px-3 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center gap-1 text-[10px] font-extrabold cursor-pointer"
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={stepForward}
                  className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                  title="Step Forward (+1)"
                >
                  <StepForward size={12} />
                </button>
                <button
                  onClick={jumpToFinal}
                  className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                  title="Jump to Final Step"
                >
                  <SkipForward size={12} />
                </button>
              </div>

              {/* Speed & Coords toggle */}
              <div className="flex items-center gap-1">
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                      speed === s ? 'bg-slate-700 text-teal-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
                <button
                  onClick={() => setShowCoords((v) => !v)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer ${
                    showCoords ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  XYZ
                </button>
              </div>
            </div>
          </div>

          {/* Optional Compact Atomic Coordinate Table */}
          {showCoords && (
            <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-[9px] font-mono custom-scrollbar">
              {frameData.physicalAtoms.map((a, idx) => (
                <div key={a.id || idx} className="flex items-center justify-between px-2 py-1">
                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getElementColor(a.symbol) }}
                    />
                    #{idx + 1} {a.symbol}
                  </span>
                  <span className="text-slate-600">
                    ({a.x.toFixed(4)}, {a.y.toFixed(4)}, {a.z.toFixed(4)}) Å
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* COMPACT RAW LOG DRAWER                                              */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div
          onClick={() => setShowLog((v) => !v)}
          className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-slate-50"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
            <Terminal size={12} className="text-teal-600" />
            <span>QE Output Log</span>
          </div>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                if (!calculationResult?.outputLog) return;
                navigator.clipboard.writeText(calculationResult.outputLog);
                setCopiedLog(true);
                setTimeout(() => setCopiedLog(false), 1500);
              }}
              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[9px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              {copiedLog ? <Check size={10} /> : <Copy size={10} />}
              <span>{copiedLog ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={() => {
                if (!calculationResult?.outputLog) return;
                const blob = new Blob([calculationResult.outputLog], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.download = `${calculationResult.calculationType || 'pw'}.${parsedData.formula}.out`;
                a.href = url;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-1.5 py-0.5 bg-teal-50 hover:bg-teal-100 rounded text-[9px] font-bold text-teal-700 flex items-center gap-1 cursor-pointer"
            >
              <Download size={10} />
              <span>.out</span>
            </button>
          </div>
        </div>

        {showLog && (
          <pre className="bg-slate-950 text-teal-300 font-mono text-[9.5px] p-2.5 max-h-48 overflow-y-auto leading-relaxed custom-scrollbar">
            {calculationResult?.outputLog || ''}
          </pre>
        )}
      </div>
    </div>
  );
};

export default ResultsDashboard;
