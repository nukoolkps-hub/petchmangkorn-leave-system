/* ─── LoginScreen ─────────────────────────────────────────────
   Beautiful, on-brand login page with:
   - Mukda gold shop branding (diamond, maroon/gold theme)
   - "Login ด้วย LINE" button (LINE green)
   - "Dev Login" button (emulator mode only)
   - Error display with retry
   - Handles LINE callback loading state                     */

import {
  AlertTriangle as IconAlertTriangle,
  Check as IconCheck,
  Database as IconDatabase,
  Shield as IconShield,
  User as IconUser,
  UserCog as IconUserCog,
} from "lucide-react";
import { useState } from "react";
import {
  type DevRole,
  seedLineConfigFromEnv,
  signInWithDevRole,
  startLineLogin,
} from "../../firebase/auth";
import Diamond from "../shared/Diamond";

const _LINE_GREEN = "#06C755";

const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID || "";
const USE_EMULATORS =
  import.meta.env.VITE_USE_EMULATORS === "true" ||
  (import.meta.env.VITE_USE_EMULATORS !== "false" && import.meta.env.DEV);

const DEV_LOGIN_ITEMS = [
  { role: "employee", label: "Employee", icon: IconUser },
  { role: "admin", label: "ADMIN", icon: IconShield },
  { role: "setup", label: "Setup", icon: IconUserCog },
] as const;

interface LoginScreenProps {
  loading?: boolean;
  error?: string | null;
}

