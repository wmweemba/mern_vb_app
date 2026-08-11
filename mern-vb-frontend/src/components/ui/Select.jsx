import { ChevronDown } from 'lucide-react';

// Canonical dropdown per UI_SPEC.md §6.8 — "Same as input. Arrow indicator: custom
// chevron in --color-text-secondary." A bare <select> renders the OS's own native
// arrows, which is the thing this component exists to prevent. Use this everywhere
// a <select> is needed; don't reach for a raw <select> in new frontend code.
//
// `className` sizes/positions the wrapper (e.g. `flex-1` in a filter row); the
// select itself is always spec height/border/radius/type. `selectClassName` is an
// escape hatch for a genuine one-off need, not a substitute for using the default.
export default function Select({ className = '', selectClassName = '', children, ...props }) {
  return (
    <div className={`relative ${className}`}>
      <select
        className={`h-12 w-full appearance-none border border-border-default rounded-md pl-3.5 pr-10 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selectClassName}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary"
      />
    </div>
  );
}
