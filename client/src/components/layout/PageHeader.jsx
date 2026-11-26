import { usePageTitle } from '../../hooks/usePageTitle';

// Page title row: the page's single <h1>, an optional subtitle and actions.
// Also sets the browser tab title (docTitle overrides it, e.g. when the h1
// is a record name).
export default function PageHeader({ title, subtitle, docTitle, children }) {
  usePageTitle(docTitle || (typeof title === 'string' ? title : undefined));
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
