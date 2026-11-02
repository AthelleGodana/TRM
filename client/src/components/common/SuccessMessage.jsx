import { CircleCheck } from 'lucide-react';

export default function SuccessMessage({ message }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-sm px-3.5 py-2.5 rounded-lg mb-3"
    >
      <CircleCheck size={18} className="shrink-0 mt-px" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
