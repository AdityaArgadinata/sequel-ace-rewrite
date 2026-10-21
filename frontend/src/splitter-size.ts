export function clampSize(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function keyboardSize(key: string, axis: 'x' | 'y', value: number, min: number, max: number): number | undefined {
    if (key === 'Home') return min;
    if (key === 'End') return max;
    if (key === (axis === 'x' ? 'ArrowLeft' : 'ArrowUp')) return clampSize(value - 1, min, max);
    if (key === (axis === 'x' ? 'ArrowRight' : 'ArrowDown')) return clampSize(value + 1, min, max);
}

export function pointerSize(value: number, delta: number, extent: number, min: number, max: number): number {
    return extent > 0 ? clampSize(value + delta / extent * 100, min, max) : value;
}
