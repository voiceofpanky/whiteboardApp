import * as React from 'react';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', ...props }, ref) => (
        <input
            ref={ref}
            className={`rounded-md border border-gray-300 bg-white px-2 py-1 text-sm ${className}`.trim()}
            {...props}
        />
    )
);

Input.displayName = 'Input';
