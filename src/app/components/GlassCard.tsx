import { ReactNode } from "react";
import { motion } from "motion/react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = "", hover = false, onClick }: GlassCardProps) {
  const Component = hover || onClick ? motion.div : "div";

  return (
    <Component
      onClick={onClick}
      whileHover={hover ? { scale: 1.02, y: -2 } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
      className={`bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-xl transition-all ${
        hover ? "hover:border-primary/30 hover:shadow-2xl cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </Component>
  );
}
