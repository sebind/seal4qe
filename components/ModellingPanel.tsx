import React, { useState, useEffect } from 'react';
import { CrystalStructure } from '../types';
import { 
  translateCell, 
  centerCellAtoms, 
  createSupercell, 
  generateSlab 
} from '../utils/modellingUtils';
import { 
  Move, 
  Grid3X3, 
  Layers, 
  RotateCcw, 
  Sparkles, 
  Check, 
  Maximize2, 
  Compass, 
  Sliders, 
  ArrowRightLeft,
  Minimize2
} from 'lucide-react';

interface ModellingPanelProps {
  structure: CrystalStructure | null;
  onStructureChange: (newStructure: CrystalStructure) => void;
}

export const ModellingPanel: React.FC<ModellingPanelProps> = ({
  structure,
  onStructureChange,
}) => {
  // Store base structure for translation to allow smooth slider dragging & reset
  const [baseStructure, setBaseStructure] = useState<CrystalStructure | null>(structure);
  const [originalImportedStructure, setOriginalImportedStructure] = useState<CrystalStructure | null>(structure);
  const isInternalUpdateRef = React.useRef(false);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'translate' | 'supercell' | 'slab'>('translate');

  // 1. Translation state
  const [da, setDa] = useState(0);
  const [db, setDb] = useState(0);
  const [dc, setDc] = useState(0);
  const [wrapAtoms, setWrapAtoms] = useState(true);

  // 2. Supercell state
  const [na, setNa] = useState(2);
  const [nb, setNb] = useState(2);
  const [nc, setNc] = useState(1);

  // 3. Slab state
  const [h, setH] = useState(0);
  const [k, setK] = useState(0);
  const [l, setL] = useState(1);
  const [vacuum, setVacuum] = useState(15);
  const [layers, setLayers] = useState(2);
  const [centerSlab, setCenterSlab] = useState(true);

  // Detect when a new structure is loaded externally (e.g. preset change, file upload, text edit)
  useEffect(() => {
    if (!structure) return;

    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    setBaseStructure(structure);
    setOriginalImportedStructure(structure);
    setDa(0);
    setDb(0);
    setDc(0);
  }, [structure]);

  if (!structure) {
    return (
      <div className="p-4 text-center text-xs text-slate-500 font-medium">
        No crystal structure loaded. Import or select a preset to enable modelling.
      </div>
    );
  }

  // Handle translation live dragging
  const handleTranslateChange = (newDa: number, newDb: number, newDc: number, newWrap: boolean) => {
    setDa(newDa);
    setDb(newDb);
    setDc(newDc);
    setWrapAtoms(newWrap);

    // Compute relative delta from base structure
    const base = baseStructure || structure;
    const updated = translateCell(base, newDa, newDb, newDc, newWrap);
    isInternalUpdateRef.current = true;
    onStructureChange(updated);
  };

  const handleResetTranslation = () => {
    setDa(0);
    setDb(0);
    setDc(0);
    if (baseStructure) {
      isInternalUpdateRef.current = true;
      onStructureChange(baseStructure);
    }
  };

  const handleCenterStructure = () => {
    const centered = centerCellAtoms(structure);
    setBaseStructure(centered);
    setDa(0);
    setDb(0);
    setDc(0);
    isInternalUpdateRef.current = true;
    onStructureChange(centered);
  };

  // Handle Supercell creation
  const handleApplySupercell = () => {
    const supercell = createSupercell(structure, na, nb, nc);
    setBaseStructure(supercell);
    setDa(0);
    setDb(0);
    setDc(0);
    isInternalUpdateRef.current = true;
    onStructureChange(supercell);
  };

  const handlePresetSupercell = (pNa: number, pNb: number, pNc: number) => {
    setNa(pNa);
    setNb(pNb);
    setNc(pNc);
    const supercell = createSupercell(structure, pNa, pNb, pNc);
    setBaseStructure(supercell);
    setDa(0);
    setDb(0);
    setDc(0);
    isInternalUpdateRef.current = true;
    onStructureChange(supercell);
  };

  // Handle Slab generation
  const handleGenerateSlab = () => {
    const slab = generateSlab(structure, h, k, l, vacuum, layers, centerSlab);
    setBaseStructure(slab);
    setDa(0);
    setDb(0);
    setDc(0);
    isInternalUpdateRef.current = true;
    onStructureChange(slab);
  };

  const handlePresetSlab = (pH: number, pK: number, pL: number) => {
    setH(pH);
    setK(pK);
    setL(pL);
    const slab = generateSlab(structure, pH, pK, pL, vacuum, layers, centerSlab);
    setBaseStructure(slab);
    setDa(0);
    setDb(0);
    setDc(0);
    isInternalUpdateRef.current = true;
    onStructureChange(slab);
  };

  const handleResetAll = () => {
    if (originalImportedStructure) {
      setBaseStructure(originalImportedStructure);
      setDa(0);
      setDb(0);
      setDc(0);
      setNa(2);
      setNb(2);
      setNc(1);
      isInternalUpdateRef.current = true;
      onStructureChange(originalImportedStructure);
    }
  };

  const totalAtoms = structure.atoms?.length || 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Panel Top Banner */}
      <div className="px-3 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
            <Compass size={16} />
          </div>
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 leading-tight">
              Structure Modelling
            </h2>
            <p className="text-[10px] text-slate-500 font-medium">
              {structure.formula} ({totalAtoms} {totalAtoms === 1 ? 'atom' : 'atoms'})
            </p>
          </div>
        </div>

        {originalImportedStructure && (
          <button
            onClick={handleResetAll}
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md transition-colors"
            title="Revert to original imported structure"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Modelling Sub-Tabs (Translation, Supercell, Slab) */}
      <div className="flex border-b border-slate-200 bg-slate-100/80 p-1 gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('translate')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'translate'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Move size={14} />
          <span>Translate</span>
        </button>

        <button
          onClick={() => setActiveTab('supercell')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'supercell'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Grid3X3 size={14} />
          <span>Supercell</span>
        </button>

        <button
          onClick={() => setActiveTab('slab')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'slab'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Layers size={14} />
          <span>Slab</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* ----------------- TAB 1: TRANSLATION ----------------- */}
        {activeTab === 'translate' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-700 flex items-center gap-1.5">
                  <Sliders size={14} />
                  <span>Translate Along Lattice Vectors</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">Fractional (0.0 to 1.0)</span>
              </div>

              {/* Slider for a-axis */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-rose-600 font-bold font-mono">a-axis (Δa):</span>
                  <span className="font-mono text-slate-700">{da.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.01"
                    value={da}
                    onChange={(e) =>
                      handleTranslateChange(parseFloat(e.target.value), db, dc, wrapAtoms)
                    }
                    className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={da}
                    onChange={(e) =>
                      handleTranslateChange(parseFloat(e.target.value) || 0, db, dc, wrapAtoms)
                    }
                    className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Slider for b-axis */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-600 font-bold font-mono">b-axis (Δb):</span>
                  <span className="font-mono text-slate-700">{db.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.01"
                    value={db}
                    onChange={(e) =>
                      handleTranslateChange(da, parseFloat(e.target.value), dc, wrapAtoms)
                    }
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={db}
                    onChange={(e) =>
                      handleTranslateChange(da, parseFloat(e.target.value) || 0, dc, wrapAtoms)
                    }
                    className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Slider for c-axis */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-sky-600 font-bold font-mono">c-axis (Δc):</span>
                  <span className="font-mono text-slate-700">{dc.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.01"
                    value={dc}
                    onChange={(e) =>
                      handleTranslateChange(da, db, parseFloat(e.target.value), wrapAtoms)
                    }
                    className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={dc}
                    onChange={(e) =>
                      handleTranslateChange(da, db, parseFloat(e.target.value) || 0, wrapAtoms)
                    }
                    className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Wrap Checkbox */}
              <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wrapAtoms}
                  onChange={(e) => handleTranslateChange(da, db, dc, e.target.checked)}
                  className="rounded bg-white border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Wrap translated atoms into cell [0, 1)</span>
              </label>

              {/* Quick Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={handleResetTranslation}
                  className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-colors shadow-xs"
                >
                  Reset Translation
                </button>
                <button
                  onClick={handleCenterStructure}
                  className="flex-1 py-1.5 px-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  <ArrowRightLeft size={12} />
                  <span>Center in Cell</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: SUPERCELL ----------------- */}
        {activeTab === 'supercell' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-700 flex items-center gap-1.5">
                  <Grid3X3 size={14} />
                  <span>Expansion Multipliers</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">
                  Result: {(structure.atoms?.length || 0) * na * nb * nc} atoms
                </span>
              </div>

              {/* Multiplier Inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
                    N_a (a-axis)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={na}
                    onChange={(e) => setNa(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
                    N_b (b-axis)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={nb}
                    onChange={(e) => setNb(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block mb-1">
                    N_c (c-axis)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={nc}
                    onChange={(e) => setNc(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Quick Presets:
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handlePresetSupercell(2, 2, 1)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    2×2×1
                  </button>
                  <button
                    onClick={() => handlePresetSupercell(2, 2, 2)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    2×2×2
                  </button>
                  <button
                    onClick={() => handlePresetSupercell(3, 3, 1)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    3×3×1
                  </button>
                  <button
                    onClick={() => handlePresetSupercell(3, 3, 3)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    3×3×3
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleApplySupercell}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Create {na}×{nb}×{nc} Supercell</span>
              </button>
            </div>
          </div>
        )}

        {/* ----------------- TAB 3: SLAB GENERATION ----------------- */}
        {activeTab === 'slab' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-700 flex items-center gap-1.5">
                  <Layers size={14} />
                  <span>Miller Indices (h, k, l)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">Surface Cut</span>
              </div>

              {/* Miller Index Inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    h
                  </label>
                  <input
                    type="number"
                    value={h}
                    onChange={(e) => setH(parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    k
                  </label>
                  <input
                    type="number"
                    value={k}
                    onChange={(e) => setK(parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center shadow-xs">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    l
                  </label>
                  <input
                    type="number"
                    value={l}
                    onChange={(e) => setL(parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white font-extrabold text-sm text-slate-800 rounded border border-slate-200 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Surface Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Surface Presets:
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handlePresetSlab(0, 0, 1)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    (0 0 1)
                  </button>
                  <button
                    onClick={() => handlePresetSlab(1, 0, 0)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    (1 0 0)
                  </button>
                  <button
                    onClick={() => handlePresetSlab(1, 1, 0)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    (1 1 0)
                  </button>
                  <button
                    onClick={() => handlePresetSlab(1, 1, 1)}
                    className="py-1 bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 border border-slate-200 text-[11px] font-bold rounded transition-colors"
                  >
                    (1 1 1)
                  </button>
                </div>
              </div>

              {/* Vacuum Gap & Layer Repetitions */}
              <div className="space-y-2 pt-1 border-t border-slate-200">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-semibold">Vacuum Gap:</span>
                    <span className="font-mono text-teal-700 font-bold">{vacuum} Å</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={vacuum}
                    onChange={(e) => setVacuum(parseInt(e.target.value) || 0)}
                    className="w-full accent-teal-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-semibold">Slab Layers:</span>
                    <span className="font-mono text-teal-700 font-bold">{layers} {layers === 1 ? 'layer' : 'layers'}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={layers}
                    onChange={(e) => setLayers(parseInt(e.target.value) || 1)}
                    className="w-full accent-teal-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                </div>

                <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={centerSlab}
                    onChange={(e) => setCenterSlab(e.target.checked)}
                    className="rounded bg-white border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Center slab in vacuum space</span>
                </label>
              </div>

              {/* Action Button */}
              <button
                onClick={handleGenerateSlab}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Layers size={14} />
                <span>Generate ({h} {k} {l}) Surface Slab</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModellingPanel;
