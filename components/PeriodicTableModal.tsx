import React, { useState, useMemo } from 'react';
import { X, Search, Sparkles, Grid, LayoutGrid } from 'lucide-react';
import { ELEMENT_COLORS, ELEMENT_MASSES } from '../constants';

export interface ElementData {
  number: number;
  symbol: symbol_string;
  name: string;
  category: 'nonmetal' | 'noble-gas' | 'alkali-metal' | 'alkaline-earth' | 'metalloid' | 'halogen' | 'post-transition' | 'transition-metal' | 'lanthanide' | 'actinide';
  group: number;
  period: number;
}

type symbol_string = string;

export const ELEMENTS: ElementData[] = [
  // Period 1
  { number: 1, symbol: 'H', name: 'Hydrogen', category: 'nonmetal', group: 1, period: 1 },
  { number: 2, symbol: 'He', name: 'Helium', category: 'noble-gas', group: 18, period: 1 },

  // Period 2
  { number: 3, symbol: 'Li', name: 'Lithium', category: 'alkali-metal', group: 1, period: 2 },
  { number: 4, symbol: 'Be', name: 'Beryllium', category: 'alkaline-earth', group: 2, period: 2 },
  { number: 5, symbol: 'B', name: 'Boron', category: 'metalloid', group: 13, period: 2 },
  { number: 6, symbol: 'C', name: 'Carbon', category: 'nonmetal', group: 14, period: 2 },
  { number: 7, symbol: 'N', name: 'Nitrogen', category: 'nonmetal', group: 15, period: 2 },
  { number: 8, symbol: 'O', name: 'Oxygen', category: 'nonmetal', group: 16, period: 2 },
  { number: 9, symbol: 'F', name: 'Fluorine', category: 'halogen', group: 17, period: 2 },
  { number: 10, symbol: 'Ne', name: 'Neon', category: 'noble-gas', group: 18, period: 2 },

  // Period 3
  { number: 11, symbol: 'Na', name: 'Sodium', category: 'alkali-metal', group: 1, period: 3 },
  { number: 12, symbol: 'Mg', name: 'Magnesium', category: 'alkaline-earth', group: 2, period: 3 },
  { number: 13, symbol: 'Al', name: 'Aluminium', category: 'post-transition', group: 13, period: 3 },
  { number: 14, symbol: 'Si', name: 'Silicon', category: 'metalloid', group: 14, period: 3 },
  { number: 15, symbol: 'P', name: 'Phosphorus', category: 'nonmetal', group: 15, period: 3 },
  { number: 16, symbol: 'S', name: 'Sulfur', category: 'nonmetal', group: 16, period: 3 },
  { number: 17, symbol: 'Cl', name: 'Chlorine', category: 'halogen', group: 17, period: 3 },
  { number: 18, symbol: 'Ar', name: 'Argon', category: 'noble-gas', group: 18, period: 3 },

  // Period 4
  { number: 19, symbol: 'K', name: 'Potassium', category: 'alkali-metal', group: 1, period: 4 },
  { number: 20, symbol: 'Ca', name: 'Calcium', category: 'alkaline-earth', group: 2, period: 4 },
  { number: 21, symbol: 'Sc', name: 'Scandium', category: 'transition-metal', group: 3, period: 4 },
  { number: 22, symbol: 'Ti', name: 'Titanium', category: 'transition-metal', group: 4, period: 4 },
  { number: 23, symbol: 'V', name: 'Vanadium', category: 'transition-metal', group: 5, period: 4 },
  { number: 24, symbol: 'Cr', name: 'Chromium', category: 'transition-metal', group: 6, period: 4 },
  { number: 25, symbol: 'Mn', name: 'Manganese', category: 'transition-metal', group: 7, period: 4 },
  { number: 26, symbol: 'Fe', name: 'Iron', category: 'transition-metal', group: 8, period: 4 },
  { number: 27, symbol: 'Co', name: 'Cobalt', category: 'transition-metal', group: 9, period: 4 },
  { number: 28, symbol: 'Ni', name: 'Nickel', category: 'transition-metal', group: 10, period: 4 },
  { number: 29, symbol: 'Cu', name: 'Copper', category: 'transition-metal', group: 11, period: 4 },
  { number: 30, symbol: 'Zn', name: 'Zinc', category: 'transition-metal', group: 12, period: 4 },
  { number: 31, symbol: 'Ga', name: 'Gallium', category: 'post-transition', group: 13, period: 4 },
  { number: 32, symbol: 'Ge', name: 'Germanium', category: 'metalloid', group: 14, period: 4 },
  { number: 33, symbol: 'As', name: 'Arsenic', category: 'metalloid', group: 15, period: 4 },
  { number: 34, symbol: 'Se', name: 'Selenium', category: 'nonmetal', group: 16, period: 4 },
  { number: 35, symbol: 'Br', name: 'Bromine', category: 'halogen', group: 17, period: 4 },
  { number: 36, symbol: 'Kr', name: 'Krypton', category: 'noble-gas', group: 18, period: 4 },

  // Period 5
  { number: 37, symbol: 'Rb', name: 'Rubidium', category: 'alkali-metal', group: 1, period: 5 },
  { number: 38, symbol: 'Sr', name: 'Strontium', category: 'alkaline-earth', group: 2, period: 5 },
  { number: 39, symbol: 'Y', name: 'Yttrium', category: 'transition-metal', group: 3, period: 5 },
  { number: 40, symbol: 'Zr', name: 'Zirconium', category: 'transition-metal', group: 4, period: 5 },
  { number: 41, symbol: 'Nb', name: 'Niobium', category: 'transition-metal', group: 5, period: 5 },
  { number: 42, symbol: 'Mo', name: 'Molybdenum', category: 'transition-metal', group: 6, period: 5 },
  { number: 43, symbol: 'Tc', name: 'Technetium', category: 'transition-metal', group: 7, period: 5 },
  { number: 44, symbol: 'Ru', name: 'Ruthenium', category: 'transition-metal', group: 8, period: 5 },
  { number: 45, symbol: 'Rh', name: 'Rhodium', category: 'transition-metal', group: 9, period: 5 },
  { number: 46, symbol: 'Pd', name: 'Palladium', category: 'transition-metal', group: 10, period: 5 },
  { number: 47, symbol: 'Ag', name: 'Silver', category: 'transition-metal', group: 11, period: 5 },
  { number: 48, symbol: 'Cd', name: 'Cadmium', category: 'transition-metal', group: 12, period: 5 },
  { number: 49, symbol: 'In', name: 'Indium', category: 'post-transition', group: 13, period: 5 },
  { number: 50, symbol: 'Sn', name: 'Tin', category: 'post-transition', group: 14, period: 5 },
  { number: 51, symbol: 'Sb', name: 'Antimony', category: 'metalloid', group: 15, period: 5 },
  { number: 52, symbol: 'Te', name: 'Tellurium', category: 'metalloid', group: 16, period: 5 },
  { number: 53, symbol: 'I', name: 'Iodine', category: 'halogen', group: 17, period: 5 },
  { number: 54, symbol: 'Xe', name: 'Xenon', category: 'noble-gas', group: 18, period: 5 },

  // Period 6
  { number: 55, symbol: 'Cs', name: 'Caesium', category: 'alkali-metal', group: 1, period: 6 },
  { number: 56, symbol: 'Ba', name: 'Barium', category: 'alkaline-earth', group: 2, period: 6 },
  { number: 57, symbol: 'La', name: 'Lanthanum', category: 'lanthanide', group: 3, period: 8 },
  { number: 58, symbol: 'Ce', name: 'Cerium', category: 'lanthanide', group: 3, period: 8 },
  { number: 59, symbol: 'Pr', name: 'Praseodymium', category: 'lanthanide', group: 3, period: 8 },
  { number: 60, symbol: 'Nd', name: 'Neodymium', category: 'lanthanide', group: 3, period: 8 },
  { number: 61, symbol: 'Pm', name: 'Promethium', category: 'lanthanide', group: 3, period: 8 },
  { number: 62, symbol: 'Sm', name: 'Samarium', category: 'lanthanide', group: 3, period: 8 },
  { number: 63, symbol: 'Eu', name: 'Europium', category: 'lanthanide', group: 3, period: 8 },
  { number: 64, symbol: 'Gd', name: 'Gadolinium', category: 'lanthanide', group: 3, period: 8 },
  { number: 65, symbol: 'Tb', name: 'Terbium', category: 'lanthanide', group: 3, period: 8 },
  { number: 66, symbol: 'Dy', name: 'Dysprosium', category: 'lanthanide', group: 3, period: 8 },
  { number: 67, symbol: 'Ho', name: 'Holmium', category: 'lanthanide', group: 3, period: 8 },
  { number: 68, symbol: 'Er', name: 'Erbium', category: 'lanthanide', group: 3, period: 8 },
  { number: 69, symbol: 'Tm', name: 'Thulium', category: 'lanthanide', group: 3, period: 8 },
  { number: 70, symbol: 'Yb', name: 'Ytterbium', category: 'lanthanide', group: 3, period: 8 },
  { number: 71, symbol: 'Lu', name: 'Lutetium', category: 'lanthanide', group: 3, period: 8 },

  { number: 72, symbol: 'Hf', name: 'Hafnium', category: 'transition-metal', group: 4, period: 6 },
  { number: 73, symbol: 'Ta', name: 'Tantalum', category: 'transition-metal', group: 5, period: 6 },
  { number: 74, symbol: 'W', name: 'Tungsten', category: 'transition-metal', group: 6, period: 6 },
  { number: 75, symbol: 'Re', name: 'Rhenium', category: 'transition-metal', group: 7, period: 6 },
  { number: 76, symbol: 'Os', name: 'Osmium', category: 'transition-metal', group: 8, period: 6 },
  { number: 77, symbol: 'Ir', name: 'Iridium', category: 'transition-metal', group: 9, period: 6 },
  { number: 78, symbol: 'Pt', name: 'Platinum', category: 'transition-metal', group: 10, period: 6 },
  { number: 79, symbol: 'Au', name: 'Gold', category: 'transition-metal', group: 11, period: 6 },
  { number: 80, symbol: 'Hg', name: 'Mercury', category: 'transition-metal', group: 12, period: 6 },
  { number: 81, symbol: 'Tl', name: 'Thallium', category: 'post-transition', group: 13, period: 6 },
  { number: 82, symbol: 'Pb', name: 'Lead', category: 'post-transition', group: 14, period: 6 },
  { number: 83, symbol: 'Bi', name: 'Bismuth', category: 'post-transition', group: 15, period: 6 },
  { number: 84, symbol: 'Po', name: 'Polonium', category: 'post-transition', group: 16, period: 6 },
  { number: 85, symbol: 'At', name: 'Astatine', category: 'halogen', group: 17, period: 6 },
  { number: 86, symbol: 'Rn', name: 'Radon', category: 'noble-gas', group: 18, period: 6 },

  // Period 7
  { number: 87, symbol: 'Fr', name: 'Francium', category: 'alkali-metal', group: 1, period: 7 },
  { number: 88, symbol: 'Ra', name: 'Radium', category: 'alkaline-earth', group: 2, period: 7 },
  { number: 89, symbol: 'Ac', name: 'Actinium', category: 'actinide', group: 3, period: 9 },
  { number: 90, symbol: 'Th', name: 'Thorium', category: 'actinide', group: 3, period: 9 },
  { number: 91, symbol: 'Pa', name: 'Protactinium', category: 'actinide', group: 3, period: 9 },
  { number: 92, symbol: 'U', name: 'Uranium', category: 'actinide', group: 3, period: 9 },
  { number: 93, symbol: 'Np', name: 'Neptunium', category: 'actinide', group: 3, period: 9 },
  { number: 94, symbol: 'Pu', name: 'Plutonium', category: 'actinide', group: 3, period: 9 },
  { number: 95, symbol: 'Am', name: 'Americium', category: 'actinide', group: 3, period: 9 },
  { number: 96, symbol: 'Cm', name: 'Curium', category: 'actinide', group: 3, period: 9 },
  { number: 97, symbol: 'Bk', name: 'Berkelium', category: 'actinide', group: 3, period: 9 },
  { number: 98, symbol: 'Cf', name: 'Californium', category: 'actinide', group: 3, period: 9 },
  { number: 99, symbol: 'Es', name: 'Einsteinium', category: 'actinide', group: 3, period: 9 },
  { number: 100, symbol: 'Fm', name: 'Fermium', category: 'actinide', group: 3, period: 9 },
  { number: 101, symbol: 'Md', name: 'Mendelevium', category: 'actinide', group: 3, period: 9 },
  { number: 102, symbol: 'No', name: 'Nobelium', category: 'actinide', group: 3, period: 9 },
  { number: 103, symbol: 'Lr', name: 'Lawrencium', category: 'actinide', group: 3, period: 9 },

  { number: 104, symbol: 'Rf', name: 'Rutherfordium', category: 'transition-metal', group: 4, period: 7 },
  { number: 105, symbol: 'Db', name: 'Dubnium', category: 'transition-metal', group: 5, period: 7 },
  { number: 106, symbol: 'Sg', name: 'Seaborgium', category: 'transition-metal', group: 6, period: 7 },
  { number: 107, symbol: 'Bh', name: 'Bohrium', category: 'transition-metal', group: 7, period: 7 },
  { number: 108, symbol: 'Hs', name: 'Hassium', category: 'transition-metal', group: 8, period: 7 },
  { number: 109, symbol: 'Mt', name: 'Meitnerium', category: 'transition-metal', group: 9, period: 7 },
  { number: 110, symbol: 'Ds', name: 'Darmstadtium', category: 'transition-metal', group: 10, period: 7 },
  { number: 111, symbol: 'Rg', name: 'Roentgenium', category: 'transition-metal', group: 11, period: 7 },
  { number: 112, symbol: 'Cn', name: 'Copernicium', category: 'transition-metal', group: 12, period: 7 },
  { number: 113, symbol: 'Nh', name: 'Nihonium', category: 'post-transition', group: 13, period: 7 },
  { number: 114, symbol: 'Fl', name: 'Flerovium', category: 'post-transition', group: 14, period: 7 },
  { number: 115, symbol: 'Mc', name: 'Moscovium', category: 'post-transition', group: 15, period: 7 },
  { number: 116, symbol: 'Lv', name: 'Livermorium', category: 'post-transition', group: 16, period: 7 },
  { number: 117, symbol: 'Ts', name: 'Tennessine', category: 'halogen', group: 17, period: 7 },
  { number: 118, symbol: 'Og', name: 'Oganesson', category: 'noble-gas', group: 18, period: 7 },
];

