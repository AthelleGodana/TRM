export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`skeleton ${width} ${height}`} />;
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <SkeletonLine width="w-1/3" height="h-3" />
      <SkeletonLine width="w-2/3" height="h-5" />
      <SkeletonLine width="w-full" height="h-3" />
    </div>
  );
}