export default function LoginScreen({ loading, error }: LoginScreenProps) {
  const [devLoading, setDevLoading] = useState<DevRole | null>(null);
  const [lineConfigLoading, setLineConfigLoading] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error || localError;

  async function handleLineLogin() {
    if (!LINE_CHANNEL_ID) {
      setLocalError("ยังไม่ได้ตั้งค่า VITE_LINE_LOGIN_CHANNEL_ID ใน .env.local");
      return;
    }
    try {
      // state ออกโดย server (prepareLineLogin) เพื่อ CSRF defense ที่แข็งกว่า
      // client-only UUID — ไม่ต้องส่ง state จากตรงนี้
      await startLineLogin({
        channelId: LINE_CHANNEL_ID,
        redirectUri: `${window.location.origin}/callback`,
      });
    } catch (err: unknown) {
      setLocalError((err as Error).message || "ไม่สามารถเปิด LINE Login ได้");
    }
  }

  /* ─── Dev Login (emulator only) ──────────────────────────── */
  async function handleDevLogin(role: DevRole) {
    setDevLoading(role);
    setLocalError(null);
    try {
      await signInWithDevRole(role);
    } catch (err: unknown) {
      console.error("[Dev Login] error:", err);
      setLocalError(`Dev Login ไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setDevLoading(null);
    }
  }

  async function handleSeedLineConfig() {
    setLineConfigLoading(true);
    setLocalError(null);
    setSeedMessage(null);
    try {
      const lineConfig = await seedLineConfigFromEnv();
      if (lineConfig.seededKeys.length === 0) {
        setSeedMessage("ไม่พบ LINE config ใน functions/.env");
        return;
      }
      setSeedMessage(
        `Seed LINE config สำเร็จ (${lineConfig.seededKeys.length} keys)`,
      );
    } catch (err: unknown) {
      console.error("[Seed LINE Config] error:", err);
      setLocalError(`Seed LINE config ไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setLineConfigLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .login-line-btn:hover { background: #05B04C !important; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(6,199,85,0.35) !important; }
        .login-line-btn:active { transform: translateY(0); }
        .login-dev-btn:hover { background: rgba(255,255,255,0.15) !important; }
        .login-seed-btn:hover { background: rgba(232,200,122,0.16) !important; }
      `}</style>

      <div className="fixed inset-0 flex items-center justify-center bg-linear-160 from-maroon-dk via-maroon to-maroon-lt font-sans p-5 overflow-hidden">
        {/* Background mosaic pattern */}
        <svg
          className="absolute top-0 right-0 h-full w-[60%] pointer-events-none opacity-50"
          viewBox="0 0 220 500"
          preserveAspectRatio="xMaxYMid slice"
        >
          <defs>
            <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8C87A" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#C9973A" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="lg2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E8C87A" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#9B3030" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          {[0, 80, 160, 240, 320, 400].map((y) => [
            <polygon
              key={`a${y}`}
              points={`80,${y} 140,${y} 110,${y + 40}`}
              fill="url(#lg1)"
            />,
            <polygon
              key={`b${y}`}
              points={`140,${y} 220,${y} 220,${y + 55} 175,${y + 30}`}
              fill="url(#lg2)"
            />,
            <polygon
              key={`c${y}`}
              points={`110,${y + 40} 175,${y + 30} 160,${y + 75} 95,${y + 70}`}
              fill="url(#lg1)"
            />,
          ])}
        </svg>

        {/* Login card */}
        <div className="relative w-full max-w-[380px] animate-[fadeIn_0.5s_ease-out]">
          {/* Logo & brand */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-linear-135 from-gold to-gold-lt flex items-center justify-center mx-auto mb-4 shadow-[0_8px_32px_rgba(201,151,58,0.31)]">
              <Diamond size={36} color="#5C1212" />
            </div>
            <div className="text-gold-lt font-extrabold text-2xl leading-[1.2] tracking-tight">
              ห้างทองเพชรมังกร
            </div>
            <div className="text-gold-lt/50 text-sm mt-1 tracking-wide">
              ระบบพนักงาน
            </div>
          </div>

          {/* Card */}
          <div className="bg-white/8 backdrop-blur-[20px] rounded-3xl border border-gold-lt/12 px-6 py-8 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="text-center mb-7">
              <div className="text-white font-bold text-lg mb-1.5">
                ยินดีต้อนรับ
              </div>
              <div className="text-gold-lt/55 text-sm leading-normal">
                กรุณาลงชื่อเข้าใช้ด้วยบัญชี LINE ของคุณ
              </div>
            </div>

            {/* Error display */}
            {displayError && (
              <div className="bg-red/12 border border-red/25 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5">
                <IconAlertTriangle
                  size={18}
                  strokeWidth={2.4}
                  className="shrink-0 mt-px text-[#ffaaaa]"
                />
                <div>
                  <div className="text-[#ffaaaa] font-semibold text-sm">
                    เข้าสู่ระบบไม่สำเร็จ
                  </div>
                  <div className="text-[#ff9999] text-sm mt-0.5">
                    {displayError}
                  </div>
                </div>
              </div>
            )}

            {seedMessage && !displayError && (
              <div className="bg-[#1A6B3A20] border border-[#1A6B3A40] rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5">
                <IconCheck
                  size={18}
                  strokeWidth={3}
                  className="shrink-0 mt-px text-[#7EE8B5]"
                />
                <div>
                  <div className="text-[#7EE8B5] font-semibold text-sm">
                    พร้อมใช้งานใน Emulator
                  </div>
                  <div className="text-[#7EE8B5]/80 text-sm mt-0.5">
                    {seedMessage}
                  </div>
                </div>
              </div>
            )}

            {/* Loading state (handling LINE callback) */}
            {loading && (
              <div className="text-center py-5">
                <div className="w-12 h-12 rounded-full bg-linear-135 from-gold to-gold-lt flex items-center justify-center mx-auto mb-3 animate-[pulse_1.5s_ease-in-out_infinite]">
                  <Diamond size={22} color="#5C1212" />
                </div>
                <div className="text-gold-lt text-sm font-semibold">
                  กำลังเข้าสู่ระบบ...
                </div>
                <div className="text-gold-lt/40 text-sm mt-1">รอสักครู่</div>
              </div>
            )}

            {/* Login buttons (only when not loading) */}
            {!loading && (
              <>
                {/* LINE Login button */}
                <button
                  className="login-line-btn w-full p-4 border-none rounded-[14px] text-lg font-bold cursor-pointer font-[inherit] flex items-center justify-center gap-3 transition-all duration-200 mb-3 bg-[#06C755] text-white shadow-[0_6px_20px_rgba(6,199,85,0.25)]"
                  onClick={handleLineLogin}
                >
                  {/* LINE icon */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 2C6.48 2 2 5.73 2 10.25c0 4.07 3.58 7.49 8.42 8.14.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.01.88.55.94-.4 5.08-2.99 6.93-5.12C20.89 13.89 22 12.17 22 10.25 22 5.73 17.52 2 12 2zm-3.37 10.75H6.88a.62.62 0 01-.62-.63V8.38c0-.35.28-.63.63-.63.34 0 .62.28.62.63v3.12h1.13c.34 0 .62.28.62.63 0 .34-.28.62-.63.62zm1.87-.63a.62.62 0 01-1.25 0V8.38a.62.62 0 011.25 0v3.74zm4.13 0c0 .26-.16.5-.4.6a.63.63 0 01-.72-.14l-1.6-2.18v1.72a.62.62 0 01-1.24 0V8.38c0-.26.16-.5.4-.6a.63.63 0 01.72.14l1.6 2.18V8.38a.62.62 0 011.25 0v3.74zm2.87-2.5a.62.62 0 010 1.25h-1.12v.63h1.12a.62.62 0 010 1.25H16.38a.62.62 0 01-.63-.63V8.38c0-.35.28-.63.63-.63H17.5a.62.62 0 010 1.25h-1.12v.62h1.12z" />
                  </svg>
                  Login ด้วย LINE
                </button>

                {/* Dev Login (emulator mode only) */}
                {USE_EMULATORS && (
                  <div className="grid grid-cols-3 gap-2">
                    {DEV_LOGIN_ITEMS.map((item) => {
                      const DevIcon = item.icon;
                      return (
                        <button
                          key={item.role}
                          className={`login-dev-btn min-w-0 w-full p-3 bg-white/8 border border-dashed border-gold-lt/20 rounded-[14px] text-xs font-semibold font-[inherit] flex items-center justify-center gap-1.5 transition-all duration-200 text-gold-lt/55 ${devLoading ? "cursor-wait opacity-60" : "cursor-pointer opacity-100"}`}
                          onClick={() => handleDevLogin(item.role)}
                          disabled={!!devLoading || lineConfigLoading}
                          title={`Login as ${item.label}`}
                        >
                          <DevIcon
                            size={16}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {devLoading === item.role
                              ? "กำลังเข้า..."
                              : item.label}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      className={`login-seed-btn col-span-3 w-full p-3.5 bg-white/6 border border-dashed border-gold-lt/20 rounded-[14px] text-sm font-semibold font-[inherit] flex items-center justify-center gap-2 transition-all duration-200 text-gold-lt/60 ${lineConfigLoading ? "cursor-wait opacity-60" : "cursor-pointer opacity-100"}`}
                      onClick={handleSeedLineConfig}
                      disabled={!!devLoading || lineConfigLoading}
                    >
                      <IconDatabase
                        size={17}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {lineConfigLoading
                        ? "กำลัง seed LINE..."
                        : "Seed LINE Config"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-6 text-gold-lt/25 text-sm">
            Haangpetchthongmukda Co., Ltd
          </div>
        </div>
      </div>
    </>
  );
}
