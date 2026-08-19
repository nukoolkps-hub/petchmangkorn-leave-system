import { type ReactNode, useCallback, useEffect, useState } from "react";

interface BaseModalProps {
  children: ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  maxWidthClass?: string;
  contentClassName?: string;
  overlayClassName?: string;
  zIndexClass?: string;
}

const CLOSE_DURATION_MS = 140;

export default function BaseModal({
  children,
  onClose,
  closeOnBackdrop = true,
  closeOnEsc = true,
  maxWidthClass = "max-w-[430px]",
  contentClassName = "",
  overlayClassName = "",
  zIndexClass = "z-800",
}: BaseModalProps) {
  // exit animation · setClosing=true → dialog เล่น dialogOut (overlay โผล่/หาย
  // ทันที ไม่ animate) · จากนั้นเรียก onClose() จริง · กัน double-fire ด้วย flag
  const [closing, setClosing] = useState(false);
  // will-change:transform ค้างถาวร = บน iOS สร้าง layer ที่ทำให้ caret (cursor)
  // ใน input เลื่อนผิดตำแหน่ง · ใส่ will-change เฉพาะ "ตอน animate" แล้วถอดออก
  // เมื่อ idle → input ใน modal พิมพ์แล้ว cursor ตรง
  const [animating, setAnimating] = useState(true);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onClose(), CLOSE_DURATION_MS);
  }, [closing, onClose]);

  useEffect(() => {
    if (!closeOnEsc) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEsc, requestClose]);

  return (
    // overlay (พื้น + backdrop-blur) โผล่ทันที — ไม่ animate opacity เพราะ
    // การ animate ทับ backdrop-blur ทำให้ browser re-compute blur ทุกเฟรม =
    // กระตุกบนมือถือ · ให้ blur คำนวณครั้งเดียว แล้วปล่อย dialog animate เอง
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)] bg-[rgba(45,26,14,0.65)] backdrop-blur-[6px] ${overlayClassName}`}
      onClick={() => {
        if (closeOnBackdrop) requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={() => setAnimating(false)}
        className={`w-full ${maxWidthClass} max-h-[88dvh] overflow-y-auto overscroll-contain bg-white rounded-xl shadow-[0_24px_60px_rgba(45,26,14,0.3)] ${
          // ใส่ will-change เฉพาะตอน animate (entrance/exit) แล้วถอดเมื่อ idle —
          // กัน caret ใน input เลื่อนผิดบน iOS (transform layer ค้าง)
          animating || closing ? "[will-change:transform,opacity]" : ""
        } ${
          closing
            ? "animate-[dialogOut_0.14s_ease-in_forwards]"
            : "animate-[dialogIn_0.18s_cubic-bezier(0.2,0.8,0.2,1)]"
        } ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
