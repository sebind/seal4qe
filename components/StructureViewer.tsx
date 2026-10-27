
import React, { useMemo, useState, useRef } from 'react';
import { Canvas, ThreeEvent, useThree, ThreeElements } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, GizmoHelper, GizmoViewport, Outlines, useGizmoContext } from '@react-three/drei';
import * as THREE from 'three';
import { CrystalStructure, Atom, QEParams } from '../types';
import { ELEMENT_COLORS } from '../constants';
import { getReciprocalLattice, generateKPointGrid } from '../utils/latticeUtils';
import PeriodicTableModal from './PeriodicTableModal';
import { 
  Layers, List, Compass, Sun, Moon, Download, Share2, Circle, Grip, Trash2, 
  RefreshCw, Lock, Unlock, X, Grid3X3, Maximize, ArrowUp, ArrowDown, ArrowLeft, 
  ArrowRight, ZoomIn, ZoomOut, Eye, Sliders, Box, Focus, Palette, RotateCcw, PaintBucket
} from 'lucide-react';

interface StructureViewerProps {
  structure: CrystalStructure | null;
  params?: QEParams;
  onStructureChange: (newStructure: CrystalStructure) => void;
}

// Covalent Radii (in Ångströms) for accurate chemical bond detection
const COVALENT_RADII: Record<string, number> = {
  H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.85, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
  Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
  K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22,
  Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16,
  Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44,
  In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40, Cs: 2.44, Ba: 2.15,
  Pt: 1.36, Au: 1.36, Pb: 1.46, Bi: 1.48,
  default: 1.20
};

// Van der Waals Radii (for space-filling view)
const VDW_RADII: Record<string, number> = {
  H: 1.10, He: 1.40, Li: 1.82, Be: 1.53, B: 1.92, C: 1.70, N: 1.55, O: 1.52, F: 1.47, Ne: 1.54,
  Na: 2.27, Mg: 1.73, Al: 1.84, Si: 2.10, P: 1.80, S: 1.80, Cl: 1.75, Ar: 1.88,
  K: 2.75, Ca: 2.31, Sc: 2.11, Ti: 2.00, V: 2.00, Cr: 2.00, Mn: 2.00, Fe: 2.00, Co: 2.00, Ni: 1.63, Cu: 1.40, Zn: 1.39,
  Ga: 1.87, Ge: 2.11, As: 1.85, Se: 1.90, Br: 1.85, Kr: 2.02,
  Rb: 3.03, Sr: 2.49, Y: 2.00, Zr: 2.00, Nb: 2.00, Mo: 2.00, Tc: 2.00, Ru: 2.00, Rh: 2.00, Pd: 1.63, Ag: 1.72, Cd: 1.58,
  In: 1.93, Sn: 2.17, Sb: 2.06, Te: 2.06, I: 1.98, Xe: 2.16, Cs: 3.43, Ba: 2.68,
  default: 1.5
};

type ViewMode = 'ball-stick' | 'filled' | 'atoms';

interface AtomSphereProps {
  atom: Atom;
  index: number;
  color: string;
  customRadiusScale?: number;
  viewMode: ViewMode;
  isSelected: boolean;
  isFixed: boolean;
  outlineColor: string;
  detail?: number;
  onClick: (e: ThreeEvent<MouseEvent>, index: number) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>, index: number) => void;
}

const AtomSphere: React.FC<AtomSphereProps> = ({ atom, index, color, customRadiusScale = 1.0, viewMode, isSelected, isFixed, outlineColor, detail = 48, onClick, onContextMenu }) => {
  const baseVdw = VDW_RADII[atom.symbol] || VDW_RADII.default;
  const vdwRadius = baseVdw * customRadiusScale;
  let radius = vdwRadius;
  if (viewMode === 'ball-stick') radius = vdwRadius * 0.25;
  else if (viewMode === 'atoms') radius = vdwRadius * 0.4;

  return (
    <group position={[atom.x, atom.y, atom.z]}>
        <mesh onClick={(e) => onClick(e, index)} onContextMenu={(e) => onContextMenu(e, index)} userData={{ isAtom: true }}>
            <sphereGeometry args={[radius, detail, detail]} />
            <meshStandardMaterial 
              color={color} 
              roughness={0.18} 
              metalness={0.1} 
              emissive={isSelected ? "#333" : "#000"} 
            />
            {isSelected && <Outlines thickness={0.05} color={outlineColor} />}
        </mesh>
        {isFixed && (
            <mesh scale={1.1} raycast={() => null}>
                <sphereGeometry args={[radius, Math.max(12, Math.floor(detail / 2)), Math.max(12, Math.floor(detail / 2))]} />
                <meshBasicMaterial color="#ef4444" wireframe transparent opacity={0.8} />
            </mesh>
        )}
    </group>
  );
};

interface BondProps {
  start: [number, number, number];
  end: [number, number, number];
  startColor: string;
  endColor: string;
  radius: number;
}

const Bond: React.FC<BondProps> = ({ start, end, startColor, endColor, radius }) => {
    const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
    const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
    const dist = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec]);
    const mid = useMemo(() => startVec.clone().add(endVec).multiplyScalar(0.5), [startVec, endVec]);
    const dir = useMemo(() => endVec.clone().sub(startVec).normalize(), [startVec, endVec]);
    const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
    const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(up, dir), [up, dir]);

    const isMono = startColor === endColor;

    if (isMono) {
      return (
        <mesh 
          position={[mid.x, mid.y, mid.z]} 
          quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]} 
          raycast={() => null}
        >
            <cylinderGeometry args={[radius, radius, dist, 32]} />
            <meshStandardMaterial color={startColor} roughness={0.2} metalness={0.15} />
        </mesh>
      );
    }

    // Bi-color half-bonds for publication-grade dual atom coloring
    const half1Pos = startVec.clone().add(mid).multiplyScalar(0.5);
    const half2Pos = mid.clone().add(endVec).multiplyScalar(0.5);
    const halfDist = dist / 2;

    return (
      <group>
        <mesh 
          position={[half1Pos.x, half1Pos.y, half1Pos.z]} 
          quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]} 
          raycast={() => null}
        >
            <cylinderGeometry args={[radius, radius, halfDist, 32]} />
            <meshStandardMaterial color={startColor} roughness={0.2} metalness={0.15} />
        </mesh>
        <mesh 
          position={[half2Pos.x, half2Pos.y, half2Pos.z]} 
          quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]} 
          raycast={() => null}
        >
            <cylinderGeometry args={[radius, radius, halfDist, 32]} />
            <meshStandardMaterial color={endColor} roughness={0.2} metalness={0.15} />
        </mesh>
      </group>
    );
};

interface LatticeBoxProps {
  lattice: number[][];
  color: string;
}

