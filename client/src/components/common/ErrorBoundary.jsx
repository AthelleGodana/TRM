import { Component, Suspense } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

// Catches render errors so one broken page does not blank the whole app.
// resetKey: change it (e.g. the current path) to clear the error.
// homePath: where "Go to home" leads.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A new deploy replaced the chunk this page needs: a reload fixes it.
    const stale = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message || '');
    return (
      <div role="alert" className="page-narrow py-10">
        <div className="glass-card p-6 flex flex-col items-start gap-3">
          <TriangleAlert size={28} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <h1 className="page-title">{stale ? 'A new version is available' : 'Something went wrong'}</h1>
          <p className="text-sm text-muted-foreground">
            {stale
              ? 'Reload the page to get the latest version of Transtrack.'
              : 'This page could not be shown. Reloading usually fixes it. If it keeps happening, tell your transport office.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              <RotateCcw size={18} aria-hidden="true" /> Reload
            </button>
            {this.props.homePath && <a className="btn-secondary" href={this.props.homePath}>Go to home</a>}
          </div>
        </div>
      </div>
    );
  }
}

// Error boundary plus a loading state for lazily loaded pages.
export function PageBoundary({ resetKey, homePath, children }) {
  return (
    <ErrorBoundary resetKey={resetKey} homePath={homePath}>
      <Suspense fallback={<LoadingSpinner label="Loading page..." />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
