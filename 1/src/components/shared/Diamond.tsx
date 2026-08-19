import { COLORS } from "../../constants";

/* ─── Diamond icon ─────────────────────────────────────────────── */
export default function Diamond({ size = 16, color = COLORS.gold }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M6 3h12l4 6-10 12L2 9z" opacity=".9" />
      <path
        d="M2 9h20M6 3l4 6m8-6l-4 6"
        fill="none"
        stroke={color}
        strokeWidth="1"
        opacity=".4"
      />
    </svg>
  );
}
