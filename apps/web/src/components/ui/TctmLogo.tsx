interface TctmLogoProps {
  size?: number;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

export function TctmLogo({ size = 32 }: TctmLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" role="img" aria-label="TCTM">
      <rect x="1" y="1" width="38" height="38" rx="6" stroke="var(--color-text)" strokeWidth="1.5" fill="none" />
      <text
        x="20"
        y="15"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text)"
        fontFamily={FONT}
        fontSize="14"
        fontWeight="700"
        letterSpacing="0.5"
      >
        TC
      </text>
      <text
        x="20"
        y="28"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text)"
        fontFamily={FONT}
        fontSize="14"
        fontWeight="400"
        letterSpacing="0.5"
      >
        TM
      </text>
    </svg>
  );
}
