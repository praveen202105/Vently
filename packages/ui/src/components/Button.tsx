'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/30 hover:shadow-xl hover:shadow-secondary/40',
  outline:
    'border-2 border-primary text-primary hover:bg-primary/10 hover:border-primary/70',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
  gradient:
    'bg-gradient-to-r from-gradient-purple via-gradient-pink to-gradient-blue text-white shadow-lg shadow-primary/30 hover:shadow-2xl hover:shadow-primary/50',
};

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  className,
  disabled = false,
  type = 'button',
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-2xl transition-all font-medium flex items-center justify-center gap-2 relative overflow-hidden',
        VARIANTS[variant],
        SIZES[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {!disabled && (
        <motion.div
          initial={{ x: '-100%' }}
          whileHover={{ x: '200%' }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ width: '50%' }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
