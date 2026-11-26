import { useRef } from 'react';

/**
 * ButtonSelect: a drop-down-free alternative to <select>, built as an
 * accessible radio group. Tab reaches the group once (on the selected
 * option); arrow keys move and select, as with native radio buttons.
 *
 * Props:
 * - options: [{ value, label }]
 * - value: current selected value (string) or '' for none
 * - onChange: (value) => void
 * - allowClear: if true, renders a "None / Clear" option at the start
 * - clearLabel: label for the clear option (default "None")
 * - columns: optional container classes (default "flex flex-wrap gap-2")
 * - size: 'sm' | 'md' (default 'md')
 * - ariaLabel: accessible name for the group
 * - onFocus: invoked when any option button receives focus
 * - arrowSelects: default true. Set false when choosing saves straight to
 *   the server: arrows then only move focus, and Space/Enter chooses.
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
  arrowSelects = true,
}) {
  const refs = useRef([]);
  const items = allowClear ? [{ value: '', label: clearLabel, clear: true }, ...options] : options;
  const selected = items.findIndex((o) => o.value === value);
  // With nothing selected, the first option takes the Tab stop.
  const tabStop = selected >= 0 ? selected : 0;

  const btnSize = size === 'sm' ? 'min-h-10 px-3 py-1.5 text-sm' : 'min-h-11 px-3.5 py-2 text-sm';
  const container = columns || 'flex flex-wrap gap-2';

  const onKeyDown = (e) => {
    const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const focused = refs.current.indexOf(document.activeElement);
    const from = focused >= 0 ? focused : tabStop;
    let next;
    if (e.key in moves) next = (from + moves[e.key] + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    if (arrowSelects) onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    // The options are the focusable parts; the group only handles arrow keys.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div role="radiogroup" aria-label={ariaLabel} className={container} onKeyDown={onKeyDown}>
      {items.map((opt, i) => {
        const active = i === selected;
        return (
          <button
            key={opt.clear ? '__clear' : opt.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onFocus={onFocus}
            className={`${btnSize} rounded-lg font-medium border transition-colors duration-150 ${
              active
                ? 'bg-primary-600 text-white border-primary-600'
                : `bg-card border-input/60 hover:border-primary-500 ${opt.clear ? 'text-muted-foreground hover:text-foreground' : 'text-foreground'}`
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
