export default function ClientLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="page-header">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-bg-tertiary rounded" />
          <div className="h-8 w-48 bg-bg-tertiary rounded" />
          <div className="h-4 w-64 bg-bg-tertiary rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-bg-secondary border border-border-main rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-bg-secondary border border-border-main rounded-lg" />
    </div>
  );
}
