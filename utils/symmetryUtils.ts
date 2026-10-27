
export interface HighSymmetryPoint {
    label: string;
    coords: [number, number, number];
}

export const HIGH_SYMMETRY_POINTS: Record<number, HighSymmetryPoint[]> = {
    // sc
    1: [
        { label: 'Γ', coords: [0, 0, 0] },
        { label: 'X', coords: [0.5, 0, 0] },
        { label: 'M', coords: [0.5, 0.5, 0] },
        { label: 'R', coords: [0.5, 0.5, 0.5] },
    ],
    // fcc
    2: [
        { label: 'Γ', coords: [0, 0, 0] },
        { label: 'X', coords: [0.5, 0, 0.5] },
        { label: 'L', coords: [0.5, 0.5, 0.5] },
        { label: 'W', coords: [0.5, 0.25, 0.75] },
        { label: 'K', coords: [0.375, 0.375, 0.75] },
        { label: 'U', coords: [0.625, 0.25, 0.625] },
    ],
    // bcc
    3: [
        { label: 'Γ', coords: [0, 0, 0] },
        { label: 'H', coords: [0.5, -0.5, 0.5] },
        { label: 'N', coords: [0, 0, 0.5] },
        { label: 'P', coords: [0.25, 0.25, 0.25] },
    ],
    // hex
    4: [
        { label: 'Γ', coords: [0, 0, 0] },
        { label: 'M', coords: [0.5, 0, 0] },
        { label: 'K', coords: [0.3333, 0.3333, 0] },
        { label: 'A', coords: [0, 0, 0.5] },
        { label: 'L', coords: [0.5, 0, 0.5] },
        { label: 'H', coords: [0.3333, 0.3333, 0.5] },
    ],
    // tetragonal P
    6: [
        { label: 'Γ', coords: [0, 0, 0] },
        { label: 'X', coords: [0.5, 0, 0] },
        { label: 'M', coords: [0.5, 0.5, 0] },
        { label: 'Z', coords: [0, 0, 0.5] },
        { label: 'R', coords: [0.5, 0, 0.5] },
        { label: 'A', coords: [0.5, 0.5, 0.5] },
    ],
};

export const SUGGESTED_PATHS: Record<number, string[]> = {
    1: ['Γ-X-M-Γ-R-X', 'Γ-X-M-R-Γ'],
    2: ['Γ-X-W-K-Γ-L-U-W-L-K', 'Γ-X-L-Γ'],
    3: ['Γ-H-N-Γ-P-H', 'Γ-H-N-P-Γ'],
    4: ['Γ-M-K-Γ-A-L-H-A', 'Γ-M-K-Γ'],
    6: ['Γ-X-M-Γ-Z-R-A-Z', 'X-M-A-R'],
};

export function getPointsForPath(ibrav: number, pathStr: string): HighSymmetryPoint[] {
    const points = HIGH_SYMMETRY_POINTS[ibrav] || HIGH_SYMMETRY_POINTS[1]; // Default to sc if unknown
    const labels = pathStr.split('-');
    return labels.map(label => {
        const found = points.find(p => p.label === label);
        return found || { label, coords: [0, 0, 0] };
    });
}
