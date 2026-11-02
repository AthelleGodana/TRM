
/**
 * ButtonSelect — a drop-down-free alternative to <select>.
 * Renders a set of selectable pill buttons. One (or optional "none") can be selected.
 *
 * Props:
 * - options: [{ value, label }]
 * - value: current selected value (string) or '' for none
 * - onChange: (value) => void
 * - allowClear: if true, renders a "None / Clear" option at the start
 * - clearLabel: label for the clear option (default "None")
 * - columns: optional grid columns class (default "flex flex-wrap")
 * - size: 'sm' | 'md' (default 'md')
 * - ariaLabel: optional accessibility label
 * - onFocus: invoked when any option button receives focus
 */
export default function ButtonSelect({
  options = [],
  value = '',
  onChange,
  allowClear = false,
  clearLabel = 'None',
  columns,
  size = 'md',
  ariaLabel,
  onFocus,
}) {
  const btnSize =
    size === 'sm'
      ? 'min-h-9 px-3 py-1.5 text-sm'
      : 'min-h-11 px-3.5 py-2 text-sm';

  const container = columns || 'flex flex-wrap gap-2';

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={container}>
      {allowClear && (
        <button
          type="button"
          role="radio"
          aria-checked={value === ''}
          onClick={() => onChange('')}
          onFocus={onFocus}
          className={`${btnSize} rounded-lg font-medium border transition-colors duration-150 ${
            value === ''
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-card border-border text-muted-foreground hover:border-primary-400 hover:text-foreground'
          }`}
        >
          {clearLabel}
        </button>
      )}
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            onFocus={onFocus}
            className={`${btnSize} rounded-lg font-medium border transition-colors duration-150 ${
              active
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-card border-border text-foreground hover:border-primary-400'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