const COMMON_ELEMENTS = ['H', 'C', 'N', 'O', 'Si', 'Fe', 'Ti', 'Al', 'Cu', 'Au', 'Li', 'Na', 'K', 'Ca', 'P', 'S', 'Mo', 'Pt'];

const CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  'nonmetal': { label: 'Nonmetal', bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800' },
  'noble-gas': { label: 'Noble Gas', bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800' },
  'alkali-metal': { label: 'Alkali Metal', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-800' },
  'alkaline-earth': { label: 'Alkaline Earth', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800' },
  'metalloid': { label: 'Metalloid', bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-800' },
  'halogen': { label: 'Halogen', bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-800' },
  'post-transition': { label: 'Post-Transition', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800' },
  'transition-metal': { label: 'Transition Metal', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-800' },
  'lanthanide': { label: 'Lanthanide', bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800' },
  'actinide': { label: 'Actinide', bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-300 dark:border-fuchsia-800' },
};

interface PeriodicTableModalProps {
  onClose: () => void;
  onSelect: (symbol: string) => void;
  currentSymbol?: string;
}

export const PeriodicTableModal: React.FC<PeriodicTableModalProps> = ({ onClose, onSelect, currentSymbol }) => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [hoveredElement, setHoveredElement] = useState<ElementData | null>(null);

  const filteredElements = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ELEMENTS;
    return ELEMENTS.filter(el => 
      el.symbol.toLowerCase().includes(q) || 
      el.name.toLowerCase().includes(q) || 
      el.number.toString() === q
    );
  }, [search]);

  const gridMap = useMemo(() => {
    const map = new Map<string, ElementData>();
    ELEMENTS.forEach(el => {
      if (el.period <= 7 && el.category !== 'lanthanide' && el.category !== 'actinide') {
        map.set(`${el.period}-${el.group}`, el);
      }
    });
    return map;
  }, []);

  const lanthanides = useMemo(() => ELEMENTS.filter(e => e.category === 'lanthanide'), []);
  const actinides = useMemo(() => ELEMENTS.filter(e => e.category === 'actinide'), []);

  const handlePick = (symbol: string) => {
    onSelect(symbol);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                Select Element
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentSymbol ? `Replacing ${currentSymbol}` : 'Choose an element from the Periodic Table'}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Common Elements Bar */}
        <div className="px-4 py-2.5 bg-teal-50/60 dark:bg-teal-950/30 border-b border-teal-100 dark:border-teal-900/50 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
          <span className="text-[11px] font-extrabold text-teal-800 dark:text-teal-300 uppercase tracking-wider shrink-0 mr-1">
            Common:
          </span>
          <div className="flex items-center gap-1.5">
            {COMMON_ELEMENTS.map(sym => {
              const isCurrent = currentSymbol === sym;
              const customColor = ELEMENT_COLORS[sym];
              return (
                <button
                  key={sym}
                  onClick={() => handlePick(sym)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm border ${
                    isCurrent 
                      ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-400' 
                      : 'bg-white dark:bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {customColor && (
                    <span className="w-2 h-2 rounded-full ring-1 ring-black/10" style={{ backgroundColor: customColor }} />
                  )}
                  <span>{sym}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & View Switcher */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by symbol or name (e.g. Fe, Silicon, 26)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
              autoFocus
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'grid' || search
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Cards Grid</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table' && !search
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Grid size={14} />
              <span>Table View</span>
            </button>
          </div>
        </div>

        {/* Scrollable Element Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/50">
          {/* If Search Active or Grid Mode Selected */}
          {(search || viewMode === 'grid') ? (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {filteredElements.map(el => {
                const isCurrent = currentSymbol === el.symbol;
                const cat = CATEGORY_STYLES[el.category] || CATEGORY_STYLES['nonmetal'];
                const customColor = ELEMENT_COLORS[el.symbol];
                const mass = ELEMENT_MASSES[el.symbol];

                return (
                  <button
                    key={el.symbol}
                    onClick={() => handlePick(el.symbol)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all hover:scale-105 hover:shadow-lg hover:z-10 group relative ${cat.bg} ${cat.border} ${
                      isCurrent ? 'ring-2 ring-teal-500 ring-offset-2 font-bold shadow-md bg-teal-50 dark:bg-teal-950/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                      <span>#{el.number}</span>
                      {customColor && (
                        <span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: customColor }} />
                      )}
                    </div>

                    <div className="text-xl font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {el.symbol}
                    </div>

                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                      {el.name}
                    </div>

                    {mass && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                        {mass.toFixed(2)} amu
                      </div>
                    )}
                  </button>
                );
              })}

              {filteredElements.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 text-sm font-medium">
                  No elements found matching "{search}"
                </div>
              )}
            </div>
          ) : (
            /* Classic Interactive Periodic Table Grid */
            <div className="space-y-4">
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div className="min-w-[760px] grid grid-cols-18 gap-1">
                  {/* Periods 1 to 7 */}
                  {[1, 2, 3, 4, 5, 6, 7].map(period => (
                    <React.Fragment key={`p-${period}`}>
                      {Array.from({ length: 18 }, (_, i) => {
                        const group = i + 1;
                        const el = gridMap.get(`${period}-${group}`);

                        if (period === 6 && group === 3) {
                          return (
                            <div key="placeholder-la" className="h-11 rounded-lg border border-dashed border-rose-400/40 bg-rose-500/5 flex flex-col items-center justify-center text-[9px] font-bold text-rose-500">
                              <span>57-71</span>
                            </div>
                          );
                        }
                        if (period === 7 && group === 3) {
                          return (
                            <div key="placeholder-ac" className="h-11 rounded-lg border border-dashed border-fuchsia-400/40 bg-fuchsia-500/5 flex flex-col items-center justify-center text-[9px] font-bold text-fuchsia-500">
                              <span>89-103</span>
                            </div>
                          );
                        }

                        if (!el) {
                          return <div key={`empty-${period}-${group}`} className="h-11" />;
                        }

                        const cat = CATEGORY_STYLES[el.category] || CATEGORY_STYLES['nonmetal'];
                        const isCurrent = currentSymbol === el.symbol;
                        const customColor = ELEMENT_COLORS[el.symbol];

                        return (
                          <button
                            key={el.symbol}
                            onClick={() => handlePick(el.symbol)}
                            onMouseEnter={() => setHoveredElement(el)}
                            onMouseLeave={() => setHoveredElement(null)}
                            className={`h-11 p-1 rounded-lg border flex flex-col items-center justify-between transition-all hover:scale-110 hover:z-20 hover:shadow-lg ${cat.bg} ${cat.border} ${
                              isCurrent ? 'ring-2 ring-teal-500 font-bold shadow-md' : ''
                            }`}
                          >
                            <div className="w-full flex items-center justify-between text-[8px] font-mono leading-none text-slate-400">
                              <span>{el.number}</span>
                              {customColor && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: customColor }} />}
                            </div>
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white leading-none">
                              {el.symbol}
                            </span>
                            <span className="text-[7.5px] font-medium text-slate-500 dark:text-slate-400 truncate w-full text-center leading-none">
                              {el.name}
                            </span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                {/* Lanthanide & Actinide Rows */}
                <div className="min-w-[760px] pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="w-20 text-[10px] font-bold text-rose-500 uppercase text-right pr-2 shrink-0">
                      Lanthanides
                    </span>
                    <div className="flex-1 grid grid-cols-15 gap-1">
                      {lanthanides.map(el => {
                        const cat = CATEGORY_STYLES[el.category];
                        const isCurrent = currentSymbol === el.symbol;
                        const customColor = ELEMENT_COLORS[el.symbol];

                        return (
                          <button
                            key={el.symbol}
                            onClick={() => handlePick(el.symbol)}
                            onMouseEnter={() => setHoveredElement(el)}
                            onMouseLeave={() => setHoveredElement(null)}
                            className={`h-11 p-1 rounded-lg border flex flex-col items-center justify-between transition-all hover:scale-110 hover:z-20 hover:shadow-lg ${cat.bg} ${cat.border} ${
                              isCurrent ? 'ring-2 ring-teal-500 font-bold shadow-md' : ''
                            }`}
                          >
                            <div className="w-full flex items-center justify-between text-[8px] font-mono text-slate-400">
                              <span>{el.number}</span>
                              {customColor && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: customColor }} />}
                            </div>
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white leading-none">{el.symbol}</span>
                            <span className="text-[7.5px] font-medium text-slate-500 dark:text-slate-400 truncate w-full text-center leading-none">{el.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="w-20 text-[10px] font-bold text-fuchsia-500 uppercase text-right pr-2 shrink-0">
                      Actinides
                    </span>
                    <div className="flex-1 grid grid-cols-15 gap-1">
                      {actinides.map(el => {
                        const cat = CATEGORY_STYLES[el.category];
                        const isCurrent = currentSymbol === el.symbol;
                        const customColor = ELEMENT_COLORS[el.symbol];

                        return (
                          <button
                            key={el.symbol}
                            onClick={() => handlePick(el.symbol)}
                            onMouseEnter={() => setHoveredElement(el)}
                            onMouseLeave={() => setHoveredElement(null)}
                            className={`h-11 p-1 rounded-lg border flex flex-col items-center justify-between transition-all hover:scale-110 hover:z-20 hover:shadow-lg ${cat.bg} ${cat.border} ${
                              isCurrent ? 'ring-2 ring-teal-500 font-bold shadow-md' : ''
                            }`}
                          >
                            <div className="w-full flex items-center justify-between text-[8px] font-mono text-slate-400">
                              <span>{el.number}</span>
                              {customColor && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: customColor }} />}
                            </div>
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white leading-none">{el.symbol}</span>
                            <span className="text-[7.5px] font-medium text-slate-500 dark:text-slate-400 truncate w-full text-center leading-none">{el.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hover Preview Box */}
              {hoveredElement && (
                <div className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md flex items-center justify-between text-xs animate-in fade-in duration-100">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-black text-teal-600 dark:text-teal-400 font-mono">
                      {hoveredElement.symbol}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        {hoveredElement.name} <span className="text-slate-400 text-xs font-normal">#{hoveredElement.number}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Category: {CATEGORY_STYLES[hoveredElement.category]?.label} | Atomic Mass: {ELEMENT_MASSES[hoveredElement.symbol] ? `${ELEMENT_MASSES[hoveredElement.symbol]} amu` : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePick(hoveredElement.symbol)}
                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-xs shadow-sm"
                  >
                    Select {hoveredElement.symbol}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Click any element card to instantly select.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/80 dark:bg-slate-800 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PeriodicTableModal;
