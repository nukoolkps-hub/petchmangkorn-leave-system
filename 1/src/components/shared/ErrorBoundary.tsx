import {
  AlertCircle as IconAlertCircle,
  Search as IconSearch,
} from "lucide-react";
import type React from "react";
import { Component } from "react";

/* ─── Error Boundary ───────────────────────────────────────────────
   ดักจับ errors ทั้งหมดในระดับ React tree
   - แสดงหน้า fallback แทนที่จะ crash ทั้งแอป
   - log error ไป console (อนาคต: ส่งไป Sentry/LogRocket)             */
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log สำหรับ debug — production สามารถส่งไป error tracking service ได้
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => (window.location.hash = "#/home");

  handleClear = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-cream p-5 font-sans animate-[fadeIn_0.2s_ease-out]">
        <div className="max-w-[480px] w-full bg-white rounded-[20px] px-7 py-8 shadow-[0_12px_40px_rgba(45,26,14,0.15)] border border-bdr animate-[slideUp_0.3s_ease-out]">
          {/* icon */}
          <div className="w-[72px] h-[72px] rounded-full mx-auto mb-5 bg-linear-135 from-red to-maroon flex items-center justify-center shadow-[0_6px_18px_rgba(192,57,43,0.25)]">
            <IconAlertCircle size={36} color="#fff" strokeWidth={2.2} />
          </div>

          {/* heading */}
          <div className="text-center mb-5">
            <h2 className="m-0 text-2xl font-extrabold text-txt">
              เกิดข้อผิดพลาดในระบบ
            </h2>
            <p className="mt-2 mb-0 text-sm text-txt-mid leading-relaxed">
              ขออภัย ระบบเกิดปัญหาบางอย่าง
              <br />
              ลองโหลดหน้าใหม่ หรือกลับสู่หน้าหลัก
            </p>
          </div>

          {/* error details (dev only) */}
          {import.meta.env.DEV && this.state.error && (
            <details className="bg-red-lt border border-red/20 rounded-[10px] px-3.5 py-3 mb-5 text-sm">
              <summary className="cursor-pointer font-semibold text-red mb-1.5 inline-flex items-center gap-1">
                <IconSearch size={14} strokeWidth={2.4} />
                รายละเอียดข้อผิดพลาด (สำหรับ dev)
              </summary>
              <div className="mt-2 font-mono text-maroon-dk whitespace-pre-wrap wrap-break-word leading-normal">
                <b>{this.state.error.toString()}</b>
                {this.state.errorInfo?.componentStack && (
                  <div className="mt-2 opacity-80 text-xs">
                    {this.state.errorInfo.componentStack}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* actions */}
          <div className="flex gap-2.5">
            <button
              onClick={this.handleReset}
              className="flex-1 p-3.5 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
            >
              ลองใหม่
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 p-3.5 rounded-xl border-none bg-linear-135 from-maroon to-maroon-lt text-white text-base font-bold cursor-pointer font-[inherit] shadow-[0_4px_14px_rgba(123,28,28,0.31)]"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }
}
