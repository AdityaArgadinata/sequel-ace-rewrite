import {useRef} from 'react';
import {keyboardSize, pointerSize} from './splitter-size';

type Props = {
    label: string; controls: string; axis: 'x' | 'y'; value: number;
    min: number; max: number; onChange: (value: number) => void;
};

export default function Splitter({label, controls, axis, value, min, max, onChange}: Props) {
    const drag = useRef<{id: number; start: number; value: number; extent: number} | null>(null);
    return <div className={`splitter splitter-${axis}`} role="separator" tabIndex={0}
        aria-label={label} aria-controls={controls} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)}%`}
        onKeyDown={event => {
            const next = keyboardSize(event.key, axis, value, min, max);
            if (next !== undefined) { event.preventDefault(); onChange(next); }
        }}
        onPointerDown={event => {
            if (event.button !== 0) return;
            const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {id: event.pointerId, start: axis === 'x' ? event.clientX : event.clientY, value, extent: axis === 'x' ? bounds.width : bounds.height};
            event.preventDefault();
        }}
        onPointerMove={event => {
            const current = drag.current;
            if (!current || current.id !== event.pointerId) return;
            onChange(pointerSize(current.value, (axis === 'x' ? event.clientX : event.clientY) - current.start, current.extent, min, max));
        }}
        onPointerUp={event => {
            if (drag.current?.id !== event.pointerId) return;
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }} />;
}
