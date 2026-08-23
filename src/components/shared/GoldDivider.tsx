import Diamond from "./Diamond";

/* ─── Decorative gold divider ──────────────────────────────────── */
export default function GoldDivider() {
  return (
    <div className="flex items-center gap-2 my-1.5 mb-5">
      <div className="flex-1 h-px bg-linear-to-r from-transparent to-gold/30" />
      <Diamond size={10} />
      <div className="flex-1 h-px bg-linear-to-l from-transparent to-gold/30" />
    </div>
  );
}
