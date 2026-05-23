export default function Loading() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
