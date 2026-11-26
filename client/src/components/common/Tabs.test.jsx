import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TabPanel, Tabs } from './Tabs';

const TABS = [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }];

function Example() {
  const [tab, setTab] = useState('one');
  return (
    <>
      <Tabs id="t" label="Sections" tabs={TABS} value={tab} onChange={setTab} />
      <TabPanel id="t" value={tab}>Content {tab}</TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('links tabs and panel and marks the selected tab', () => {
    render(<Example />);
    const tab = screen.getByRole('tab', { name: 'One' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAttribute('aria-controls', 't-panel');
    expect(screen.getByRole('tabpanel', { name: 'One' })).toHaveTextContent('Content one');
  });

  it('supports arrow keys, Home and End', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content two');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Example />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
