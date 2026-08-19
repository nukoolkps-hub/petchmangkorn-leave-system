/* ─── AppLogo — โลโก้แอป (ดีไซน์เดียวกับ favicon.svg) ─────────────────
   app-icon: พื้นหลัง maroon มน + รูปคน (พนักงาน) สีทอง + เพชรทองมุม
   ใช้ที่ Sidebar + MobileHeader ให้ตรงกับ favicon/หน้าจอโฮม                */

export default function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ห้างทองเพชรมังกร ระบบการลา"
    >
      <defs>
        <linearGradient id="appLogoBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8E2A2A" />
          <stop offset="1" stopColor="#6E1818" />
        </linearGradient>
        <linearGradient id="appLogoGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E3B45E" />
          <stop offset="1" stopColor="#C9973A" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#appLogoBg)" />
      {/* employee (person) — head + shoulders */}
      <circle cx="32" cy="25" r="8.5" fill="url(#appLogoGold)" />
      <path
        d="M16 51c0-8.8 7.2-15 16-15s16 6.2 16 15v1H16z"
        fill="url(#appLogoGold)"
      />
      {/* diamond accent (brand: เพชรทอง) */}
      <g transform="translate(40.5 9) scale(0.62)">
        <path d="M6 3h12l4 6-10 12L2 9z" fill="#FBE6B8" />
        <path
          d="M2 9h20M6 3l4 6m8-6l-4 6"
          fill="none"
          stroke="#6E1818"
          strokeWidth="1.1"
          opacity=".45"
        />
      </g>
    </svg>
  );
}
