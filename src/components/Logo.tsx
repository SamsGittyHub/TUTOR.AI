interface Props {
  size?: number;
  withWordmark?: boolean;
}

/** A stick of chalk mid-stroke. */
export function Logo({ size = 26, withWordmark = true }: Props) {
  return (
    <span className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="chalk-grad" x1="30" y1="4" x2="4" y2="28">
            <stop offset="0%" stopColor="#06b2fc" />
            <stop offset="100%" stopColor="#f653a2" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#chalk-grad)" />
        <path
          d="M8 22c4-9 8-13 15-15"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity=".95"
        />
        <rect
          x="19.5"
          y="4.5"
          width="5"
          height="9"
          rx="2"
          transform="rotate(28 22 9)"
          fill="#fff"
        />
      </svg>
      {withWordmark ? (
        <span className="text-[17px] font-black tracking-tight">Chalk</span>
      ) : null}
    </span>
  );
}