const LatticeBox: React.FC<LatticeBoxProps> = ({ lattice, color }) => {
  if (!lattice || lattice.length !== 3) return null;
  const geometry = useMemo(() => {
    try {
        const [a, b, c] = lattice.map(v => new THREE.Vector3(v[0], v[1], v[2]));
        const zero = new THREE.Vector3(0, 0, 0);
        const points = [
            zero, a, zero, b, zero, c,
            a, a.clone().add(b), a, a.clone().add(c),
            b, b.clone().add(a), b, b.clone().add(c),
            c, c.clone().add(a), c, c.clone().add(b),
            a.clone().add(b), a.clone().add(b).add(c),
            a.clone().add(c), a.clone().add(c).add(b),
            b.clone().add(c), b.clone().add(c).add(a),
        ];
        const geo = new THREE.BufferGeometry();
        geo.setFromPoints(points);
        return geo;
    } catch (e) { return new THREE.BufferGeometry(); }
  }, [lattice]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} linewidth={2} transparent opacity={0.5} />
    </lineSegments>
  );
};

const SceneSetup = ({ onCreated }: { onCreated: (state: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }) => void }) => {
    const { gl, scene, camera } = useThree();
    React.useEffect(() => { onCreated({ gl, scene, camera }); }, [gl, scene, camera, onCreated]);
    return null;
}

interface ElementStyleModalProps {
  onClose: () => void;
  uniqueElements: string[];
  atoms: Atom[];
  customColors: Record<string, string>;
  customRadii: Record<string, number>;
  getAtomColor: (symbol: string) => string;
  onColorChange: (symbol: string, color: string) => void;
  onRadiusChange: (symbol: string, radiusScale: number) => void;
  onResetElement: (symbol: string) => void;
  onResetAll: () => void;
  isDarkMode: boolean;
}

const SWATCH_PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', 
  '#0891b2', '#e11d48', '#0284c7', '#475569', '#ca8a04',
  '#ffffff', '#1e293b'
];

