import { StrictMode } from 'react';
import { MotionConfig } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost safety net; pages also have their own boundary. */}
    <ErrorBoundary homePath="/">
      <ThemeProvider>
        {/* Honour the OS "reduce motion" setting for every animation. */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
