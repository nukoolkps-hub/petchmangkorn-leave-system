/* ─── BootLoadingScreen — loading screen เดียวกันทั้งระบบ ──────────
   ใช้ตอน Firebase auth check (AuthGate) + ตอน subscribe employees (App)
   - maroon bg + gold progress bar + percentage
   - asymptotic progress (ไม่มี progress จริง — fake ที่ค่อยขึ้น)
     · phase 1: 0% → ~95% เร็ว (รู้สึกมี progress)
     · phase 2: 95% → ~99% ช้าๆ (กัน "ค้างที่ 95%")
   - หลัง 8s แสดงปุ่ม "ลองใหม่" ให้ user กดเอง
   - หลัง 10s auto-reload 1 ครั้งต่อ session (กัน Firebase handshake stuck)
   - reload ครั้งที่ 2 แล้วยังค้าง → แสดงคำแนะนำ + ปุ่ม "ล้าง cache + เข้าใหม่"

   ⚠️ `autoReload={false}` เมื่อมีงานที่ "reload แล้วพัง" ค้างอยู่ —
   โดยเฉพาะตอนแลก code ของ LINE Login (code/state ใช้ได้ครั้งเดียว
   reload กลางคันแล้วเข้าไม่ได้เลย ต้องล็อกอินใหม่) */

import { useEffect, useState } from "react";
import Diamond from "./Diamond";

interface Props {
  /** ข้อความใต้ diamond — เช่น "กำลังเข้าสู่ระบบ..." / "เชื่อมต่อ Firebase..." */
  message?: string;
  /** false = ห้าม reload อัตโนมัติ (มีงานที่ reload แล้วพังค้างอยู่)
   *  ปุ่ม "ลองใหม่" ยังโผล่ให้ user ตัดสินใจเองได้ */
  autoReload?: boolean;
}

const RELOAD_KEY = "boot-auto-reloaded";

/** ล้าง flag auto-reload — เรียกเมื่อแอป "บูตสำเร็จจริง" เท่านั้น
 *
 *  ห้ามล้างใน cleanup ของ BootLoadingScreen เพราะ boot ปกติมีหน้า loading
 *  2 จอต่อกัน (AuthGate → App) · จอแรก unmount จะไปล้าง flag ทิ้ง ทำให้จอที่
 *  สองตั้ง timer แล้ว reload ได้อีก → เน็ตช้า ๆ จะ reload วนไม่จบ */
export function clearBootReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // sessionStorage ปิดอยู่ (private mode บางเบราว์เซอร์) — ข้ามไป
  }
}

