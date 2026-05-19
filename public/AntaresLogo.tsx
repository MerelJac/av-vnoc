// Logo.tsx
export function Logo({ subtitle = "Call One, Inc" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      {/* Constellation mark */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        className="w-8 h-8 shrink-0"
        aria-hidden="true"
      >
        {/* constellation lines */}
        <line x1="4"  y1="22" x2="16" y2="16" stroke="#7F2020" strokeWidth="1"   opacity="0.7"/>
        <line x1="16" y1="16" x2="27" y2="21" stroke="#7F2020" strokeWidth="1"   opacity="0.7"/>
        <line x1="16" y1="16" x2="19" y2="5"  stroke="#A32D2D" strokeWidth="1.4" opacity="0.9"/>

        {/* outer stars */}
        <circle cx="4"  cy="22" r="1.5" fill="#A32D2D" opacity="0.6"/>
        <circle cx="27" cy="21" r="1.5" fill="#A32D2D" opacity="0.6"/>
        {/* stinger */}
        <circle cx="19" cy="5"  r="2.5" fill="#EF9F27" opacity="0.9"/>
        <circle cx="19" cy="5"  r="1.2" fill="#FCDE5A"/>

        {/* AV_FLOW glow */}
        <circle cx="16" cy="16" r="7"   fill="#E24B4A" opacity="0.15"/>
        <circle cx="16" cy="16" r="4.5" fill="#E24B4A" opacity="0.3"/>
        {/* spike cross */}
        <line x1="16" y1="9"  x2="16" y2="23" stroke="#FCDE5A" strokeWidth="0.8" opacity="0.2"/>
        <line x1="9"  y1="16" x2="23" y2="16" stroke="#FCDE5A" strokeWidth="0.8" opacity="0.2"/>
        {/* core */}
        <circle cx="16" cy="16" r="3.5" fill="#A32D2D"/>
        <circle cx="16" cy="16" r="2.2" fill="#E24B4A"/>
        <circle cx="16" cy="16" r="1.1" fill="#FCDE5A"/>
        <circle cx="16" cy="16" r="0.5" fill="#ffffff" opacity="0.95"/>
      </svg>

      {/* Wordmark */}
      <div>
        <h1 className="font-orbitron font-extrabold text-base text-secondary-color tracking-tight leading-none">
          AV_FLOW
        </h1>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted mt-0.5">
          {subtitle}
        </p>
      </div>
    </div>
  );
}