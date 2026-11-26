import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import ButtonSelect from './ButtonSelect';

const OPTIONS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Bravo' }, { value: 'c', label: 'Charlie' }];

function Controlled({ initial = 'a', onChange, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <ButtonSelect ariaLabel="Letter" options={OPTIONS} value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }} {...props} />
  );
}

describe('ButtonSelect', () => {
  it('is a single Tab stop, on the selected option', async () => {
    render(<><button type="button">before</button><Controlled initial="b" /><button type="button">after</button></>);
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('moves and selects with arrow keys, wrapping around', async () => {
    render(<Controlled />);
    const user = userEvent.setup();
    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Charlie' })).toHaveAttribute('aria-checked', 'true');
  });

  it('with arrowSelects off, arrows only move focus and Enter chooses', async () => {
    const onChange = vi.fn();
    render(<Controlled arrowSelects={false} onChange={onChange} />);
    const user = userEvent.setup();
    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Bravo' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Controlled allowClear />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