function hardReload() {
  // ล้าง Cache Storage + Service Worker → กัน cache เก่าค้าง
  // (ทำ best-effort · ถ้า fail ก็ reload ปกติต่อ)
  try {
    if ("caches" in window) {
      caches.keys().then((keys) => {
        for (const k of keys) caches.delete(k);
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
    }
  } catch {
    // ignore
  }
  sessionStorage.removeItem(RELOAD_KEY);
  // bust URL cache ด้วย query param + force reload
  const url = new URL(window.location.href);
  url.searchParams.set("_t", String(Date.now()));
  window.location.replace(url.toString());
}

function readReloadGuard(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function BootLoadingScreen({
  message = "กำลังโหลด...",
  autoReload = true,
}: Props) {
  // initial 5% — กัน flash ที่ 0% ก่อน tick แรก (80ms) และให้ user เห็นทันที
  // ว่า "เริ่มแล้ว"
  const [progress, setProgress] = useState(5);
  const [showRetry, setShowRetry] = useState(false);
  // ถ้า reload อัตโนมัติไปแล้ว → user กลับมาเจอหน้านี้อีกครั้ง = stuck จริง
  const alreadyReloaded = readReloadGuard();
  useEffect(() => {
    const reduced = prefersReducedMotion();
    // ถ้า reduce motion → คง progress ไว้ที่ 5% (skip animation) แต่ยังโชว์
    // bar เป็น hint ว่ากำลังโหลด · setInterval ไม่ทำงาน
    const progressId = reduced
      ? null
      : setInterval(() => {
          // phase 1: เร็วถึง 95% · phase 2: คลานช้าจาก 95% → 99% (กัน "ค้าง")
          setProgress((p) =>
            p < 94
              ? Math.min(95, p + (95 - p) * 0.06)
              : Math.min(99, p + (99 - p) * 0.01),
          );
        }, 80);
    // showRetry หลัง 8s — single setTimeout แทน 1s setInterval ที่ trigger
    // re-render ทุกวินาทีโดยเปล่าประโยชน์
    const retryTimer = setTimeout(() => setShowRetry(true), 8000);
    // auto-reload หลัง 10 วินาที — 1 ครั้งต่อ session
    // ข้ามทั้งดุ้นถ้า autoReload = false (เช่นกำลังแลก code ของ LINE Login)
    const reloadTimer = autoReload
      ? setTimeout(() => {
          try {
            if (sessionStorage.getItem(RELOAD_KEY)) return;
            sessionStorage.setItem(RELOAD_KEY, "1");
          } catch {
            // sessionStorage ปิดอยู่ → กัน loop ไม่ได้ ไม่ reload ดีกว่า
            return;
          }
          window.location.reload();
        }, 10000)
      : null;
    return () => {
      if (progressId) clearInterval(progressId);
      clearTimeout(retryTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      // ไม่ล้าง RELOAD_KEY ที่นี่ — ดู clearBootReloadGuard() ข้างบน
    };
  }, [autoReload]);

  return (
    // ── หน้า loading ใช้ "font ระบบ" (ไม่ใช่ Prompt) โดยตั้งใจ ──
    // Prompt เป็น web font ที่โหลดทีหลัง → ตอน boot จะเห็นตัวอักษรสลับ
    // (fallback → Prompt) ดูเพี้ยน · หน้านี้ขึ้นก่อน font โหลดเสมอ จึงบังคับ
    // ใช้ system font ที่มีอยู่แล้ว 100% → ตัวอักษรนิ่ง ไม่สลับไปมา
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-linear-160 from-maroon-dk via-maroon to-maroon-lt px-6"
      style={{
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif",
      }}
    >
      <div className="w-16 h-16 rounded-full bg-linear-135 from-gold to-gold-lt flex items-center justify-center shadow-[0_6px_20px_rgba(201,151,58,0.31)]">
        <Diamond size={32} color="#5C1212" />
      </div>
      <div className="mt-4.5 text-sm font-semibold text-gold-lt">{message}</div>
      <div className="mt-3 w-[220px] h-2 rounded-full bg-white/10 overflow-hidden">
        {/* fill ด้วย transform scaleX (GPU-composited) แทน width (layout
            ทุกเฟรม) → progress bar ลื่น ไม่กระตุก */}
        <div
          className="h-full w-full origin-left rounded-full bg-linear-to-r from-gold to-gold-lt transition-transform duration-100 ease-out motion-reduce:transition-none"
          style={{
            transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})`,
          }}
        />
      </div>
      <div className="mt-1.5 text-xs font-bold text-gold-lt/80 tabular-nums">
        {Math.round(progress)}%
      </div>

      {/* ปุ่ม recovery — โผล่หลัง 8 วินาที หรือทันทีถ้า auto-reload ไปแล้ว */}
      {(showRetry || alreadyReloaded) && (
        <div className="mt-8 flex flex-col items-center gap-3 max-w-[280px]">
          <div className="text-xs text-gold-lt/80 text-center leading-relaxed">
            {alreadyReloaded
              ? "ดูเหมือนจะยังค้างอยู่ — ลองล้าง cache แล้วเข้าใหม่"
              : "โหลดนานกว่าปกติ — ลองรีเฟรชดูครับ"}
          </div>
          <button
            type="button"
            onClick={
              alreadyReloaded ? hardReload : () => window.location.reload()
            }
            className="px-4 py-2 rounded-[10px] bg-gold text-maroon-dk text-sm font-extrabold cursor-pointer active:scale-[0.96] transition-transform shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
          >
            {alreadyReloaded ? "ล้าง cache + เข้าใหม่" : "ลองใหม่"}
          </button>
          {alreadyReloaded && (
            <div className="text-[10px] text-gold-lt/60 text-center leading-relaxed mt-1">
              ถ้ายังเข้าไม่ได้ ลองตรวจอินเทอร์เน็ต หรือเปิดในแอป LINE
            </div>
          )}
        </div>
      )}
    </div>
  );
}
