// Brand artwork for the AI & BI Lab: original inline SVGs (no external images).

export const LAB_NAME = 'Artificial Intelligence & Business Intelligence Lab'

/** Small square logo: neural-network nodes (AI) over rising bars (BI). */
export function LabLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lab-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#lab-logo-bg)" />
      <g fill="#ffffff" opacity="0.35">
        <rect x="10" y="30" width="6" height="10" rx="1.5" />
        <rect x="21" y="24" width="6" height="16" rx="1.5" />
        <rect x="32" y="18" width="6" height="22" rx="1.5" />
      </g>
      <g stroke="#ffffff" strokeWidth="1.6" opacity="0.9">
        <line x1="13" y1="14" x2="24" y2="10" />
        <line x1="13" y1="14" x2="24" y2="20" />
        <line x1="24" y1="10" x2="35" y2="14" />
        <line x1="24" y1="20" x2="35" y2="14" />
        <line x1="13" y1="14" x2="13" y2="24" />
        <line x1="35" y1="14" x2="35" y2="24" />
      </g>
      <g fill="#ffffff">
        <circle cx="13" cy="14" r="3" />
        <circle cx="24" cy="10" r="3" />
        <circle cx="24" cy="20" r="3" />
        <circle cx="35" cy="14" r="3" />
        <circle cx="13" cy="24" r="2.2" />
        <circle cx="35" cy="24" r="2.2" />
      </g>
    </svg>
  )
}

/** Wide decorative illustration: a calendar card, a chart and a network, for banners. */
export function HeroArt({ className = 'h-32 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hero-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef2ff" />
        </linearGradient>
        <linearGradient id="hero-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="260" cy="40" r="46" fill="#a5f3fc" opacity="0.45" />
      <circle cx="60" cy="150" r="40" fill="#c7d2fe" opacity="0.5" />
      <g transform="translate(40 28)">
        <rect width="150" height="118" rx="14" fill="url(#hero-card)" stroke="#c7d2fe" />
        <rect width="150" height="30" rx="14" fill="#6366f1" />
        <rect y="16" width="150" height="14" fill="#6366f1" />
        <circle cx="30" cy="8" r="4" fill="#e0e7ff" />
        <circle cx="120" cy="8" r="4" fill="#e0e7ff" />
        <g fill="#e0e7ff">
          {[0, 1, 2, 3, 4].map((c) =>
            [0, 1, 2].map((r) => <rect key={`${c}-${r}`} x={14 + c * 26} y={42 + r * 24} width="18" height="16" rx="4" />),
          )}
        </g>
        <rect x="40" y="42" width="18" height="16" rx="4" fill="#34d399" />
        <rect x="92" y="66" width="18" height="16" rx="4" fill="#fbbf24" />
        <rect x="14" y="90" width="18" height="16" rx="4" fill="#22d3ee" />
        <text x="101" y="78" fontSize="11" textAnchor="middle" fill="#ffffff">★</text>
      </g>
      <g transform="translate(206 86)">
        <rect width="84" height="70" rx="12" fill="#ffffff" stroke="#bae6fd" />
        <rect x="14" y="40" width="12" height="20" rx="3" fill="url(#hero-bar)" />
        <rect x="36" y="28" width="12" height="32" rx="3" fill="url(#hero-bar)" />
        <rect x="58" y="14" width="12" height="46" rx="3" fill="url(#hero-bar)" />
        <polyline points="20,34 42,22 64,10" fill="none" stroke="#f472b6" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g stroke="#818cf8" strokeWidth="1.5">
        <line x1="222" y1="40" x2="250" y2="26" />
        <line x1="222" y1="40" x2="252" y2="56" />
        <line x1="250" y1="26" x2="282" y2="40" />
        <line x1="252" y1="56" x2="282" y2="40" />
      </g>
      <g fill="#6366f1">
        <circle cx="222" cy="40" r="6" />
        <circle cx="250" cy="26" r="5" fill="#06b6d4" />
        <circle cx="252" cy="56" r="5" fill="#06b6d4" />
        <circle cx="282" cy="40" r="6" />
      </g>
    </svg>
  )
}
