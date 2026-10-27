import React, { useState, useMemo } from 'react';
import { QEParams, CrystalStructure, QESpecies } from '../types';
import { IBRAV_OPTIONS, PLOT_NUM_OPTIONS, ELEMENT_MASSES, ELEMENT_COLORS } from '../constants';
import {
  Settings,
  Cpu,
  Layers,
  Activity,
  Box,
  ChevronDown,
  ChevronRight,
  Atom,
  Zap,
  Move,
  Plus,
  Trash2,
  Route,
  FileSearch,
  Waves,
  RefreshCw,
  Sparkles,
  Lock,
  Unlock,
  Download,
} from 'lucide-react';
import { HIGH_SYMMETRY_POINTS, SUGGESTED_PATHS, getPointsForPath } from '../utils/symmetryUtils';
import {
  latticeMatrixToParams,
  paramsToLatticeMatrix,
  detectBravaisLattice,
  computeCelldmFromParams,
} from '../utils/latticeUtils';
import { cartToFrac, fracToCart } from '../utils/modellingUtils';
import {
  getPseudopotentialsForElement,
  getDefaultPseudopotential,
  describePseudopotential,
} from '../utils/pseudopotentials';
import PeriodicTableModal from './PeriodicTableModal';

interface SettingsPanelProps {
  params: QEParams;
  onChange: (newParams: QEParams) => void;
  structure: CrystalStructure | null;
  onStructureChange: (newStructure: CrystalStructure) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  params,
  onChange,
  structure,
  onStructureChange,
}) => {
  const [activeTab, setActiveTab] = useState<
    'structure' | 'control' | 'system' | 'electrons' | 'physics' | 'pp' | 'ph'
  >('structure');
  const [latticeExpanded, setLatticeExpanded] = useState(true);
  const [speciesExpanded, setSpeciesExpanded] = useState(true);
  const [atomsExpanded, setAtomsExpanded] = useState(true);
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{
    type: 'atom' | 'species' | 'add-atom';
    index?: number;
    symbol?: string;
  } | null>(null);

  const latticeParams = useMemo(() => {
    return latticeMatrixToParams(structure?.lattice);
  }, [structure?.lattice]);

  // Calculate unit cell volume in Å^3
  const cellVolumeAng3 = useMemo(() => {
    const m = structure?.lattice;
    if (!m || m.length < 3) return 0;
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    return Math.abs(det);
  }, [structure?.lattice]);

  const handleLatticeParamsChange = (
    newA: number,
    newB: number,
    newC: number,
    newAlpha: number = 90,
    newBeta: number = 90,
    newGamma: number = 90
  ) => {
    if (!structure) return;
    const newLattice = paramsToLatticeMatrix(newA, newB, newC, newAlpha, newBeta, newGamma);
    onStructureChange({
      ...structure,
      lattice: newLattice,
    });

    if (params?.system) {
      const ibrav = params.system.ibrav || 0;
      const newCelldm = computeCelldmFromParams(ibrav, newA, newB, newC, newAlpha, newBeta, newGamma);
      onChange({
        ...params,
        system: {
          ...params.system,
          a: newA,
          b: newB,
          c: newC,
          celldm: newCelldm,
        },
      });
    }
  };

  const handleLatticeVectorChange = (rowIdx: number, colIdx: number, value: number) => {
    if (!structure?.lattice) return;
    const newLattice = structure.lattice.map((row, r) =>
      row.map((val, c) => (r === rowIdx && c === colIdx ? value : val))
    );
    onStructureChange({
      ...structure,
      lattice: newLattice,
    });

    const newParams = latticeMatrixToParams(newLattice);
    if (params?.system) {
      const ibrav = params.system.ibrav || 0;
      const newCelldm = computeCelldmFromParams(
        ibrav,
        newParams.a,
        newParams.b,
        newParams.c,
        newParams.alpha,
        newParams.beta,
        newParams.gamma
      );
      onChange({
        ...params,
        system: {
          ...params.system,
          a: newParams.a,
          b: newParams.b,
          c: newParams.c,
          celldm: newCelldm,
        },
      });
    }
  };

  const handleElementSelect = (newSymbol: string) => {
    if (!replaceTarget || !structure?.atoms) return;

    if (replaceTarget.type === 'atom' && replaceTarget.index !== undefined) {
      const idx = replaceTarget.index;
      const currentAtom = structure.atoms[idx];
      if (currentAtom && newSymbol !== currentAtom.symbol) {
        const newAtoms = [...structure.atoms];
        newAtoms[idx] = { ...currentAtom, symbol: newSymbol };
        onStructureChange({ ...structure, atoms: newAtoms });
      }
    } else if (replaceTarget.type === 'species' && replaceTarget.symbol) {
      const oldSymbol = replaceTarget.symbol;
      if (newSymbol !== oldSymbol) {
        const newAtoms = structure.atoms.map((a) =>
          a.symbol === oldSymbol ? { ...a, symbol: newSymbol } : a
        );
        onStructureChange({ ...structure, atoms: newAtoms });
      }
    } else if (replaceTarget.type === 'add-atom') {
      const newAtoms = [
        ...structure.atoms,
        { symbol: newSymbol, x: 0, y: 0, z: 0, if_pos: [1, 1, 1] as [number, number, number] },
      ];
      onStructureChange({ ...structure, atoms: newAtoms });
    }
    setShowPeriodicTable(false);
    setReplaceTarget(null);
  };

  const updateNested = (section: keyof QEParams, key: string, value: any) => {
    onChange({
      ...params,
      [section]: {
        ...((params[section] as any) || {}),
        [key]: value,
      },
    });
  };

  const updateSpecies = (symbol: string, field: keyof QESpecies, value: any) => {
    const newSpecies = { ...(params?.atomic_species || {}) };
    if (!newSpecies[symbol]) {
      newSpecies[symbol] = {
        symbol,
        mass: ELEMENT_MASSES[symbol] || 1.0,
        pseudo: getDefaultPseudopotential(symbol),
      };
    }
    newSpecies[symbol] = { ...newSpecies[symbol], [field]: value };
    onChange({ ...params, atomic_species: newSpecies });
  };

  const applyBulkPseudoFamily = (family: 'paw' | 'uspp') => {
    const newSpecies = { ...(params?.atomic_species || {}) };
    Object.keys(newSpecies).forEach((sym) => {
      const list = getPseudopotentialsForElement(sym);
      if (list.length === 0) return;
      const match =
        family === 'paw'
          ? list.find((f) => f.toLowerCase().includes('kjpaw')) || list[0]
          : list.find((f) => f.toLowerCase().includes('rrkjus') || f.toLowerCase().includes('van')) ||
            list[0];
      newSpecies[sym] = { ...newSpecies[sym], pseudo: match };
    });
    onChange({ ...params, atomic_species: newSpecies });
  };

  const toggleAtomFix = (index: number) => {
    if (!structure?.atoms) return;
    const newAtoms = [...structure.atoms];
    const atom = newAtoms[index];
    if (!atom) return;

    const isFixed =
      atom.if_pos && atom.if_pos[0] === 0 && atom.if_pos[1] === 0 && atom.if_pos[2] === 0;

    if (isFixed) {
      newAtoms[index] = { ...atom, if_pos: undefined };
    } else {
      newAtoms[index] = { ...atom, if_pos: [0, 0, 0] };
    }

    onStructureChange({ ...structure, atoms: newAtoms });
  };

  const handleToggleAllAtomsFix = (fixAll: boolean) => {
    if (!structure?.atoms) return;
    const newAtoms = structure.atoms.map((a) => ({
      ...a,
      if_pos: fixAll ? ([0, 0, 0] as [number, number, number]) : undefined,
    }));
    onStructureChange({ ...structure, atoms: newAtoms });
  };

  const handleAtomCoordEdit = (
    index: number,
    axis: 'x' | 'y' | 'z',
    rawVal: string,
    isCrystal: boolean
  ) => {
    if (!structure?.atoms) return;
    const val = parseFloat(rawVal);
    if (isNaN(val)) return;

    const newAtoms = [...structure.atoms];
    const atom = newAtoms[index];
    if (!atom) return;

    if (isCrystal && structure.lattice && structure.lattice.length === 3) {
      const [u, v, w] = cartToFrac([atom.x, atom.y, atom.z], structure.lattice);
      const nextFrac: [number, number, number] = [
        axis === 'x' ? val : u,
        axis === 'y' ? val : v,
        axis === 'z' ? val : w,
      ];
      const [cx, cy, cz] = fracToCart(nextFrac, structure.lattice);
      newAtoms[index] = { ...atom, x: cx, y: cy, z: cz };
    } else {
      newAtoms[index] = { ...atom, [axis]: val };
    }
    onStructureChange({ ...structure, atoms: newAtoms });
  };

  const handleDeleteAtom = (index: number) => {
    if (!structure?.atoms) return;
    const newAtoms = structure.atoms.filter((_, idx) => idx !== index);
    onStructureChange({ ...structure, atoms: newAtoms });
  };

  const handleAutoSuggestKMesh = () => {
    const a = latticeParams.a || 10;
    const b = latticeParams.b || 10;
    const c = latticeParams.c || 10;
    const nkx = Math.max(1, Math.round(32 / a));
    const nky = Math.max(1, Math.round(32 / b));
    const nkz = Math.max(1, Math.round(32 / c));
    const currentShifts = params?.k_points?.values?.slice(3, 6) || [1, 1, 1];
    onChange({
      ...params,
      k_points: {
        ...params.k_points,
        type: 'automatic',
        values: [nkx, nky, nkz, ...currentShifts],
      },
    });
  };

  const speciesList = Object.values(params?.atomic_species || {});
  const calculation = params?.control?.calculation || 'scf';
  const isRelax = calculation === 'relax' || calculation === 'vc-relax' || calculation === 'md';
  const isVCRelax = calculation === 'vc-relax';
  const posUnit = params?.atomic_positions_unit || 'angstrom';

  const inputClass =
    'block w-full rounded-lg bg-slate-50 border border-slate-200 text-xs p-2 text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors';
  const monoInputClass =
    'block w-full rounded-lg bg-slate-50 border border-slate-200 text-xs p-2 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors';

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Panel Top Banner */}
      <div className="px-3 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg shrink-0">
            <Settings size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 leading-tight truncate">
              QE Configuration
            </h2>
            <p className="text-[10px] text-slate-500 font-medium font-mono truncate">
              {params?.control?.prefix || 'pwscf'} • {calculation.toUpperCase()}
            </p>
          </div>
        </div>
        {cellVolumeAng3 > 0 && (
          <span
            className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded shrink-0"
            title="Unit cell volume"
          >
            V = {cellVolumeAng3.toFixed(1)} Å³
          </span>
        )}
      </div>

      {/* Configuration Sub-Tabs */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/90 p-1 gap-0.5 shrink-0">
        {[
          { id: 'structure', label: 'Cell', title: 'Crystal Lattice, Species & Atomic Positions', icon: <Box size={12} /> },
          { id: 'control', label: 'Ctrl', title: '&CONTROL, &IONS, &CELL Parameters', icon: <Activity size={12} /> },
          { id: 'system', label: 'Sys', title: '&SYSTEM Cutoffs, K-Points & Convergence', icon: <Layers size={12} /> },
          { id: 'electrons', label: 'Elec', title: '&ELECTRONS SCF Convergence Settings', icon: <Cpu size={12} /> },
          { id: 'physics', label: 'Spin/U', title: 'Spin Polarization & DFT+U (Hubbard)', icon: <Zap size={12} /> },
          { id: 'pp', label: 'PP', title: 'Post-Processing (pp.x)', icon: <FileSearch size={12} /> },
          { id: 'ph', label: 'PH', title: 'Phonon Calculation (ph.x)', icon: <Waves size={12} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            title={tab.title}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] font-bold rounded-md transition-all ${
              activeTab === tab.id
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {tab.icon}
            <span className="leading-none">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* ================= TAB 1: STRUCTURE & CELL ================= */}
        {activeTab === 'structure' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Section 1: Lattice */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <button
                onClick={() => setLatticeExpanded(!latticeExpanded)}
                className="w-full px-3 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between text-xs font-extrabold uppercase text-slate-700 tracking-wider hover:text-teal-700 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Box size={13} className="text-teal-600" />
                  <span>
                    Lattice ({params?.system?.ibrav === 0 ? 'Free Cell' : `ibrav = ${params?.system?.ibrav || 0}`})
                  </span>
                </span>
                {latticeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {latticeExpanded && (
                <div className="p-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-600 font-bold">Bravais Lattice (ibrav)</span>
                      <button
                        onClick={() => {
                          if (!structure?.lattice) return;
                          const detected = detectBravaisLattice(
                            structure.lattice,
                            structure.detectedInfo?.ibrav
                          );
                          onChange({
                            ...params,
                            system: {
                              ...params.system,
                              ibrav: detected.ibrav,
                              a: detected.a,
                              b: detected.b,
                              c: detected.c,
                              celldm: detected.celldm,
                            },
                          });
                        }}
                        className="text-[10px] bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-md px-2 py-0.5 font-bold flex items-center gap-1 transition-colors"
                        title="Detect Bravais lattice symmetry from current cell vectors"
                      >
                        <RefreshCw size={10} />
                        <span>Auto-detect</span>
                      </button>
                    </div>
                    <select
                      className={inputClass}
                      value={params?.system?.ibrav || 0}
                      onChange={(e) => {
                        const newIbrav = parseInt(e.target.value);
                        const newCelldm = computeCelldmFromParams(
                          newIbrav,
                          latticeParams.a,
                          latticeParams.b,
                          latticeParams.c,
                          latticeParams.alpha,
                          latticeParams.beta,
                          latticeParams.gamma
                        );
                        onChange({
                          ...params,
                          system: {
                            ...params.system,
                            ibrav: newIbrav,
                            a: latticeParams.a,
                            b: latticeParams.b,
                            c: latticeParams.c,
                            celldm: newCelldm,
                          },
                        });
                      }}
                    >
                      {IBRAV_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Editable Lattice Constants (a, b, c, alpha, beta, gamma) */}
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                        Cell Constants
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Å & Degrees</span>
                    </div>

                    {/* Lengths a, b, c */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <label className="block">
                        <span className="text-[10px] text-rose-600 font-bold font-mono uppercase">a (Å)</span>
                        <input
                          type="number"
                          step="0.01"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.a}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0.1;
                            handleLatticeParamsChange(
                              val,
                              latticeParams.b,
                              latticeParams.c,
                              latticeParams.alpha,
                              latticeParams.beta,
                              latticeParams.gamma
                            );
                          }}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-emerald-600 font-bold font-mono uppercase">b (Å)</span>
                        <input
                          type="number"
                          step="0.01"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.b}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0.1;
                            handleLatticeParamsChange(
                              latticeParams.a,
                              val,
                              latticeParams.c,
                              latticeParams.alpha,
                              latticeParams.beta,
                              latticeParams.gamma
                            );
                          }}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-sky-600 font-bold font-mono uppercase">c (Å)</span>
                        <input
                          type="number"
                          step="0.01"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.c}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0.1;
                            handleLatticeParamsChange(
                              latticeParams.a,
                              latticeParams.b,
                              val,
                              latticeParams.alpha,
                              latticeParams.beta,
                              latticeParams.gamma
                            );
                          }}
                        />
                      </label>
                    </div>

                    {/* Angles alpha, beta, gamma */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <label className="block">
                        <span className="text-[10px] text-slate-500 font-bold font-mono">α (°)</span>
                        <input
                          type="number"
                          step="0.5"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.alpha}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 90;
                            handleLatticeParamsChange(
                              latticeParams.a,
                              latticeParams.b,
                              latticeParams.c,
                              val,
                              latticeParams.beta,
                              latticeParams.gamma
                            );
                          }}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-slate-500 font-bold font-mono">β (°)</span>
                        <input
                          type="number"
                          step="0.5"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.beta}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 90;
                            handleLatticeParamsChange(
                              latticeParams.a,
                              latticeParams.b,
                              latticeParams.c,
                              latticeParams.alpha,
                              val,
                              latticeParams.gamma
                            );
                          }}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-slate-500 font-bold font-mono">γ (°)</span>
                        <input
                          type="number"
                          step="0.5"
                          className="mt-0.5 block w-full rounded-md bg-white border border-slate-200 text-xs p-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={latticeParams.gamma}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 90;
                            handleLatticeParamsChange(
                              latticeParams.a,
                              latticeParams.b,
                              latticeParams.c,
                              latticeParams.alpha,
                              latticeParams.beta,
                              val
                            );
                          }}
                        />
                      </label>
                    </div>

                    {/* 3x3 Real-space Cell Vectors */}
                    {structure?.lattice && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                          Cell Vectors Matrix (Å)
                        </span>
                        <div className="space-y-1">
                          {['a1', 'a2', 'a3'].map((vecName, rowIdx) => (
                            <div key={vecName} className="flex items-center gap-1">
                              <span
                                className={`text-[10px] font-mono font-bold w-4 shrink-0 ${
                                  rowIdx === 0
                                    ? 'text-rose-600'
                                    : rowIdx === 1
                                    ? 'text-emerald-600'
                                    : 'text-sky-600'
                                }`}
                              >
                                {vecName}
                              </span>
                              {[0, 1, 2].map((colIdx) => (
                                <input
                                  key={colIdx}
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] font-mono text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  value={Number((structure.lattice[rowIdx]?.[colIdx] ?? 0).toFixed(4))}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    handleLatticeVectorChange(rowIdx, colIdx, val);
                                  }}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* QE Format Choice when ibrav !== 0 */}
                  {params?.system?.ibrav !== 0 && (
                    <div className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-200/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-teal-800 uppercase tracking-wider">
                          QE Lattice Notation
                        </span>
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-200 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              const newCelldm = computeCelldmFromParams(
                                params.system.ibrav,
                                latticeParams.a,
                                latticeParams.b,
                                latticeParams.c,
                                latticeParams.alpha,
                                latticeParams.beta,
                                latticeParams.gamma
                              );
                              onChange({
                                ...params,
                                lattice_entry_mode: 'abc',
                                system: { ...params.system, celldm: newCelldm },
                              });
                            }}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              params.lattice_entry_mode === 'abc'
                                ? 'bg-teal-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            A, B, C (Å)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newCelldm = computeCelldmFromParams(
                                params.system.ibrav,
                                latticeParams.a,
                                latticeParams.b,
                                latticeParams.c,
                                latticeParams.alpha,
                                latticeParams.beta,
                                latticeParams.gamma
                              );
                              onChange({
                                ...params,
                                lattice_entry_mode: 'celldm',
                                system: { ...params.system, celldm: newCelldm },
                              });
                            }}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              params.lattice_entry_mode === 'celldm'
                                ? 'bg-teal-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            celldm (Bohr)
                          </button>
                        </div>
                      </div>

                      {params.lattice_entry_mode === 'celldm' ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <label key={i} className="block">
                              <span className="text-[10px] text-slate-600 font-bold font-mono">
                                celldm({i})
                              </span>
                              <input
                                type="number"
                                step="0.001"
                                className="block w-full rounded bg-white border border-slate-200 text-xs p-1 text-slate-900 font-mono"
                                value={params.system?.celldm?.[i] || 0}
                                onChange={(e) => {
                                  const newCelldm = [
                                    ...(params.system?.celldm || [0, 0, 0, 0, 0, 0, 0]),
                                  ];
                                  newCelldm[i] = parseFloat(e.target.value) || 0;
                                  updateNested('system', 'celldm', newCelldm);
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {['a', 'b', 'c', 'cosab', 'cosac', 'cosbc'].map((field) => (
                            <label key={field} className="block">
                              <span className="text-[10px] text-slate-600 font-bold font-mono">
                                {field}
                              </span>
                              <input
                                type="number"
                                step="0.001"
                                className="block w-full rounded bg-white border border-slate-200 text-xs p-1 text-slate-800 font-mono"
                                value={(params.system as any)?.[field] || 0}
                                onChange={(e) =>
                                  updateNested('system', field, parseFloat(e.target.value) || 0)
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Atomic Species */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <button
                onClick={() => setSpeciesExpanded(!speciesExpanded)}
                className="w-full px-3 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between text-xs font-extrabold uppercase text-slate-700 tracking-wider hover:text-teal-700 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Atom size={13} className="text-teal-600" />
                  <span>Atomic Species &amp; Pseudopotentials ({speciesList.length})</span>
                </span>
                {speciesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {speciesExpanded && (
                <div className="p-3 space-y-2.5">
                  {speciesList.length > 0 && (
                    <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-500">
                        Library: <span className="text-teal-700 font-mono">372 .UPF files</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyBulkPseudoFamily('paw')}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors"
                          title="Switch all elements in structure to PAW (kjpaw) pseudopotentials"
                        >
                          All PAW
                        </button>
                        <button
                          type="button"
                          onClick={() => applyBulkPseudoFamily('uspp')}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                          title="Switch all elements in structure to Ultrasoft (rrkjus/van) pseudopotentials"
                        >
                          All USPP
                        </button>
                      </div>
                    </div>
                  )}

                  {speciesList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Load a structure to see species.</p>
                  ) : (
                    speciesList.map((spec: any) => {
                      const availablePseudos = getPseudopotentialsForElement(spec.symbol);
                      const isInLibrary = availablePseudos.includes(spec.pseudo);
                      const meta = describePseudopotential(spec.pseudo || '');

                      return (
                        <div
                          key={spec.symbol}
                          className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-900 shadow-xs border border-black/10"
                                style={{ backgroundColor: ELEMENT_COLORS[spec.symbol] || '#0D9488' }}
                              >
                                {spec.symbol}
                              </div>
                              <span className="text-xs font-extrabold text-slate-900">{spec.symbol}</span>
                              <button
                                onClick={() => {
                                  setReplaceTarget({ type: 'species', symbol: spec.symbol });
                                  setShowPeriodicTable(true);
                                }}
                                className="px-1.5 py-0.5 text-[10px] bg-white hover:bg-teal-50 text-teal-700 border border-slate-200 hover:border-teal-300 rounded font-bold transition-colors flex items-center gap-1 shadow-2xs"
                                title={`Replace all ${spec.symbol} atoms with another element`}
                              >
                                <RefreshCw size={9} />
                                <span>Replace</span>
                              </button>
                            </div>
                            <label className="text-[11px] flex items-center gap-1">
                              <span className="text-slate-500 font-semibold">Mass:</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs font-mono text-slate-800"
                                value={spec.mass}
                                onChange={(e) =>
                                  updateSpecies(spec.symbol, 'mass', parseFloat(e.target.value) || 1.0)
                                }
                              />
                            </label>
                          </div>

                          {/* Pseudopotential Dropdown Selector */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">
                                  Pseudopotential ({availablePseudos.length} available)
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                    meta.type === 'PAW'
                                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                                      : meta.type === 'USPP'
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {meta.type}
                                </span>
                                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white text-slate-600 border border-slate-200">
                                  {meta.functional}
                                </span>
                                {meta.relativistic === 'Full-Rel' && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                    Full-Rel
                                  </span>
                                )}
                              </div>

                              {isInLibrary && (
                                <a
                                  href={`${import.meta.env.BASE_URL}pseudopot/${spec.pseudo}`}
                                  download={spec.pseudo}
                                  className="text-[10px] text-teal-700 hover:text-teal-900 font-bold flex items-center gap-0.5 hover:underline shrink-0"
                                  title={`Download ${spec.pseudo} from library`}
                                >
                                  <Download size={10} />
                                  <span>.UPF</span>
                                </a>
                              )}
                            </div>

                            {availablePseudos.length > 0 && (
                              <select
                                className="block w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[11px] font-mono text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                                value={isInLibrary ? spec.pseudo : '__custom__'}
                                onChange={(e) => {
                                  if (e.target.value !== '__custom__') {
                                    updateSpecies(spec.symbol, 'pseudo', e.target.value);
                                  }
                                }}
                              >
                                {availablePseudos.map((upf) => {
                                  const info = describePseudopotential(upf);
                                  return (
                                    <option key={upf} value={upf}>
                                      {upf} — [{info.type} • {info.functional}
                                      {info.relativistic === 'Full-Rel' ? ' • Rel' : ''} • {info.valenceHint}]
                                    </option>
                                  );
                                })}
                                {!isInLibrary && (
                                  <option value="__custom__">Custom: {spec.pseudo}</option>
                                )}
                              </select>
                            )}

                            <input
                              type="text"
                              className="block w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                              value={spec.pseudo}
                              placeholder={`${spec.symbol}.pbe-n-kjpaw_psl.1.0.0.UPF`}
                              title="Selected pseudopotential filename (editable for custom .UPF files)"
                              onChange={(e) => updateSpecies(spec.symbol, 'pseudo', e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Section 3: Atomic Positions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <button
                onClick={() => setAtomsExpanded(!atomsExpanded)}
                className="w-full px-3 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between text-xs font-extrabold uppercase text-slate-700 tracking-wider hover:text-teal-700 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Layers size={13} className="text-teal-600" />
                  <span>Atomic Positions ({structure?.atoms?.length || 0})</span>
                </span>
                {atomsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {atomsExpanded && structure?.atoms && (
                <div className="p-2.5 space-y-2">
                  {/* Coordinate Unit Switcher & Bulk Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => onChange({ ...params, atomic_positions_unit: 'angstrom' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          posUnit === 'angstrom'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Angstrom (Å)
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ ...params, atomic_positions_unit: 'crystal' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          posUnit === 'crystal'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Crystal (Frac)
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleAllAtomsFix(true)}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 flex items-center gap-0.5"
                        title="Fix all atoms (0 0 0)"
                      >
                        <Lock size={9} />
                        <span>Fix All</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAllAtomsFix(false)}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 flex items-center gap-0.5"
                        title="Unfix all atoms (1 1 1)"
                      >
                        <Unlock size={9} />
                        <span>Free All</span>
                      </button>
                    </div>
                  </div>

                  {/* Table Header */}
                  <div className="grid grid-cols-[42px_1fr_1fr_1fr_24px_20px] gap-1 text-[9px] text-slate-500 font-extrabold font-mono px-1 uppercase items-center">
                    <div>Elem</div>
                    <div className="text-center">{posUnit === 'crystal' ? 'u' : 'X (Å)'}</div>
                    <div className="text-center">{posUnit === 'crystal' ? 'v' : 'Y (Å)'}</div>
                    <div className="text-center">{posUnit === 'crystal' ? 'w' : 'Z (Å)'}</div>
                    <div className="text-center" title="Fix coordinates in relaxation">
                      Fix
                    </div>
                    <div />
                  </div>

                  {/* Atom Rows */}
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar">
                    {structure.atoms.map((atom, idx) => {
                      const isFixed = atom.if_pos && atom.if_pos[0] === 0;
                      const isCrystal = posUnit === 'crystal';
                      const [dispX, dispY, dispZ] =
                        isCrystal && structure.lattice && structure.lattice.length === 3
                          ? cartToFrac([atom.x, atom.y, atom.z], structure.lattice)
                          : [atom.x, atom.y, atom.z];

                      return (
                        <div
                          key={idx}
                          className="grid grid-cols-[42px_1fr_1fr_1fr_24px_20px] gap-1 text-[11px] font-mono bg-slate-50 border border-slate-200/80 p-1 rounded-md hover:border-teal-300 items-center transition-colors"
                        >
                          <button
                            onClick={() => {
                              setReplaceTarget({ type: 'atom', index: idx, symbol: atom.symbol });
                              setShowPeriodicTable(true);
                            }}
                            className="font-bold text-teal-700 hover:text-teal-900 bg-white border border-slate-200 rounded px-1 py-0.5 cursor-pointer text-left flex items-center justify-between"
                            title="Click to replace element via Periodic Table"
                          >
                            <span>{atom.symbol}</span>
                            <RefreshCw size={8} className="opacity-50" />
                          </button>
                          <input
                            type="number"
                            step={isCrystal ? '0.01' : '0.05'}
                            className="w-full bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            value={Number(dispX.toFixed(4))}
                            onChange={(e) => handleAtomCoordEdit(idx, 'x', e.target.value, isCrystal)}
                          />
                          <input
                            type="number"
                            step={isCrystal ? '0.01' : '0.05'}
                            className="w-full bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            value={Number(dispY.toFixed(4))}
                            onChange={(e) => handleAtomCoordEdit(idx, 'y', e.target.value, isCrystal)}
                          />
                          <input
                            type="number"
                            step={isCrystal ? '0.01' : '0.05'}
                            className="w-full bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            value={Number(dispZ.toFixed(4))}
                            onChange={(e) => handleAtomCoordEdit(idx, 'z', e.target.value, isCrystal)}
                          />
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              className="cursor-pointer rounded border-slate-300 text-teal-600 focus:ring-0"
                              checked={!!isFixed}
                              onChange={() => toggleAtomFix(idx)}
                              title="Fix atom position (if_pos = 0 0 0)"
                            />
                          </div>
                          <button
                            onClick={() => handleDeleteAtom(idx)}
                            className="text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                            title="Delete atom"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Atom Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceTarget({ type: 'add-atom' });
                      setShowPeriodicTable(true);
                    }}
                    className="w-full py-1.5 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus size={13} />
                    <span>Add Atom Site</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: CONTROL (&CONTROL, &IONS, &CELL) ================= */}
        {activeTab === 'control' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Activity size={13} className="text-teal-600" />
                <span>Calculation Control (&amp;CONTROL)</span>
              </h3>

              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Calculation Mode</span>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={calculation}
                  onChange={(e) => {
                    const newCalc = e.target.value as any;
                    const newParams = { ...params };
                    newParams.control = { ...newParams.control, calculation: newCalc };

                    if (newCalc === 'bands') {
                      newParams.k_points = {
                        ...newParams.k_points,
                        type: 'crystal_b',
                        points: [
                          { x: 0, y: 0, z: 0, w: 20 },
                          { x: 0.5, y: 0, z: 0, w: 20 },
                        ],
                      };
                    } else if (['scf', 'relax', 'vc-relax', 'md'].includes(newCalc)) {
                      if (newParams.k_points.type !== 'automatic') {
                        newParams.k_points = {
                          ...newParams.k_points,
                          type: 'automatic',
                          values: [4, 4, 4, 1, 1, 1],
                        };
                      }
                    }
                    onChange(newParams);
                  }}
                >
                  <option value="scf">scf — Self-Consistent Field</option>
                  <option value="nscf">nscf — Non-Self-Consistent Field</option>
                  <option value="bands">bands — Electronic Band Structure</option>
                  <option value="relax">relax — Ionic Relaxation</option>
                  <option value="vc-relax">vc-relax — Variable-Cell Relaxation</option>
                  <option value="md">md — Molecular Dynamics</option>
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Restart Mode</span>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={params?.control?.restart_mode || 'from_scratch'}
                  onChange={(e) => updateNested('control', 'restart_mode', e.target.value)}
                >
                  <option value="from_scratch">from_scratch</option>
                  <option value="restart">restart</option>
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Prefix</span>
                <input
                  type="text"
                  className={`mt-1 ${monoInputClass}`}
                  value={params?.control?.prefix || 'pwscf'}
                  onChange={(e) => updateNested('control', 'prefix', e.target.value)}
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-600">Output Dir (outdir)</span>
                  <span className="text-[10px] text-teal-600 font-semibold">Scratch / .save path</span>
                </div>
                <input
                  type="text"
                  className={`mt-1 ${monoInputClass}`}
                  value={params?.control?.outdir || './'}
                  placeholder="./ or ./tmp/"
                  onChange={(e) => updateNested('control', 'outdir', e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Pseudopotential Dir (pseudo_dir)</span>
                <input
                  type="text"
                  className={`mt-1 ${monoInputClass}`}
                  value={params?.control?.pseudo_dir || './pseudo/'}
                  onChange={(e) => updateNested('control', 'pseudo_dir', e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    checked={params?.control?.tstress || false}
                    onChange={(e) => updateNested('control', 'tstress', e.target.checked)}
                  />
                  <span className="text-xs font-semibold text-slate-700">Calc Stress (tstress)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    checked={params?.control?.tprnfor || false}
                    onChange={(e) => updateNested('control', 'tprnfor', e.target.checked)}
                  />
                  <span className="text-xs font-semibold text-slate-700">Calc Forces (tprnfor)</span>
                </label>
              </div>
            </div>

            {/* IONS Section */}
            {isRelax && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                  <Move size={13} className="text-teal-600" />
                  <span>Ion Dynamics (&amp;IONS)</span>
                </h3>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">Algorithm (ion_dynamics)</span>
                  <select
                    className={`mt-1 ${inputClass}`}
                    value={params.ions?.ion_dynamics || 'bfgs'}
                    onChange={(e) => updateNested('ions', 'ion_dynamics', e.target.value)}
                  >
                    <option value="bfgs">bfgs (Quasi-Newton)</option>
                    <option value="damp">damp (Damped Quick-Min)</option>
                    <option value="verlet">verlet (MD Verlet)</option>
                    <option value="langevin">langevin (Langevin MD)</option>
                  </select>
                </label>
              </div>
            )}

            {/* CELL Section */}
            {isVCRelax && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                  <Box size={13} className="text-teal-600" />
                  <span>Cell Dynamics (&amp;CELL)</span>
                </h3>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">Algorithm (cell_dynamics)</span>
                  <select
                    className={`mt-1 ${inputClass}`}
                    value={params.cell?.cell_dynamics || 'bfgs'}
                    onChange={(e) => updateNested('cell', 'cell_dynamics', e.target.value)}
                  >
                    <option value="bfgs">bfgs (BFGS Cell Optimization)</option>
                    <option value="pr">pr (Parrinello-Rahman)</option>
                    <option value="w">w (Wentzcovitch)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">Target Pressure (kbar)</span>
                  <input
                    type="number"
                    step="0.1"
                    className={`mt-1 ${monoInputClass}`}
                    value={params.cell?.press || 0}
                    onChange={(e) => updateNested('cell', 'press', parseFloat(e.target.value) || 0)}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: SYSTEM (&SYSTEM, K_POINTS, CONVERGENCE) ================= */}
        {activeTab === 'system' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Energy Cutoffs & Smearing Card */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Layers size={13} className="text-teal-600" />
                <span>Basis Cutoffs &amp; Occupations</span>
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-bold text-slate-600">ecutwfc (Ry)</span>
                  <input
                    type="number"
                    step="5"
                    className={`mt-1 ${monoInputClass}`}
                    value={params?.system?.ecutwfc || 30}
                    onChange={(e) =>
                      updateNested('system', 'ecutwfc', parseFloat(e.target.value) || 30)
                    }
                  />
                </label>

                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">ecutrho (Ry)</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateNested('system', 'ecutrho', (params?.system?.ecutwfc || 30) * 4)
                        }
                        className="text-[9px] px-1 bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded border border-slate-200 font-mono"
                        title="Set ecutrho = 4 × ecutwfc (Norm-Conserving)"
                      >
                        4×
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateNested('system', 'ecutrho', (params?.system?.ecutwfc || 30) * 8)
                        }
                        className="text-[9px] px-1 bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded border border-slate-200 font-mono"
                        title="Set ecutrho = 8 × ecutwfc (PAW / Ultrasoft)"
                      >
                        8×
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="20"
                    className={`mt-1 ${monoInputClass}`}
                    value={params?.system?.ecutrho || 240}
                    onChange={(e) =>
                      updateNested('system', 'ecutrho', parseFloat(e.target.value) || 240)
                    }
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Occupations</span>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={params?.system?.occupations || 'smearing'}
                  onChange={(e) => updateNested('system', 'occupations', e.target.value)}
                >
                  <option value="smearing">smearing (Metals / General)</option>
                  <option value="fixed">fixed (Insulators with gap)</option>
                  <option value="tetrahedra">tetrahedra (DOS / Brillouin Zone)</option>
                </select>
              </label>

              {params?.system?.occupations === 'smearing' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <label className="block">
                    <span className="text-[11px] font-bold text-slate-600">Smearing Type</span>
                    <select
                      className={`mt-1 ${inputClass}`}
                      value={params?.system?.smearing || 'gaussian'}
                      onChange={(e) => updateNested('system', 'smearing', e.target.value)}
                    >
                      <option value="gaussian">gaussian</option>
                      <option value="methfessel-paxton">methfessel-paxton (mp)</option>
                      <option value="marzari-vanderbilt">marzari-vanderbilt (cold)</option>
                      <option value="fermi-dirac">fermi-dirac (fd)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold text-slate-600">degauss (Ry)</span>
                    <input
                      type="number"
                      step={0.005}
                      className={`mt-1 ${monoInputClass}`}
                      value={params?.system?.degauss || 0.02}
                      onChange={(e) =>
                        updateNested('system', 'degauss', parseFloat(e.target.value) || 0.01)
                      }
                    />
                  </label>
                </div>
              )}
            </div>

            {/* K-Points Card */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider">
                  K_POINTS Mesh
                </h3>
                <div className="flex items-center gap-1.5">
                  {params?.k_points?.type === 'automatic' && (
                    <button
                      type="button"
                      onClick={handleAutoSuggestKMesh}
                      className="text-[10px] px-2 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-md font-bold flex items-center gap-1 transition-colors"
                      title="Auto-calculate k-grid from reciprocal lattice lengths"
                    >
                      <Sparkles size={10} />
                      <span>Suggest</span>
                    </button>
                  )}
                  <select
                    className="bg-slate-100 border border-slate-200 text-[10px] font-bold rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={params?.k_points?.type || 'automatic'}
                    onChange={(e) =>
                      onChange({
                        ...params,
                        k_points: { ...(params?.k_points || {}), type: e.target.value as any },
                      })
                    }
                  >
                    <option value="automatic">automatic</option>
                    <option value="gamma">gamma</option>
                    <option value="crystal">crystal</option>
                    <option value="tpiba">tpiba</option>
                    <option value="crystal_b">crystal_b (Bands)</option>
                  </select>
                </div>
              </div>

              {params?.k_points?.type === 'automatic' ? (
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">
                      Monkhorst-Pack Grid (nk1 × nk2 × nk3)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((idx) => (
                        <input
                          key={`k-${idx}`}
                          type="number"
                          min={1}
                          className="rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-bold p-1.5 text-center text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={params?.k_points?.values?.[idx] || 1}
                          onChange={(e) => {
                            const newK = [...(params?.k_points?.values || [4, 4, 4, 1, 1, 1])];
                            newK[idx] = Math.max(1, parseInt(e.target.value) || 1);
                            onChange({
                              ...params,
                              k_points: { ...(params?.k_points || {}), values: newK } as any,
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">
                      Grid Offset Shift (sk1, sk2, sk3 ∈ 0, 1)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[3, 4, 5].map((idx) => (
                        <input
                          key={`off-${idx}`}
                          type="number"
                          min={0}
                          max={1}
                          className="rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono p-1.5 text-center text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          value={params?.k_points?.values?.[idx] ?? 0}
                          onChange={(e) => {
                            const newK = [...(params?.k_points?.values || [4, 4, 4, 0, 0, 0])];
                            newK[idx] = Math.min(1, Math.max(0, parseInt(e.target.value) || 0));
                            onChange({
                              ...params,
                              k_points: { ...(params?.k_points || {}), values: newK } as any,
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : params?.k_points?.type === 'gamma' ? (
                <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
                  Single Γ-point (0, 0, 0) sampling enabled.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Path Generator */}
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-teal-700">
                      <Route size={13} />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">
                        Brillouin Zone Path Generator
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-slate-600 font-bold uppercase block mb-1">
                          Pts / Segment
                        </span>
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs font-mono text-slate-900"
                          defaultValue={20}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 20);
                            const newPoints = (params?.k_points?.points || []).map((p) => ({
                              ...p,
                              w: val,
                            }));
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPoints },
                            });
                          }}
                        />
                      </label>

                      <label className="block">
                        <span className="text-[10px] text-slate-600 font-bold uppercase block mb-1">
                          Preset Path
                        </span>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs text-slate-900"
                          onChange={(e) => {
                            const pathStr = e.target.value;
                            if (!pathStr) return;
                            const points = getPointsForPath(params.system?.ibrav || 1, pathStr);
                            const newPoints = points.map((p) => ({
                              x: p.coords[0],
                              y: p.coords[1],
                              z: p.coords[2],
                              w: 20,
                            }));
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPoints },
                            });
                          }}
                        >
                          <option value="">Select path...</option>
                          {(SUGGESTED_PATHS[params.system?.ibrav || 1] || SUGGESTED_PATHS[1]).map(
                            (path) => (
                              <option key={path} value={path}>
                                {path}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">
                        High-Symmetry Points
                      </span>
                      <button
                        onClick={() =>
                          onChange({ ...params, k_points: { ...params.k_points, points: [] } })
                        }
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {(
                        HIGH_SYMMETRY_POINTS[params.system?.ibrav || 1] || HIGH_SYMMETRY_POINTS[1]
                      ).map((p) => (
                        <button
                          key={p.label}
                          onClick={() => {
                            const newPts = [
                              ...(params?.k_points?.points || []),
                              { x: p.coords[0], y: p.coords[1], z: p.coords[2], w: 20 },
                            ];
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                          className="px-2 py-0.5 bg-white hover:bg-teal-600 rounded text-[10px] font-bold text-slate-700 hover:text-white transition-colors border border-slate-200"
                          title={`Add ${p.label} (${p.coords.join(', ')})`}
                        >
                          +{p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Points Table */}
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_20px] gap-1 text-[10px] text-slate-500 font-bold font-mono px-1">
                      <div>kx</div>
                      <div>ky</div>
                      <div>kz</div>
                      <div>{params?.k_points?.type?.endsWith('_b') ? 'Pts' : 'W'}</div>
                      <div />
                    </div>
                    {(params?.k_points?.points || []).map((pt, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_1fr_1fr_0.8fr_20px] gap-1 items-center"
                      >
                        <input
                          type="number"
                          step="0.05"
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[11px] font-mono text-center text-slate-900"
                          value={pt.x}
                          onChange={(e) => {
                            const newPts = [...(params?.k_points?.points || [])];
                            newPts[idx] = { ...pt, x: parseFloat(e.target.value) || 0 };
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                        />
                        <input
                          type="number"
                          step="0.05"
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[11px] font-mono text-center text-slate-900"
                          value={pt.y}
                          onChange={(e) => {
                            const newPts = [...(params?.k_points?.points || [])];
                            newPts[idx] = { ...pt, y: parseFloat(e.target.value) || 0 };
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                        />
                        <input
                          type="number"
                          step="0.05"
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[11px] font-mono text-center text-slate-900"
                          value={pt.z}
                          onChange={(e) => {
                            const newPts = [...(params?.k_points?.points || [])];
                            newPts[idx] = { ...pt, z: parseFloat(e.target.value) || 0 };
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                        />
                        <input
                          type="number"
                          step="1"
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[11px] font-mono text-center text-slate-900"
                          value={pt.w}
                          onChange={(e) => {
                            const newPts = [...(params?.k_points?.points || [])];
                            newPts[idx] = { ...pt, w: parseFloat(e.target.value) || 1 };
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                        />
                        <button
                          onClick={() => {
                            const newPts = (params?.k_points?.points || []).filter(
                              (_, i) => i !== idx
                            );
                            onChange({
                              ...params,
                              k_points: { ...params.k_points, points: newPts },
                            });
                          }}
                          className="text-slate-400 hover:text-rose-600 flex items-center justify-center"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newPts = [
                          ...(params?.k_points?.points || []),
                          { x: 0, y: 0, z: 0, w: 20 },
                        ];
                        onChange({ ...params, k_points: { ...params.k_points, points: newPts } });
                      }}
                      className="w-full py-1.5 mt-1 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 font-bold flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> Add K-Point
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Convergence Testing Card */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-teal-600" />
                  <div>
                    <h3 className="text-xs font-extrabold uppercase text-slate-700">
                      Convergence Testing
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Generate batch input files across cutoffs or K-grids
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={params?.system?.convergence_test?.enabled || false}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      const existing = params?.system?.convergence_test || {
                        enabled: false,
                        testType: 'ecutwfc',
                        ecutwfc: { initial: 20, final: 60, step: 10 },
                        kpoints: { initial: 2, final: 6, step: 1 },
                      };
                      onChange({
                        ...params,
                        system: {
                          ...params.system,
                          convergence_test: {
                            ...existing,
                            enabled,
                          },
                        },
                      });
                    }}
                  />
                  <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-600" />
                </label>
              </div>

              {params?.system?.convergence_test?.enabled && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = params.system.convergence_test!;
                        onChange({
                          ...params,
                          system: {
                            ...params.system,
                            convergence_test: { ...cur, testType: 'ecutwfc' },
                          },
                        });
                      }}
                      className={`py-1 px-2 text-xs font-bold rounded-md transition-all ${
                        params.system.convergence_test?.testType === 'ecutwfc'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ECUTWFC Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = params.system.convergence_test!;
                        onChange({
                          ...params,
                          system: {
                            ...params.system,
                            convergence_test: { ...cur, testType: 'kpoints' },
                          },
                        });
                      }}
                      className={`py-1 px-2 text-xs font-bold rounded-md transition-all ${
                        params.system.convergence_test?.testType === 'kpoints'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      K-Points Scan
                    </button>
                  </div>

                  {params.system.convergence_test?.testType === 'ecutwfc' ? (
                    <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            Start (Ry)
                          </span>
                          <input
                            type="number"
                            min="5"
                            step="5"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.ecutwfc?.initial ?? 20}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 10;
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    ecutwfc: { ...cur.ecutwfc, initial: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            End (Ry)
                          </span>
                          <input
                            type="number"
                            min="10"
                            step="5"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.ecutwfc?.final ?? 60}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 60;
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    ecutwfc: { ...cur.ecutwfc, final: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            Step (Ry)
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="5"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.ecutwfc?.step ?? 10}
                            onChange={(e) => {
                              const val = Math.max(1, parseFloat(e.target.value) || 5);
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    ecutwfc: { ...cur.ecutwfc, step: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            Start (n)
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.kpoints?.initial ?? 2}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    kpoints: { ...cur.kpoints, initial: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            End (n)
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.kpoints?.final ?? 6}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 2);
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    kpoints: { ...cur.kpoints, final: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-slate-600 block">
                            Step (n)
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="w-full mt-0.5 rounded bg-white border border-slate-200 p-1.5 text-xs text-slate-900 font-mono"
                            value={params.system.convergence_test.kpoints?.step ?? 1}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              const cur = params.system.convergence_test!;
                              onChange({
                                ...params,
                                system: {
                                  ...params.system,
                                  convergence_test: {
                                    ...cur,
                                    kpoints: { ...cur.kpoints, step: val },
                                  },
                                },
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: ELECTRONS (&ELECTRONS) ================= */}
        {activeTab === 'electrons' && (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3 animate-in fade-in duration-150">
            <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
              <Cpu size={13} className="text-teal-600" />
              <span>SCF Electronic Loop (&amp;ELECTRONS)</span>
            </h3>

            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">
                  Convergence Threshold (conv_thr)
                </span>
                <div className="flex items-center gap-1">
                  {[1e-6, 1e-8, 1e-10].map((thr) => (
                    <button
                      key={thr}
                      type="button"
                      onClick={() => updateNested('electrons', 'conv_thr', thr)}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded border border-slate-200 font-mono"
                    >
                      {thr.toExponential(0)}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                className={`mt-1 ${monoInputClass}`}
                value={params?.electrons?.conv_thr || 1e-6}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateNested('electrons', 'conv_thr', v);
                }}
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">Mixing Beta (0.1 – 0.8)</span>
              <input
                type="number"
                step={0.05}
                min={0.05}
                max={1.0}
                className={`mt-1 ${monoInputClass}`}
                value={params?.electrons?.mixing_beta || 0.7}
                onChange={(e) =>
                  updateNested('electrons', 'mixing_beta', parseFloat(e.target.value) || 0.7)
                }
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">
                Max SCF Iterations (electron_maxstep)
              </span>
              <input
                type="number"
                min={10}
                max={1000}
                className={`mt-1 ${monoInputClass}`}
                value={params?.electrons?.electron_maxstep || 100}
                onChange={(e) =>
                  updateNested('electrons', 'electron_maxstep', parseInt(e.target.value) || 100)
                }
              />
            </label>
          </div>
        )}

        {/* ================= TAB 5: PHYSICS (MAGNETIZATION & DFT+U) ================= */}
        {activeTab === 'physics' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Atom size={13} className="text-teal-600" />
                <span>Spin &amp; Magnetism</span>
              </h3>
              <label className="block">
                <span className="text-[11px] text-slate-600 font-bold">Spin Polarization (nspin)</span>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={params?.system?.nspin || 1}
                  onChange={(e) => updateNested('system', 'nspin', parseInt(e.target.value))}
                >
                  <option value={1}>1: Non-magnetic (unpolarized)</option>
                  <option value={2}>2: Spin-polarized (collinear LSDA/GGA)</option>
                </select>
              </label>

              {params?.system?.nspin === 2 && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase font-extrabold">
                    Starting Magnetization (-1.0 to +1.0)
                  </p>
                  {speciesList.map((spec: any) => (
                    <div key={spec.symbol} className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {spec.symbol}
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="-1"
                        max="1"
                        placeholder="0.0"
                        className="w-24 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-mono text-right text-slate-900"
                        value={spec.magnetization || 0}
                        onChange={(e) =>
                          updateSpecies(
                            spec.symbol,
                            'magnetization',
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                  <Zap size={13} className="text-teal-600" />
                  <span>DFT+U (Hubbard Card)</span>
                </h3>
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  checked={params.hubbard?.enabled || false}
                  onChange={(e) =>
                    onChange({
                      ...params,
                      hubbard: { ...(params.hubbard || {}), enabled: e.target.checked } as any,
                    })
                  }
                />
              </div>

              {params.hubbard?.enabled && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-3">
                  <label className="block">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">
                      Projector Type
                    </span>
                    <select
                      className={`mt-1 ${inputClass}`}
                      value={params.hubbard?.projection || 'atomic'}
                      onChange={(e) =>
                        onChange({
                          ...params,
                          hubbard: {
                            ...(params.hubbard || {}),
                            projection: e.target.value as any,
                          } as any,
                        })
                      }
                    >
                      <option value="atomic">atomic</option>
                      <option value="ortho-atomic">ortho-atomic</option>
                      <option value="norm-atomic">norm-atomic</option>
                      <option value="wf">wf</option>
                      <option value="pseudo">pseudo</option>
                    </select>
                  </label>

                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 font-extrabold uppercase">
                      Manifold &amp; U Value
                    </p>
                    {speciesList.map((spec: any) => (
                      <div
                        key={spec.symbol}
                        className="grid grid-cols-[32px_1fr_1fr] gap-1.5 items-center bg-white border border-slate-200 p-2 rounded-lg"
                      >
                        <span className="text-xs font-mono font-bold text-slate-900">
                          {spec.symbol}
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. 3d, 4f"
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-800"
                          value={spec.hubbard_manifold || ''}
                          onChange={(e) =>
                            updateSpecies(spec.symbol, 'hubbard_manifold', e.target.value)
                          }
                        />
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            placeholder="U (eV)"
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right pr-6 text-slate-900"
                            value={spec.hubbard_u || ''}
                            onChange={(e) =>
                              updateSpecies(
                                spec.symbol,
                                'hubbard_u',
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                          <span className="absolute right-1.5 top-1 text-[10px] text-slate-400">
                            eV
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 6: POST-PROCESSING (pp.x) ================= */}
        {activeTab === 'pp' && (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <FileSearch size={13} className="text-teal-600" />
                <span>Post-Processing (pp.x)</span>
              </h3>
              <input
                type="checkbox"
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                checked={params.pp?.enabled || false}
                onChange={(e) => updateNested('pp', 'enabled', e.target.checked)}
              />
            </div>

            {params.pp?.enabled ? (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">
                    Quantity to Plot (plot_num)
                  </span>
                  <select
                    className={`mt-1 ${inputClass}`}
                    value={params.pp?.plot_num ?? 0}
                    onChange={(e) => updateNested('pp', 'plot_num', parseInt(e.target.value))}
                  >
                    {PLOT_NUM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">
                    Intermediate Plot File (filplot)
                  </span>
                  <input
                    type="text"
                    className={`mt-1 ${monoInputClass}`}
                    value={params.pp?.filplot || ''}
                    onChange={(e) => updateNested('pp', 'filplot', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">Output Format</span>
                  <select
                    className={`mt-1 ${inputClass}`}
                    value={params.pp?.output_format ?? 6}
                    onChange={(e) => updateNested('pp', 'output_format', parseInt(e.target.value))}
                  >
                    <option value={6}>6: Gaussian Cube (.cube)</option>
                    <option value={5}>5: XCrySDen (.xsf)</option>
                    <option value={3}>3: 2D Contour Plot</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">
                    Output Filename (fileout)
                  </span>
                  <input
                    type="text"
                    className={`mt-1 ${monoInputClass}`}
                    value={params.pp?.fileout || ''}
                    onChange={(e) => updateNested('pp', 'fileout', e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Enable the checkbox above to configure <code className="font-mono">pp.in</code> for
                charge density, ELF, STM, or potential extraction.
              </p>
            )}
          </div>
        )}

        {/* ================= TAB 7: PHONONS (ph.x) ================= */}
        {activeTab === 'ph' && (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Waves size={13} className="text-teal-600" />
                <span>DFPT Phonons (ph.x)</span>
              </h3>
              <input
                type="checkbox"
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                checked={params.ph?.enabled || false}
                onChange={(e) => updateNested('ph', 'enabled', e.target.checked)}
              />
            </div>

            {params.ph?.enabled ? (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">
                    Phonon Threshold (tr2_ph)
                  </span>
                  <input
                    type="text"
                    className={`mt-1 ${monoInputClass}`}
                    value={params.ph?.tr2_ph ?? 1.0e-12}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) updateNested('ph', 'tr2_ph', v);
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-600 font-bold">
                    Dynamical Matrix File (fildyn)
                  </span>
                  <input
                    type="text"
                    className={`mt-1 ${monoInputClass}`}
                    value={params.ph?.fildyn || ''}
                    onChange={(e) => updateNested('ph', 'fildyn', e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    checked={params.ph?.ldisp || false}
                    onChange={(e) => updateNested('ph', 'ldisp', e.target.checked)}
                  />
                  <span className="text-xs text-slate-700 font-semibold">
                    Phonon Dispersion Grid (ldisp = .true.)
                  </span>
                </label>
                {params.ph?.ldisp && (
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                      <label key={i}>
                        <span className="text-[10px] text-slate-600 font-bold font-mono uppercase">
                          nq{i}
                        </span>
                        <input
                          type="number"
                          min={1}
                          className={`mt-1 ${monoInputClass} text-center`}
                          value={(params.ph as any)[`nq${i}`] ?? 2}
                          onChange={(e) =>
                            updateNested('ph', `nq${i}`, Math.max(1, parseInt(e.target.value) || 1))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Enable the checkbox above to configure <code className="font-mono">ph.in</code> for
                phonon frequencies and dynamical matrices.
              </p>
            )}
          </div>
        )}
      </div>

      {showPeriodicTable && (
        <PeriodicTableModal
          onClose={() => {
            setShowPeriodicTable(false);
            setReplaceTarget(null);
          }}
          onSelect={handleElementSelect}
          currentSymbol={replaceTarget?.symbol}
        />
      )}

      <div className="p-2 border-t border-slate-200 text-center bg-white text-[11px] text-slate-500 font-medium flex-none">
        Developed by{' '}
        <a
          href="https://spaceofsebin.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-600 hover:text-teal-700 hover:underline font-semibold transition-colors"
        >
          Dr. Sebin Devasia
        </a>
      </div>
    </div>
  );
};

export default SettingsPanel;
