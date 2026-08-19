import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import LeaveApp from "./App";
import LoginScreen from "./components/auth/LoginScreen";
import BootLoadingScreen from "./components/shared/BootLoadingScreen";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

/* ─── Auto-reload เมื่อ chunk hash เก่าค้างใน cache ──────────
   หลัง deploy ใหม่ index.html เก่าจะอ้างไฟล์ chunk ที่หายไปแล้ว
   จับ vite:preloadError แล้ว reload ครั้งเดียวเพื่อโหลด HTML ใหม่
   (sessionStorage กัน loop ถ้า reload แล้วยัง error)              */
window.addEventListener("vite:preloadError", (event) => {
  const RELOAD_KEY = "vite-preload-reloaded";
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  event.preventDefault();
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
});
window.addEventListener("load", () => {
  // ถ้าโหลดสำเร็จ ล้าง flag เพื่อให้ครั้งหน้า reload ได้อีก
  sessionStorage.removeItem("vite-preload-reloaded");
});

/* ─── Auth Gate — show login or app based on auth state ──── */
function AuthGate() {
  const { user, loading, error } = useAuth();

  if (loading) {
    return <BootLoadingScreen message="กำลังเข้าสู่ระบบ..." />;
  }

  if (!user) {
    return <LoginScreen loading={false} error={error} />;
  }

  return <LeaveApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
