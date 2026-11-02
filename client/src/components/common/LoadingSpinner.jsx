export default function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground text-sm">
      <div className="relative w-8 h-8" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-600 animate-spin" />
      </div>
      {label}
    </div>
  );
}
