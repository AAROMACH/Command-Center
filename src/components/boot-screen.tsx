'use client';

/**
 * Startup screen: the AAROMACH badge with its screw being driven in — the
 * Phillips slot spins (drawn in perspective on the screw head), the badge
 * gives a small "bite" on each turn, and metal chips flick off the tip.
 * The logo art is public/aaromach-logo.webp; the animated parts are an SVG
 * laid exactly over it (same 1024×1024 grid). Honors reduced motion.
 */
export function BootScreen({ label = 'Starting up…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6" style={{ background: '#070707' /* the logo's own black, in any theme */ }} role="status" aria-live="polite" aria-label={label}>
      <div className="boot-badge relative w-[min(72vw,340px)] aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aaromach-logo.webp" alt="AAROMACH" className="absolute inset-0 h-full w-full select-none" draggable={false} />
        <svg viewBox="0 0 1024 1024" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* Paint over the printed slot, then draw one that turns. */}
          <ellipse cx="514" cy="342" rx="96" ry="44" fill="rgb(221,54,58)" />
          <g transform="translate(514 342) scale(1 0.42)">
            <g className="boot-slot">
              <rect x="-84" y="-13" width="168" height="26" rx="4" fill="#070707" />
              <rect x="-13" y="-84" width="26" height="168" rx="4" fill="#070707" />
            </g>
          </g>
          {/* Chips flicking off the tip as it bites. */}
          {[0, 1, 2, 3].map(i => (
            <circle key={i} className={`boot-chip boot-chip-${i}`} cx="512" cy="905" r="5" fill="rgb(221,54,58)" />
          ))}
        </svg>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="boot-bar h-full w-1/3 rounded-full bg-[rgb(221,54,58)]" />
      </div>
      <p className="text-[12px] tracking-[0.2em] uppercase text-white/50">{label}</p>
      <style>{`
        .boot-slot { animation: boot-spin 0.9s linear infinite; transform-origin: 0 0; }
        @keyframes boot-spin { to { transform: rotate(360deg); } }
        .boot-badge { animation: boot-bite 0.9s ease-in-out infinite; }
        @keyframes boot-bite { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(1.5px); } 55% { transform: translateY(0.5px) rotate(0.15deg); } }
        .boot-chip { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .boot-chip-0 { animation: boot-chip-a 0.9s ease-out infinite; }
        .boot-chip-1 { animation: boot-chip-b 0.9s ease-out 0.22s infinite; }
        .boot-chip-2 { animation: boot-chip-a 0.9s ease-out 0.45s infinite reverse; }
        .boot-chip-3 { animation: boot-chip-b 0.9s ease-out 0.67s infinite; }
        @keyframes boot-chip-a { 0% { opacity: 0; transform: translate(0,0) scale(1); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-46px,-28px) scale(0.4); } }
        @keyframes boot-chip-b { 0% { opacity: 0; transform: translate(0,0) scale(1); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(48px,-24px) scale(0.4); } }
        .boot-bar { animation: boot-bar 1.4s ease-in-out infinite; }
        @keyframes boot-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        @media (prefers-reduced-motion: reduce) {
          .boot-slot, .boot-badge, .boot-chip, .boot-bar { animation-duration: 3s; }
          .boot-chip, .boot-badge { animation: none; }
        }
      `}</style>
    </div>
  );
}
