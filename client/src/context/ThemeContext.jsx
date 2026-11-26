import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'tms_theme';

// Storage can be blocked (private browsing, strict privacy settings); the
// theme then just isn't remembered.
function readTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function saveTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* not remembered */ }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = readTheme();
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
