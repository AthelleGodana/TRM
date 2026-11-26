import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDialog } from './useDialog';

function Dialog({ open, onClose, onMenuLink }) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label="Example" tabIndex={-1}>
      <button type="button">First</button>
      {/* Like a menu link: moves focus to <main>, then the menu closes. */}
      <button type="button" onClick={onMenuLink}>Menu link</button>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  const mainRef = useRef(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <main ref={mainRef} tabIndex={-1}>main</main>
      <Dialog open={open} onClose={() => setOpen(false)} onMenuLink={() => { mainRef.current.focus(); setOpen(false); }} />
    </>
  );
}

describe('useDialog', () => {
  it('moves focus in, traps Tab, and returns focus on Escape', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('leaves focus where it was moved on purpose (e.g. <main> after navigating)', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    act(() => { screen.getByRole('button', { name: 'Menu link' }).click(); });
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
