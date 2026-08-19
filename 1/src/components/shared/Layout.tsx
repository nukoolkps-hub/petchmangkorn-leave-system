/* ─── Layout primitives used by ManualModal etc. ───────────────── */

export function Section({ title, color, children }) {
  return (
    <div className="mt-4 mb-4">
      <div
        className="text-sm font-bold mb-2.5 pl-2.5"
        style={{ color, borderLeft: `3px solid ${color}` }}
      >
        {title}
      </div>
      <div className="pl-[13px]">{children}</div>
    </div>
  );
}

export function Card({ title, color, children }) {
  return (
    <div className="bg-cream rounded-[10px] px-3.5 py-3 mb-2.5 border border-bdr">
      <div className="text-sm font-bold mb-1.5" style={{ color }}>
        {title}
      </div>
      <div className="text-sm text-txt-mid leading-[1.7]">{children}</div>
    </div>
  );
}

export function Box({ bg, border, children }) {
  return (
    <div
      className="rounded-[10px] px-3.5 py-3 mt-3 text-sm text-txt-mid leading-[1.7]"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      {children}
    </div>
  );
}
