/**
 * The app's loading mark: the AAROMACH screw being driven in — the Phillips
 * slot turns on the head (in perspective) and the threads run down the
 * shank. Brand red, cut-outs in the page colour, so it works in light and
 * dark themes. The startup screen (BootScreen) uses the full badge.
 */
export function ScrewLoader({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 124" width={size} height={size * 1.24} className={className} aria-hidden="true">
      <defs>
        <clipPath id="screw-shank">
          <path d="M41 50 H59 V98 L50 118 L41 98 Z" />
        </clipPath>
      </defs>
      {/* Countersunk head: top face + flare down to the shank. */}
      <path d="M8 24 C 12 34, 36 44, 41 52 L59 52 C 64 44, 88 34, 92 24 Z" fill="rgb(var(--brand-red-rgb))" />
      <ellipse cx="50" cy="24" rx="42" ry="15" fill="rgb(var(--brand-red-rgb))" />
      <ellipse cx="50" cy="24" rx="35" ry="11.5" fill="none" stroke="rgb(var(--bg-primary-rgb, 0 0 0) / 0.25)" strokeWidth="1.5" />
      {/* The turning Phillips slot, squashed to the head's angle. */}
      <g transform="translate(50 24) scale(1 0.36)">
        <g className="screw-slot">
          <rect x="-24" y="-4.5" width="48" height="9" rx="2" fill="var(--bg-primary)" />
          <rect x="-4.5" y="-24" width="9" height="48" rx="2" fill="var(--bg-primary)" />
        </g>
      </g>
      {/* Shank and tip, with threads running down as it drives. */}
      <path d="M41 50 H59 V98 L50 118 L41 98 Z" fill="rgb(var(--brand-red-rgb))" />
      <g clipPath="url(#screw-shank)">
        <g className="screw-threads">
          {Array.from({ length: 12 }).map((_, i) => (
            <path key={i} d={`M36 ${46 + i * 7} L64 ${41 + i * 7}`} stroke="var(--bg-primary)" strokeWidth="2.2" strokeLinecap="round" />
          ))}
        </g>
      </g>
      <style>{`
        .screw-slot { animation: screw-spin 0.9s linear infinite; transform-origin: 0 0; }
        .screw-threads { animation: screw-drive 0.9s linear infinite; }
        @keyframes screw-spin { to { transform: rotate(360deg); } }
        @keyframes screw-drive { from { transform: translateY(-7px); } to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .screw-slot, .screw-threads { animation-duration: 3s; } }
      `}</style>
    </svg>
  );
}
