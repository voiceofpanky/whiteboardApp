import * as React from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'outline';
};

export const Button = ({ variant = 'default', className = '', ...props }: ButtonProps) => {
    const base = 'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors';
    const tone = variant === 'default'
        ? 'bg-black text-white hover:bg-gray-800'
        : 'border border-gray-300 bg-white text-black hover:bg-gray-50';

    return <button className={`${base} ${tone} ${className}`.trim()} {...props} />;
};
