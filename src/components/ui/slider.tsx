import * as React from 'react';

export type SliderProps = {
    min?: number;
    max?: number;
    step?: number;
    value?: number[];
    onValueChange?: (value: number[]) => void;
    className?: string;
};

export const Slider = ({ min = 0, max = 100, step = 1, value = [0], onValueChange, className = '' }: SliderProps) => {
    const currentValue = value[0] ?? min;

    return (
        <input
            type='range'
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={(event) => onValueChange?.([Number(event.target.value)])}
            className={`w-full accent-black ${className}`.trim()}
        />
    );
};
