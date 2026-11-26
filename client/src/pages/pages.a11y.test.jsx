import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import NotFound from './NotFound';
import Privacy from './legal/Privacy';
import { ThemeProvider } from '../context/ThemeContext';

const wrap = (ui) => render(<ThemeProvider><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>);

describe('page accessibility smoke tests', () => {
  it('not-found page', async () => {
    const { container } = wrap(<NotFound standalone />);
    expect(await axe(container)).toHaveNoViolations();
    expect(document.title).toBe('Page not found · Transtrack Kenya');
  });

  it('privacy policy', async () => {
    const { container } = wrap(<Privacy />);
    expect(await axe(container)).toHaveNoViolations();
    expect(document.title).toBe('Privacy policy · Transtrack Kenya');
  });
});
