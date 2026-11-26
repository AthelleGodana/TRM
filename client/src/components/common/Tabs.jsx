import { useRef } from 'react';

// Accessible tabs (WAI-ARIA tabs pattern): one Tab stop for the whole tab
// list, arrow keys / Home / End move between tabs and select them.
//
//   <Tabs id="vehicle" label="Vehicle sections" tabs={[{ value, label }]} value={tab} onChange={setTab} />
//   <TabPanel id="vehicle" value={tab}>...content for the selected tab...</TabPanel>
export function Tabs({ id, label, tabs, value, onChange, className = '' }) {
  const refs = useRef([]);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));

  const select = (i) => {
    const next = (i + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    select(moves[e.key]);
  };

  return (
    // The tabs are the focusable parts; the list only handles arrow keys.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div role="tablist" aria-label={label} className={`flex gap-1 border-b border-border overflow-x-auto ${className}`} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
        const active = i === index;
        return (
          <button
            key={t.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.value}`}
            aria-selected={active}
            aria-controls={`${id}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`shrink-0 min-h-11 px-3.5 -mb-px border-b-2 text-sm font-medium transition-colors duration-150 ${
              active ? 'border-primary-600 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, value, children, className = '' }) {
  return (
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg ${className}`}>
      {children}
    </div>
  );
}
