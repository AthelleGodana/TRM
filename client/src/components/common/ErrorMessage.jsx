import { CircleAlert } from 'lucide-react';

// Announced to screen readers as soon as it appears.
export default function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300 text-sm px-3.5 py-2.5 rounded-lg mb-3"
    >
      <CircleAlert size={18} className="shrink-0 mt-px" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
