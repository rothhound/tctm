/** Small count pill for nav items — "new since you last looked" per bucket. Renders nothing at 0. */
export function NavBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-semibold leading-none ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
