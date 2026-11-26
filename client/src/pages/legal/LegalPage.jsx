import { Link } from 'react-router-dom';
import Brand from '../../components/layout/Brand';
import ThemeToggle from '../../components/common/ThemeToggle';
import LegalLinks from '../../components/legal/LegalLinks';
import { usePageTitle } from '../../hooks/usePageTitle';

// Shared layout for the public legal pages.
export default function LegalPage({ title, updated, children }) {
  usePageTitle(title);
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16">
        <Link to="/" aria-label="Transtrack Kenya home" className="rounded-lg"><Brand /></Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex-1 px-4 pb-12">
        <article className="mx-auto max-w-2xl glass-card p-6 sm:p-8 legal-prose">
          <h1 className="page-title">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Last updated {updated}</p>
          <p className="mt-4 text-sm rounded-lg px-3.5 py-2.5 bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30">
            Draft for review: have your legal adviser check this page before you go live.
          </p>
          {children}
        </article>
      </main>
      <footer className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
        <LegalLinks className="mx-auto max-w-2xl" />
      </footer>
    </div>
  );
}