const ElementStyleModal: React.FC<ElementStyleModalProps> = ({
  onClose,
  uniqueElements,
  atoms,
  customColors,
  customRadii,
  getAtomColor,
  onColorChange,
  onRadiusChange,
  onResetElement,
  onResetAll,
  isDarkMode,
}) => {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    atoms.forEach(a => { map[a.symbol] = (map[a.symbol] || 0) + 1; });
    return map;
  }, [atoms]);

  return (
    <div 
      className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-md p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all ${
        isDarkMode 
          ? 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-black/70' 
          : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-400/30'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
            <Palette size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold">Element Style & Radii</h3>
            <p className="text-[11px] text-slate-400">Edit colors and sizes for each element</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onResetAll}
            className="text-[11px] font-bold px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition-colors"
            title="Reset all element colors and radii to defaults"
          >
            <RotateCcw size={11} />
            <span>Reset All</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-[340px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
        {uniqueElements.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No elements found in current structure.</p>
        ) : (
          uniqueElements.map(symbol => {
            const currentColor = getAtomColor(symbol);
            const currentScale = customRadii[symbol] ?? 1.0;
            const baseVdw = VDW_RADII[symbol] || VDW_RADII.default;
            const actualRadius = (baseVdw * currentScale).toFixed(2);
            const count = counts[symbol] || 0;
            const isCustomized = !!customColors[symbol] || (customRadii[symbol] !== undefined && customRadii[symbol] !== 1.0);

            return (
              <div 
                key={symbol}
                className={`p-3 rounded-lg border transition-all ${
                  isDarkMode 
                    ? 'bg-slate-800/60 border-slate-700/80' 
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-4 h-4 rounded-full inline-block ring-2 ring-slate-400/30 shadow-sm"
                      style={{ backgroundColor: currentColor }}
                    />
                    <span className="font-mono font-bold text-sm">{symbol}</span>
                    <span className="text-[11px] text-slate-400 font-sans">
                      ({count} {count === 1 ? 'atom' : 'atoms'})
                    </span>
                  </div>

                  {isCustomized && (
                    <button
                      onClick={() => onResetElement(symbol)}
                      className="text-[10px] text-teal-400 hover:underline font-semibold flex items-center gap-0.5"
                    >
                      <RotateCcw size={10} />
                      Reset
                    </button>
                  )}
                </div>

                {/* Color & Radius controls in grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Color Section */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => onColorChange(symbol, e.target.value)}
                        className="w-7 h-7 rounded border-0 p-0 cursor-pointer bg-transparent"
                      />
                      <span className="font-mono text-xs uppercase font-semibold text-slate-400">
                        {currentColor}
                      </span>
                    </div>
                    {/* Swatches */}
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {SWATCH_PALETTE.slice(0, 8).map(hex => (
                        <button
                          key={hex}
                          onClick={() => onColorChange(symbol, hex)}
                          className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-125 transition-transform"
                          style={{ backgroundColor: hex }}
                          title={`Set color ${hex}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Radius Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                      <span>Radius</span>
                      <span className="font-mono font-bold text-teal-400">
                        {currentScale.toFixed(2)}x ({actualRadius} Å)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="2.5"
                      step="0.05"
                      value={currentScale}
                      onChange={(e) => onRadiusChange(symbol, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>0.3x</span>
                      <span>1.0x</span>
                      <span>2.5x</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

interface BgColorModalProps {
  onClose: () => void;
  customBgColor: string | null;
  activeBgColor: string;
  setCustomBgColor: (color: string | null) => void;
  isDarkMode: boolean;
}

const PRESET_BG_COLORS = [
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Soft Gray', hex: '#f8fafc' },
  { name: 'Light Cream', hex: '#fafaf9' },
  { name: 'Warm Off-White', hex: '#f5f5f4' },
  { name: 'Dark Slate', hex: '#0f172a' },
  { name: 'Cool Charcoal', hex: '#1e293b' },
  { name: 'Deep Navy', hex: '#090d16' },
  { name: 'Pitch Black', hex: '#000000' }
];

const BgColorModal: React.FC<BgColorModalProps> = ({
  onClose,
  customBgColor,
  activeBgColor,
  setCustomBgColor,
  isDarkMode,
}) => {
  return (
    <div 
      className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-sm p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all ${
        isDarkMode 
          ? 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-black/70' 
          : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-400/30'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
            <PaintBucket size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold">Canvas Background</h3>
            <p className="text-[11px] text-slate-400">Set canvas background color & theme</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customBgColor && (
            <button
              onClick={() => setCustomBgColor(null)}
              className="text-[11px] font-bold px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition-colors"
              title="Reset background color to default"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {/* Custom Color Selector */}
        <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'}`}>
          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
            Custom Color
          </label>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={activeBgColor}
                onChange={(e) => setCustomBgColor(e.target.value)}
                className="w-8 h-8 rounded-lg border-0 p-0 cursor-pointer bg-transparent shadow-sm"
              />
              <span className="font-mono text-xs font-bold uppercase text-slate-400">
                {activeBgColor}
              </span>
            </div>
            <span 
              className="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-600 shadow-inner" 
              style={{ backgroundColor: activeBgColor }}
            />
          </div>
        </div>

        {/* Presets */}
        <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'}`}>
          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
            Presets
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_BG_COLORS.map((preset) => (
              <button
                key={preset.hex}
                onClick={() => setCustomBgColor(preset.hex)}
                className={`flex flex-col items-center p-1.5 rounded-lg border text-center transition-all hover:scale-105 ${
                  activeBgColor.toLowerCase() === preset.hex.toLowerCase()
                    ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-500/10'
                    : isDarkMode ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <span 
                  className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 shadow-sm mb-1" 
                  style={{ backgroundColor: preset.hex }}
                />
                <span className="text-[9px] font-medium truncate w-full">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PublicationExportModalProps {
  onClose: () => void;
  onExport: (scale: number, bgMode: 'transparent' | 'white' | 'theme') => void;
  formula?: string;
}

const PublicationExportModal: React.FC<PublicationExportModalProps> = ({ onClose, onExport, formula }) => {
  const [scale, setScale] = useState<number>(3); // Default 4K Ultra HD (3x)
  const [bgMode, setBgMode] = useState<'transparent' | 'white' | 'theme'>('transparent');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 max-w-md w-full flex flex-col gap-5 text-slate-800" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download size={20} className="text-teal-600" />
              Publication-Quality Figure Export
            </h3>
            <p className="text-xs text-slate-500 mt-1">Export high-DPI vector-sharp figures formatted for papers and journal manuscripts ({formula || 'Crystal Structure'}).</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Resolution Scale Selection */}
        <div className="space-y-2">
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">Target Resolution</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setScale(1)}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${scale === 1 ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="text-xs font-bold text-slate-900">Standard</span>
              <span className="text-[10px] text-slate-500 font-mono mt-1">1080p (1x)</span>
            </button>
            <button
              type="button"
              onClick={() => setScale(3)}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${scale === 3 ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="text-xs font-bold text-teal-700 flex items-center gap-1">
                4K Ultra HD
              </span>
              <span className="text-[10px] text-slate-500 font-mono mt-1">3840px (3x)</span>
            </button>
            <button
              type="button"
              onClick={() => setScale(5)}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${scale === 5 ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="text-xs font-bold text-slate-900">8K Vector</span>
              <span className="text-[10px] text-slate-500 font-mono mt-1">6400px (5x)</span>
            </button>
          </div>
        </div>

        {/* Background Selection */}
        <div className="space-y-2">
          <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">Background Format</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setBgMode('transparent')}
              className={`p-2.5 rounded-xl border text-center transition-all ${bgMode === 'transparent' ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20 text-teal-900 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="text-xs">Transparent</span>
              <span className="block text-[9px] text-slate-400 mt-0.5">Alpha cutout</span>
            </button>
            <button
              type="button"
              onClick={() => setBgMode('white')}
              className={`p-2.5 rounded-xl border text-center transition-all ${bgMode === 'white' ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20 text-teal-900 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="text-xs">Journal White</span>
              <span className="block text-[9px] text-slate-400 mt-0.5">Paper / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setBgMode('theme')}
              className={`p-2.5 rounded-xl border text-center transition-all ${bgMode === 'theme' ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/20 text-teal-900 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="text-xs">Canvas Theme</span>
              <span className="block text-[9px] text-slate-400 mt-0.5">Dark / Light</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onExport(scale, bgMode)}
            className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-md shadow-teal-600/20 transition-all flex items-center gap-1.5"
          >
            <Download size={14} />
            Download Publication PNG
          </button>
        </div>
      </div>
    </div>
  );
};

interface ArrowGizmoProps {
  labelColor: string;
  labels?: [string, string, string];
  axisColors?: [string, string, string];
  scale?: number;
}

const AxisLabelSprite: React.FC<{
  position: [number, number, number];
  label: string;
  color: string;
  onClick: () => void;
}> = ({ position, label, color, onClick }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(32, 32, 22, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, 32, 33);
    }
    return new THREE.CanvasTexture(canvas);
  }, [color, label]);

  return (
    <sprite 
      position={position} 
      scale={0.38} 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <spriteMaterial map={texture} alphaTest={0.2} toneMapped={false} />
    </sprite>
  );
};

const ArrowGizmo: React.FC<ArrowGizmoProps> = ({
  labels = ['a', 'b', 'c'],
  axisColors = ['#ef4444', '#22c55e', '#3b82f6'],
  scale = 55,
}) => {
  const { tweenCamera } = useGizmoContext();
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);

  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), rot: [0, 0, -Math.PI / 2] as [number, number, number], color: axisColors[0], label: labels[0], index: 0 },
    { dir: new THREE.Vector3(0, 1, 0), rot: [0, 0, 0] as [number, number, number], color: axisColors[1], label: labels[1], index: 1 },
    { dir: new THREE.Vector3(0, 0, 1), rot: [Math.PI / 2, 0, 0] as [number, number, number], color: axisColors[2], label: labels[2], index: 2 },
  ];

  return (
    <group scale={scale}>
      {axes.map(({ dir, rot, color, label, index }) => {
        const isHovered = hoveredAxis === index;
        const shaftLength = 0.65;
        const headLength = 0.35;
        const radius = isHovered ? 0.048 : 0.035;
        const headRadius = isHovered ? 0.13 : 0.095;

        return (
          <group key={label}>
            <group rotation={rot}>
              {/* Shaft Cylinder */}
              <mesh position={[0, shaftLength / 2, 0]}>
                <cylinderGeometry args={[radius, radius, shaftLength, 16]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
              {/* Arrow Head Cone */}
              <mesh 
                position={[0, shaftLength + headLength / 2, 0]}
                onPointerOver={(e) => { e.stopPropagation(); setHoveredAxis(index); }}
                onPointerOut={(e) => { e.stopPropagation(); setHoveredAxis(null); }}
                onClick={(e) => {
                  e.stopPropagation();
                  tweenCamera(dir);
                }}
              >
                <coneGeometry args={[headRadius, headLength, 16]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
            </group>

            {/* Label Sprite at Tip */}
            <AxisLabelSprite 
              position={dir.clone().multiplyScalar(1.22).toArray()} 
              label={label} 
              color={color} 
              onClick={() => tweenCamera(dir)}
            />
          </group>
        );
      })}
      {/* Origin dot */}
      <mesh>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshBasicMaterial color="#94a3b8" toneMapped={false} />
      </mesh>
    </group>
  );
};

interface ContextMenuData {
  x: number;
  y: number;
  index: number;
  symbol: string;
}

const StructureViewer: React.FC<StructureViewerProps> = ({ structure, params, onStructureChange }) => {
  const [showLattice, setShowLattice] = useState(true);
  const [showKPoints, setShowKPoints] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [customBgColor, setCustomBgColor] = useState<string | null>(null);
  const [showBgColorPicker, setShowBgColorPicker] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('ball-stick');
  const [selectedAtomIndex, setSelectedAtomIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [customRadii, setCustomRadii] = useState<Record<string, number>>({});
  const [showElementStyleModal, setShowElementStyleModal] = useState<boolean>(false);
  const [showPeriodicTable, setShowPeriodicTable] = useState(false);
  const [atomToReplaceIndex, setAtomToReplaceIndex] = useState<number | null>(null);
  
  // New Visualization & Control States
  const [bondScale, setBondScale] = useState<number>(1.15); // 1.15x covalent sum prevents spurious bonds
  const [isOrthographic, setIsOrthographic] = useState<boolean>(true);
  const [showNavControls, setShowNavControls] = useState<boolean>(true);
  const [activeAxisView, setActiveAxisView] = useState<'a' | 'b' | 'c' | '3d'>('3d');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  const handleColorChange = (symbol: string, color: string) => {
    setCustomColors(prev => ({ ...prev, [symbol]: color }));
  };

  const handleRadiusChange = (symbol: string, radiusScale: number) => {
    setCustomRadii(prev => ({ ...prev, [symbol]: radiusScale }));
  };

  const handleResetElementStyle = (symbol: string) => {
    setCustomColors(prev => {
      const copy = { ...prev };
      delete copy[symbol];
      return copy;
    });
    setCustomRadii(prev => {
      const copy = { ...prev };
      delete copy[symbol];
      return copy;
    });
  };

  const handleResetAllElementStyles = () => {
    setCustomColors({});
    setCustomRadii({});
  };

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const threeStateRef = useRef<{ gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const activeBgColor = customBgColor || (isDarkMode ? '#0f172a' : '#ffffff');

  const contrastColor = useMemo(() => {
    const hex = activeBgColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#1e293b' : '#f8fafc';
    }
    return isDarkMode ? '#f8fafc' : '#1e293b';
  }, [activeBgColor, isDarkMode]);

  const getAtomColor = (symbol: string) => {
    if (customColors[symbol]) return customColors[symbol];
    if (ELEMENT_COLORS[symbol]) return ELEMENT_COLORS[symbol];
    
    // Fallback: Generate a unique color based on element symbol
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
        hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    const color = "#" + "00000".substring(0, 6 - c.length) + c;
    return color;
  };

  const fixedCenter = useMemo(() => {
    if (structure?.lattice && structure.lattice.length === 3) {
      const [a1, a2, a3] = structure.lattice;
      return [
        (a1[0] + a2[0] + a3[0]) / 2,
        (a1[1] + a2[1] + a3[1]) / 2,
        (a1[2] + a2[2] + a3[2]) / 2,
      ] as [number, number, number];
    }
    if (!structure?.atoms?.length) return [0, 0, 0];
    let x = 0, y = 0, z = 0;
    structure.atoms.forEach(a => { x += a.x; y += a.y; z += a.z; });
    const n = structure.atoms.length;
    return [x/n, y/n, z/n] as [number, number, number];
  }, [structure?.lattice, structure?.atoms?.length]);

  // Compute maximum extent to adjust initial camera zoom dynamically
  const maxExtent = useMemo(() => {
    if (structure?.lattice && structure.lattice.length === 3) {
      const [a1, a2, a3] = structure.lattice;
      const corner = new THREE.Vector3(a1[0] + a2[0] + a3[0], a1[1] + a2[1] + a3[1], a1[2] + a2[2] + a3[2]);
      const center = new THREE.Vector3(a1[0] + a2[0] + a3[0], a1[1] + a2[1] + a3[1], a1[2] + a2[2] + a3[2]).multiplyScalar(0.5);
      return Math.max(5, center.distanceTo(corner));
    }
    if (!structure?.atoms?.length) return 10;
    let maxDistSq = 0;
    const [cx, cy, cz] = fixedCenter;
    structure.atoms.forEach(a => {
      const dSq = (a.x - cx)**2 + (a.y - cy)**2 + (a.z - cz)**2;
      if (dSq > maxDistSq) maxDistSq = dSq;
    });
    return Math.max(5, Math.sqrt(maxDistSq));
  }, [structure?.lattice, structure?.atoms?.length, fixedCenter]);

  const isFirstRenderRef = useRef(true);
  const prevLatticeKeyRef = useRef<string>('');

  // Auto-center camera ONLY when structure/lattice actually changes or on initial mount
  React.useEffect(() => {
    if (!controlsRef.current || !cameraRef.current || !structure) return;

    const currentLatticeKey = structure.lattice 
      ? JSON.stringify(structure.lattice) 
      : `${structure.formula}_${structure.atoms.length}`;

    if (isFirstRenderRef.current || prevLatticeKeyRef.current !== currentLatticeKey) {
      isFirstRenderRef.current = false;
      prevLatticeKeyRef.current = currentLatticeKey;

      controlsRef.current.target.set(fixedCenter[0], fixedCenter[1], fixedCenter[2]);
      const initialZoom = Math.min(80, Math.max(15, 300 / maxExtent));
      if (cameraRef.current.isOrthographicCamera) {
        cameraRef.current.zoom = initialZoom;
      }
      cameraRef.current.updateProjectionMatrix();
      controlsRef.current.update();
    }
  }, [structure, fixedCenter, maxExtent]);

  const uniqueElements = useMemo(() => {
    if (!structure?.atoms) return [];
    return Array.from(new Set(structure.atoms.map(a => a.symbol))).sort();
  }, [structure]);

  const sphereDetail = useMemo(() => {
    const atomCount = structure?.atoms?.length || 0;
    if (atomCount > 300) return 12;
    if (atomCount > 100) return 16;
    return 24;
  }, [structure?.atoms?.length]);

  // Precise bond calculation using Covalent Radii + user bondScale (avoids spurious bonds)
  const bonds = useMemo(() => {
    if (!structure?.atoms || viewMode === 'filled') return [];
    const computedBonds: { start: [number, number, number], end: [number, number, number], startColor: string, endColor: string, radius: number, key: string }[] = [];
    const atoms = structure.atoms;
    const len = atoms.length;

    for (let i = 0; i < len; i++) {
      const a1 = atoms[i];
      const r1 = (COVALENT_RADII[a1.symbol] || COVALENT_RADII.default) * (customRadii[a1.symbol] ?? 1.0);

      for (let j = i + 1; j < len; j++) {
        const a2 = atoms[j];
        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dz = a1.z - a2.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        
        if (distSq > 30) continue; // Quick cull for atoms > 5.5Å apart
        const dist = Math.sqrt(distSq);
        if (dist < 0.4) continue; // Skip overlapping duplicate atoms

        const r2 = (COVALENT_RADII[a2.symbol] || COVALENT_RADII.default) * (customRadii[a2.symbol] ?? 1.0);
        const expectedBond = r1 + r2;
        const cutoff = expectedBond * bondScale; // Scaled threshold to avoid unnecessary bonds
        
        if (dist <= cutoff) {
          const strength = 1 - (dist / cutoff);
          const radius = 0.05 + (0.05 * strength);
          
          computedBonds.push({ 
            start: [a1.x, a1.y, a1.z], 
            end: [a2.x, a2.y, a2.z], 
            startColor: getAtomColor(a1.symbol),
            endColor: getAtomColor(a2.symbol),
            radius: radius,
            key: `${i}-${j}` 
          });
        }
      }
    }
    return computedBonds;
  }, [structure, viewMode, bondScale, customColors, customRadii]);

  // Align camera along crystallographic a, b, or c axis, or 3D isometric
  const alignToAxis = (axis: 'a' | 'b' | 'c' | '3d') => {
    if (!controlsRef.current || !cameraRef.current) return;
    setActiveAxisView(axis);
    
    const [cx, cy, cz] = fixedCenter;
    const dist = maxExtent * 3.5;
    
    let dir = new THREE.Vector3(1, 1, 1).normalize();

    if (structure?.lattice && structure.lattice.length === 3) {
      const [la, lb, lc] = structure.lattice.map(v => new THREE.Vector3(v[0], v[1], v[2]));
      if (axis === 'a') dir = la.clone().normalize();
      else if (axis === 'b') dir = lb.clone().normalize();
      else if (axis === 'c') dir = lc.clone().normalize();
      else dir = la.clone().add(lb).add(lc).normalize();
    } else {
      if (axis === 'a') dir = new THREE.Vector3(1, 0, 0);
      else if (axis === 'b') dir = new THREE.Vector3(0, 1, 0);
      else if (axis === 'c') dir = new THREE.Vector3(0, 0, 1);
      else dir = new THREE.Vector3(1, 1, 1).normalize();
    }

    const newPos = new THREE.Vector3(cx, cy, cz).add(dir.multiplyScalar(dist));
    
    cameraRef.current.position.set(newPos.x, newPos.y, newPos.z);
    controlsRef.current.target.set(cx, cy, cz);
    
    // Choose sensible up vector
    if (axis === 'c') {
      cameraRef.current.up.set(0, 1, 0);
    } else if (axis === 'b') {
      cameraRef.current.up.set(0, 0, 1);
    } else {
      cameraRef.current.up.set(0, 0, 1);
    }

    cameraRef.current.lookAt(cx, cy, cz);
    
    if (cameraRef.current.isOrthographicCamera) {
      cameraRef.current.zoom = Math.min(80, Math.max(15, 300 / maxExtent));
    }
    
    cameraRef.current.updateProjectionMatrix();
    controlsRef.current.update();
  };

  // On-screen Canvas Navigation & Movement Control functions
  const panStructure = (direction: 'up' | 'down' | 'left' | 'right' | 'center') => {
    if (!controlsRef.current || !cameraRef.current) return;
    
    if (direction === 'center') {
      controlsRef.current.target.set(fixedCenter[0], fixedCenter[1], fixedCenter[2]);
      controlsRef.current.update();
      return;
    }

    const step = maxExtent * 0.15;
    const cam = cameraRef.current;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());

    const shift = new THREE.Vector3();
    if (direction === 'left') shift.addScaledVector(right, step);
    if (direction === 'right') shift.addScaledVector(right, -step);
    if (direction === 'up') shift.addScaledVector(up, -step);
    if (direction === 'down') shift.addScaledVector(up, step);

    controlsRef.current.target.add(shift);
    cam.position.add(shift);
    controlsRef.current.update();
  };

  const zoomStructure = (factor: number) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    if (cam.isOrthographicCamera) {
      cam.zoom = Math.max(5, Math.min(300, cam.zoom * factor));
      cam.updateProjectionMatrix();
    } else {
      const target = controlsRef.current.target;
      cam.position.sub(target).multiplyScalar(1 / factor).add(target);
    }
    controlsRef.current.update();
  };

  const rotateStructure = (angleDegreesX: number, angleDegreesY: number) => {
    if (!controlsRef.current || !cameraRef.current) return;
    const radX = (-angleDegreesX * Math.PI) / 180;
    const radY = (-angleDegreesY * Math.PI) / 180;
    
    const cam = cameraRef.current;
    const target = controlsRef.current.target;
    const offset = cam.position.clone().sub(target);

    // Rotate around Y axis (horizontal orbit)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radX);
    
    // Rotate around camera right axis (vertical tilt)
    const right = new THREE.Vector3();
    cam.matrixWorld.extractBasis(right, new THREE.Vector3(), new THREE.Vector3());
    offset.applyAxisAngle(right, radY);

    cam.position.copy(target).add(offset);
    cam.lookAt(target);
    controlsRef.current.update();
  };

  const reciprocalLattice = useMemo(() => {
    if (!structure?.lattice) return null;
    return getReciprocalLattice(structure.lattice);
  }, [structure?.lattice]);

  const kPoints = useMemo(() => {
    if (!reciprocalLattice) return [];
    if (params?.k_points?.type === 'automatic' && params.k_points.values) {
      return generateKPointGrid(reciprocalLattice, params.k_points.values);
    }
    if (params?.k_points?.points) {
      // For crystal/tpiba, we might need to scale by reciprocal lattice if they are fractional
      // But for now let's assume they are in the same units as reciprocal lattice for visualization
      return params.k_points.points.map(p => [p.x, p.y, p.z]);
    }
    return [];
  }, [reciprocalLattice, params?.k_points]);

  const handleAtomClick = (e: ThreeEvent<MouseEvent>, index: number) => { e.stopPropagation(); setSelectedAtomIndex(index); setContextMenu(null); };
  const handleAtomContextMenu = (e: ThreeEvent<MouseEvent>, index: number) => {
    e.stopPropagation(); e.nativeEvent.preventDefault();
    if (!structure?.atoms) return;
    setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, index, symbol: structure.atoms[index].symbol });
    setSelectedAtomIndex(index);
  };
  const handleBackgroundClick = () => { setSelectedAtomIndex(null); setContextMenu(null); };
  const handleDownload = () => {
    setShowExportModal(true);
  };

  const handleExecuteExport = (scale: number, bgMode: 'transparent' | 'white' | 'theme') => {
    if (!threeStateRef.current) return;
    const { gl, scene, camera } = threeStateRef.current;

    const width = gl.domElement.clientWidth;
    const height = gl.domElement.clientHeight;

    const originalPixelRatio = gl.getPixelRatio();
    const originalClearColor = new THREE.Color();
    gl.getClearColor(originalClearColor);
    const originalClearAlpha = gl.getClearAlpha();

    try {
      gl.setPixelRatio(scale);
      gl.setSize(width, height, false);

      if (bgMode === 'transparent') {
        gl.setClearColor(0x000000, 0);
      } else if (bgMode === 'white') {
        gl.setClearColor(0xffffff, 1);
      } else {
        gl.setClearColor(isDarkMode ? 0x1a1c2e : 0xf8fafc, 1);
      }

      gl.render(scene, camera);

      const dataUrl = gl.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      const formulaStr = structure?.formula || 'crystal_structure';
      link.download = `${formulaStr}_publication_${scale}x.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export publication image:', err);
    } finally {
      gl.setPixelRatio(originalPixelRatio);
      gl.setSize(width, height, false);
      gl.setClearColor(originalClearColor, originalClearAlpha);
      gl.render(scene, camera);
    }

    setShowExportModal(false);
  };
  
  const handleResetView = () => {
    alignToAxis('3d');
  };

  const closeMenu = () => setContextMenu(null);
  const handleToggleFix = () => {
     if (!contextMenu || !structure?.atoms) return;
     const newAtoms = [...structure.atoms];
     const atom = newAtoms[contextMenu.index];
     const isFixed = atom.if_pos && atom.if_pos[0] === 0;
     newAtoms[contextMenu.index] = { ...atom, if_pos: isFixed ? undefined : [0, 0, 0] };
     onStructureChange({ ...structure, atoms: newAtoms }); closeMenu();
  };
  const handleDelete = () => { if (!contextMenu || !structure?.atoms) return; const newAtoms = structure.atoms.filter((_, i) => i !== contextMenu.index); onStructureChange({ ...structure, atoms: newAtoms }); setSelectedAtomIndex(null); closeMenu(); };
  const handleReplace = () => { if (!contextMenu || !structure?.atoms) return; setAtomToReplaceIndex(contextMenu.index); setShowPeriodicTable(true); closeMenu(); };
  const handleElementSelect = (newSymbol: string) => {
      if (atomToReplaceIndex === null || !structure?.atoms) return;
      const atom = structure.atoms[atomToReplaceIndex];
      if (newSymbol && newSymbol !== atom.symbol) { const newAtoms = [...structure.atoms]; newAtoms[atomToReplaceIndex] = { ...atom, symbol: newSymbol }; onStructureChange({ ...structure, atoms: newAtoms }); }
      setShowPeriodicTable(false); setAtomToReplaceIndex(null);
  };

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden transition-colors duration-300" style={{ backgroundColor: activeBgColor }}>
      {/* FIXED TOOLBAR - BALANCED DESIGN & PIXEL-PERFECT ALIGNMENT */}
      {structure && (
        <div 
          className={`w-full flex-shrink-0 z-20 border-b border-slate-200 dark:border-slate-800 px-3 py-1.5 transition-colors duration-200 select-none flex items-center justify-between gap-3 ${
            isDarkMode 
              ? 'bg-slate-900/95 text-slate-100 shadow-xs' 
              : 'bg-white/95 text-slate-800 shadow-xs'
          }`}
        >
          {/* Left Side: Structure Title & Atom Info */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse hidden xs:block" />
            <span className="font-mono font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
              {structure.formula || 'Crystal'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono hidden xs:inline">
              {structure.atoms?.length || 0} atoms
            </span>
            {structure.detectedInfo?.bravaisName && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 hidden md:inline truncate max-w-[130px]">
                {structure.detectedInfo.bravaisName}
              </span>
            )}
          </div>

          {/* Right Side: Toolbar tools strictly bounded within the visualization panel */}
          <div className="max-w-full ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs">
            {/* 1. Camera Views / Orientations */}
            <div className={`h-8 flex items-center p-0.5 rounded-lg border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              {(['3d', 'a', 'b', 'c'] as const).map((axis) => (
                <button
                  key={axis}
                  onClick={() => alignToAxis(axis)}
                  className={`w-7 h-7 rounded-md font-mono text-[10px] font-bold flex items-center justify-center transition-all ${
                    activeAxisView === axis 
                      ? 'bg-teal-600 text-white shadow-xs scale-105' 
                      : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title={`Align camera to ${axis.toUpperCase()} view`}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>

            {/* 2. Display Modes */}
            <div className={`h-8 flex items-center p-0.5 rounded-lg border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <button 
                onClick={() => setViewMode('ball-stick')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${viewMode === 'ball-stick' ? 'bg-teal-600 text-white shadow-xs font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Ball & Stick View"
              >
                <Share2 size={13} />
              </button>
              <button 
                onClick={() => setViewMode('filled')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${viewMode === 'filled' ? 'bg-teal-600 text-white shadow-xs font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Space-Filling (Van der Waals) View"
              >
                <Circle size={13} fill={viewMode === 'filled' ? "currentColor" : "none"} />
              </button>
              <button 
                onClick={() => setViewMode('atoms')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${viewMode === 'atoms' ? 'bg-teal-600 text-white shadow-xs font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Atoms Only View"
              >
                <Grip size={13} />
              </button>
            </div>

            {/* 3. Overlays Toggle Group */}
            <div className={`h-8 flex items-center p-0.5 rounded-lg border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <button 
                onClick={() => setShowLattice(!showLattice)} 
                disabled={!structure} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${showLattice ? 'bg-teal-600/20 text-teal-400 font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Toggle Unit Cell Lattice"
              >
                <Layers size={13} />
              </button>
              <button 
                onClick={() => setShowKPoints(!showKPoints)} 
                disabled={!structure || !params} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${showKPoints ? 'bg-teal-600/20 text-teal-400 font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Toggle K-Point Mesh"
              >
                <Grid3X3 size={13} />
              </button>
              <button 
                onClick={() => setShowAxes(!showAxes)} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${showAxes ? 'bg-teal-600/20 text-teal-400 font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Toggle Coordinate Axes"
              >
                <Compass size={13} />
              </button>
              <button 
                onClick={() => setShowLegend(!showLegend)} 
                disabled={!structure} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${showLegend ? 'bg-teal-600/20 text-teal-400 font-bold' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} 
                title="Toggle Element Legend"
              >
                <List size={13} />
              </button>
            </div>

            {/* 4. Projection Mode */}
            <button
              onClick={() => setIsOrthographic(!isOrthographic)}
              className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-all ${
                isOrthographic 
                  ? (isDarkMode ? 'bg-slate-800 text-teal-400 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300') 
                  : (isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100')
              }`}
              title={isOrthographic ? "Switch to Perspective Projection" : "Switch to Orthographic Projection"}
            >
              <Box size={13} className="text-teal-500" />
              <span>{isOrthographic ? "Ortho" : "Persp"}</span>
            </button>

            {/* 5. Zoom, Pan & Recenter */}
            <div className={`h-8 flex items-center p-0.5 rounded-lg border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <button 
                onClick={() => zoomStructure(1.2)} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
              <button 
                onClick={() => zoomStructure(0.8)} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <div className={`h-3.5 w-px mx-0.5 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
              <button 
                onClick={() => panStructure('left')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Pan Left"
              >
                <ArrowLeft size={12} />
              </button>
              <button 
                onClick={() => panStructure('up')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Pan Up"
              >
                <ArrowUp size={12} />
              </button>
              <button 
                onClick={() => panStructure('down')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Pan Down"
              >
                <ArrowDown size={12} />
              </button>
              <button 
                onClick={() => panStructure('right')} 
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200/60 text-slate-600 hover:text-slate-900'}`} 
                title="Pan Right"
              >
                <ArrowRight size={12} />
              </button>
              <button 
                onClick={() => panStructure('center')} 
                className="w-7 h-7 rounded-md flex items-center justify-center text-teal-600 hover:bg-teal-500/10 transition-colors" 
                title="Recenter Camera Target"
              >
                <Focus size={13} />
              </button>
            </div>

            {/* 6. Bond Cutoff Slider */}
            <div className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <Sliders size={12} className="text-slate-400 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Bonds:</span>
              <input 
                type="range" 
                min="0.8" 
                max="1.4" 
                step="0.05"
                value={bondScale}
                onChange={(e) => setBondScale(parseFloat(e.target.value))}
                className="w-14 sm:w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
                title={`Bond Cutoff Scale: ${bondScale.toFixed(2)}x expected covalent bond length.`}
              />
              <span className="text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400 w-7">{bondScale.toFixed(2)}x</span>
            </div>

            {/* 7. Styling, Theme & Actions */}
            <div className="h-8 flex items-center gap-1">
              {/* Element Style & Radius Editor Toggle */}
              <button
                onClick={() => {
                  setShowElementStyleModal(!showElementStyleModal);
                  setShowBgColorPicker(false);
                }}
                disabled={!structure}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                  showElementStyleModal 
                    ? 'bg-teal-600 text-white border-teal-500 shadow-xs font-bold' 
                    : isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Atom Colors & Radii per Element"
              >
                <Palette size={14} className={showElementStyleModal ? "text-white" : "text-teal-500"} />
              </button>

              {/* Background Color Picker Control */}
              <button
                onClick={() => {
                  setShowBgColorPicker(!showBgColorPicker);
                  setShowElementStyleModal(false);
                }}
                className={`w-8 h-8 rounded-lg border relative flex items-center justify-center transition-all ${
                  showBgColorPicker 
                    ? 'bg-teal-600 text-white border-teal-500 shadow-xs font-bold' 
                    : isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Set Canvas Background Color"
              >
                <PaintBucket size={14} className={showBgColorPicker ? "text-white" : "text-teal-500"} />
                <span 
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-white shadow-xs"
                  style={{ backgroundColor: activeBgColor }}
                />
              </button>

              {/* Dark / Light Mode Toggle */}
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`} 
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
              </button>

              {/* Reset View & Recenter */}
              <button 
                onClick={handleResetView} 
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`} 
                title="Reset View & Recenter"
              >
                <RotateCcw size={14} />
              </button>

              {/* Export High-Resolution Figure */}
              <button 
                onClick={handleDownload} 
                className="h-8 flex items-center gap-1.5 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold shadow-xs transition-all hover:scale-[1.02] active:scale-95" 
                title="Export High-Resolution Figure"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D VISUALIZATION CANVAS & OVERLAYS CONTAINER */}
      <div className="flex-1 w-full h-full relative min-h-0 min-w-0 overflow-hidden">
        {!structure && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 text-slate-500">
            <p>Load a structure file (.cif, .xsf, .xyz, .vasp) to visualize</p>
          </div>
        )}

      {/* Top Left Floating Overlays Container (Elements Legend & Selected Atom) */}
      <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2.5 pointer-events-none">
        {structure && showLegend && (uniqueElements.length > 0) && (
          <div className={`p-2.5 rounded-lg border shadow-xl min-w-[110px] max-w-[260px] max-h-[140px] overflow-y-auto pointer-events-auto transition-all ${isDarkMode ? 'bg-slate-900/90 text-slate-100 border-slate-700/80 backdrop-blur-md' : 'bg-white/95 text-slate-800 border-slate-200/90 backdrop-blur-md'}`}>
            <div>
              <h4 className={`text-[10px] font-bold uppercase mb-1.5 tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Elements</h4>
              <div className="flex flex-wrap gap-2 max-w-full">
                {uniqueElements.map(sym => (
                  <div key={sym} className={`flex items-center gap-1.5 text-xs font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    <div className="w-3 h-3 rounded-full shadow-inner ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: getAtomColor(sym) }} />
                    <span className="font-mono">{sym}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {structure?.atoms && selectedAtomIndex !== null && structure.atoms[selectedAtomIndex] && (
          <div className={`p-3 rounded-xl border shadow-xl pointer-events-auto transition-all min-w-[200px] ${isDarkMode ? 'bg-slate-900/95 text-slate-100 border-slate-700/80 backdrop-blur-md' : 'bg-white/95 text-slate-800 border-slate-200/90 backdrop-blur-md'}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-[10px] font-extrabold text-teal-600 dark:text-teal-400 uppercase tracking-wider">Selected Atom</h4>
              <button
                onClick={() => setSelectedAtomIndex(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
                title="Deselect atom"
              >
                <X size={12} />
              </button>
            </div>
            <div className="font-mono text-sm">
              <div className="flex items-center gap-2 font-bold">
                <span
                  className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
                  style={{ backgroundColor: getAtomColor(structure.atoms[selectedAtomIndex].symbol) }}
                />
                <span>{structure.atoms[selectedAtomIndex].symbol}</span>
                <span className="text-xs text-slate-400 font-normal">#{selectedAtomIndex + 1}</span>
                {structure.atoms[selectedAtomIndex].if_pos?.[0] === 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 font-bold uppercase">Fixed</span>
                )}
              </div>
              <div className={`text-xs mt-1.5 space-y-0.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                <div>x: {structure.atoms[selectedAtomIndex].x.toFixed(5)} Å</div>
                <div>y: {structure.atoms[selectedAtomIndex].y.toFixed(5)} Å</div>
                <div>z: {structure.atoms[selectedAtomIndex].z.toFixed(5)} Å</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-700/70">
              <button
                onClick={() => {
                  const newAtoms = [...structure.atoms];
                  const atom = newAtoms[selectedAtomIndex];
                  const isFixed = atom.if_pos && atom.if_pos[0] === 0;
                  newAtoms[selectedAtomIndex] = { ...atom, if_pos: isFixed ? undefined : [0, 0, 0] };
                  onStructureChange({ ...structure, atoms: newAtoms });
                }}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                }`}
                title="Fix or unfix atomic coordinates in relaxation"
              >
                {structure.atoms[selectedAtomIndex].if_pos?.[0] === 0 ? <Unlock size={11} className="text-teal-500" /> : <Lock size={11} className="text-teal-500" />}
                <span>{structure.atoms[selectedAtomIndex].if_pos?.[0] === 0 ? 'Unfix' : 'Fix'}</span>
              </button>
              <button
                onClick={() => {
                  setAtomToReplaceIndex(selectedAtomIndex);
                  setShowPeriodicTable(true);
                }}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                }`}
                title="Replace element via Periodic Table"
              >
                <RefreshCw size={11} className="text-emerald-500" />
                <span>Replace</span>
              </button>
              <button
                onClick={() => {
                  const newAtoms = structure.atoms.filter((_, i) => i !== selectedAtomIndex);
                  onStructureChange({ ...structure, atoms: newAtoms });
                  setSelectedAtomIndex(null);
                }}
                className="flex items-center justify-center p-1 rounded-md text-[10px] font-bold border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                title="Delete this atom"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
            <div className="fixed z-50 bg-primary border border-primary-light/40 rounded-lg shadow-xl p-1 min-w-[160px]" style={{ left: Math.min(contextMenu.x, window.innerWidth - 170), top: Math.min(contextMenu.y, window.innerHeight - 150) }}>
                <button onClick={handleToggleFix} className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-slate-800 font-medium hover:bg-primary-dark rounded">
                    {structure?.atoms?.[contextMenu.index]?.if_pos?.[0] === 0 ? <Unlock size={14} className="text-secondary" /> : <Lock size={14} className="text-secondary" />}
                    <span>{structure?.atoms?.[contextMenu.index]?.if_pos?.[0] === 0 ? "Unfix" : "Fix Position"}</span>
                </button>
                <button onClick={handleReplace} className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-slate-800 font-medium hover:bg-primary-dark rounded"><RefreshCw size={14} className="text-green-600" /><span>Replace</span></button>
                <button onClick={handleDelete} className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 font-medium hover:bg-red-50 rounded"><Trash2 size={14}/><span>Delete</span></button>
            </div>
        </>
      )}

      {showElementStyleModal && (
        <ElementStyleModal
          onClose={() => setShowElementStyleModal(false)}
          uniqueElements={uniqueElements}
          atoms={structure?.atoms || []}
          customColors={customColors}
          customRadii={customRadii}
          getAtomColor={getAtomColor}
          onColorChange={handleColorChange}
          onRadiusChange={handleRadiusChange}
          onResetElement={handleResetElementStyle}
          onResetAll={handleResetAllElementStyles}
          isDarkMode={isDarkMode}
        />
      )}

      {showBgColorPicker && (
        <BgColorModal
          onClose={() => setShowBgColorPicker(false)}
          customBgColor={customBgColor}
          activeBgColor={activeBgColor}
          setCustomBgColor={setCustomBgColor}
          isDarkMode={isDarkMode}
        />
      )}

      {showPeriodicTable && (
        <PeriodicTableModal 
          onClose={() => setShowPeriodicTable(false)} 
          onSelect={handleElementSelect} 
          currentSymbol={atomToReplaceIndex !== null && structure?.atoms?.[atomToReplaceIndex] ? structure.atoms[atomToReplaceIndex].symbol : undefined}
        />
      )}
      {showExportModal && <PublicationExportModal onClose={() => setShowExportModal(false)} onExport={handleExecuteExport} formula={structure?.formula} />}

      <Canvas shadows onPointerMissed={handleBackgroundClick} gl={{ preserveDrawingBuffer: true, alpha: true }}>
        <SceneSetup onCreated={(state) => { threeStateRef.current = state; glRef.current = state.gl; }} />
        {isOrthographic ? (
          <OrthographicCamera ref={cameraRef} makeDefault position={[10, 10, 10]} zoom={40} />
        ) : (
          <PerspectiveCamera ref={cameraRef} makeDefault position={[10, 10, 10]} fov={50} />
        )}
        <OrbitControls ref={controlsRef} target={[fixedCenter[0], fixedCenter[1], fixedCenter[2]]} makeDefault enablePan={true} />
        <ambientLight intensity={0.5} />
        <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#333333" />
        <directionalLight position={[15, 20, 15]} intensity={1.1} castShadow />
        <directionalLight position={[-15, -10, -15]} intensity={0.4} />
        <pointLight position={[0, 15, 10]} intensity={0.3} />
        {structure?.atoms && (
          <group>
              {structure.atoms.map((atom, i) => (
                <AtomSphere 
                  key={`${atom.symbol}-${i}`} 
                  atom={atom} 
                  index={i} 
                  color={getAtomColor(atom.symbol)} 
                  customRadiusScale={customRadii[atom.symbol] ?? 1.0}
                  viewMode={viewMode} 
                  isSelected={i === selectedAtomIndex} 
                  isFixed={!!(atom.if_pos && atom.if_pos[0] === 0)} 
                  outlineColor={contrastColor} 
                  detail={sphereDetail} 
                  onClick={handleAtomClick} 
                  onContextMenu={handleAtomContextMenu} 
                />
              ))}
              {bonds.map((bond) => <Bond key={bond.key} start={bond.start} end={bond.end} startColor={bond.startColor} endColor={bond.endColor} radius={bond.radius} />)}
              {showLattice && structure.lattice && <LatticeBox lattice={structure.lattice} color={contrastColor} />}
              
              {showKPoints && kPoints.length > 0 && (
                <group>
                  {kPoints.map((kp, i) => (
                    <mesh key={`kp-${i}`} position={[kp[0], kp[1], kp[2]]}>
                      <sphereGeometry args={[0.05, 12, 12]} />
                      <meshBasicMaterial color="#308695" transparent opacity={0.8} />
                    </mesh>
                  ))}
                  {reciprocalLattice && <LatticeBox lattice={reciprocalLattice} color="#308695" />}
                </group>
              )}
          </group>
        )}
        {showAxes && (
            <GizmoHelper alignment="bottom-right" margin={[75, 75]}>
                <ArrowGizmo labelColor={contrastColor} labels={['a', 'b', 'c']} scale={55} />
            </GizmoHelper>
        )}
      </Canvas>
      </div>
    </div>
  );
};

export default StructureViewer;
