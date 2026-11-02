import { BusFront } from 'lucide-react';

// Product mark: a bus icon in a blue tile, with the name beside it.
export default function Brand({ compact = false }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="w-9 h-9 shrink-0 rounded-lg bg-primary-600 text-white flex items-center justify-center" aria-hidden="true">
        <BusFront size={20} strokeWidth={2.25} />
      </span>
      {!compact && <span className="font-bold tracking-tight text-foreground truncate">Transtrack Kenya</span>}
    </span>
  );
}
