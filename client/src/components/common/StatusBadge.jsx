const VARIANTS = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

export default function StatusBadge({ children, variant = 'neutral', dot = false }) {
  return (
    <span className={VARIANTS[variant] || VARIANTS.neutral}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
