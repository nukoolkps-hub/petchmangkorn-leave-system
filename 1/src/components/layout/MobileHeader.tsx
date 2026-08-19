/* ─── MobileHeader — Mobile top header with profile strip ────── */

import {
  BookOpen as IconBook2,
  Pencil as IconEdit,
  Eye as IconEye,
  FileText as IconFileText,
  Shield as IconShield,
  User as IconUser,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { COLORS } from "../../constants";
import AppLogo from "../shared/AppLogo";
import AvatarCircle from "../shared/AvatarCircle";
import MemphisPattern from "../shared/MemphisPattern";
import { PAGE_TITLES } from "./navConfig";

interface MobileHeaderProps {
  profile: any;
  isAdmin?: boolean;
  holding?: boolean;
  onEditProfile: () => void;
  onShowManual: () => void;
  /** admin (จริง · ยังไม่ preview) → ปุ่ม "ดูมุมมองพนักงาน" ข้างปุ่มคู่มือ */
  onPreviewEmployee?: () => void;
  startHold?: () => void;
  endHold?: () => void;
  onRingComplete?: () => void;
}

export default function MobileHeader({
  profile,
  isAdmin = false,
  holding = false,
  onEditProfile,
  onShowManual,
  onPreviewEmployee,
  startHold = () => {},
  endHold = () => {},
  onRingComplete = () => {},
}: MobileHeaderProps) {
  const tab = useLocation().pathname.replace("/", "") || "home";

  return (
    <div className="leave-header-mobile bg-linear-to-br from-maroon-dk via-maroon to-maroon-lt pt-5 px-5 pb-0 shrink-0 relative overflow-hidden">
      {/* Memphis scatter decoration */}
      <MemphisPattern variant="header" />

      <div className="flex items-center justify-between mb-4 relative min-h-9">
        <div className="flex items-center gap-2.5">
          {tab === "home" ? (
            <div className="flex items-center gap-2.5 select-none">
              {/* Long-press ONLY on diamond */}
              <div
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={startHold}
                onTouchEnd={endHold}
                className="relative w-8 h-8 flex items-center justify-center cursor-pointer shrink-0"
              >
                {holding && (
                  <svg
                    className="absolute -inset-2 w-12 h-12 pointer-events-none"
                    viewBox="0 0 48 48"
                  >
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke={COLORS.goldLight}
                      strokeWidth="3"
                      strokeOpacity="0.2"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke={COLORS.goldLight}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="131.95"
                      strokeDashoffset="131.95"
                      transform="rotate(-90 24 24)"
                      onAnimationEnd={onRingComplete}
                      className="animate-[ringFill_5s_linear_forwards]"
                    />
                  </svg>
                )}
                <AppLogo size={30} />
              </div>
              <div>
                <div className="text-gold-lt font-extrabold text-lg leading-none tracking-tight">
                  ห้างทองเพชรมังกร
                </div>
                <div className="text-gold-lt/50 text-xs tracking-wider mt-px">
                  ระบบพนักงาน
                </div>
              </div>
            </div>
          ) : (
            <div className="text-white font-bold text-xl">
              {PAGE_TITLES[tab]}
            </div>
          )}
        </div>
        {(tab === "home" || tab === "admin") && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onPreviewEmployee && (
              <button
                onClick={onPreviewEmployee}
                title="ดูมุมมองพนักงาน"
                aria-label="ดูมุมมองพนักงาน"
                className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-gold-lt/25 bg-white/12 cursor-pointer text-white font-[inherit]"
              >
                <IconEye size={18} color="#fff" strokeWidth={2.2} />
              </button>
            )}
            <button
              onClick={onShowManual}
              title="คู่มือการใช้งาน"
              aria-label="คู่มือการใช้งาน"
              className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-gold-lt/25 bg-white/12 cursor-pointer text-white font-[inherit]"
            >
              <IconBook2 size={18} color="#fff" strokeWidth={2.2} />
            </button>
          </div>
        )}
        {tab === "salary" && (
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("openSalaryCert"))
            }
            title="พิมพ์ใบรับรองเงินเดือน"
            className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[10px] border border-gold-lt/25 bg-white/12 cursor-pointer text-white font-[inherit] text-xs font-semibold shrink-0 whitespace-nowrap"
          >
            <IconFileText size={16} color="#fff" strokeWidth={2.2} />
            ใบรับรอง
          </button>
        )}
        {tab !== "home" && tab !== "salary" && tab !== "admin" && (
          <div className="w-9 h-9" />
        )}
      </div>

      {/* profile strip */}
      {tab === "home" && !isAdmin && (
        <div className="flex items-center gap-3.5 mb-4.5 relative">
          {profile ? (
            <button
              onClick={onEditProfile}
              className="bg-transparent border-none p-0 cursor-pointer flex items-center gap-3.5 flex-1"
            >
              <AvatarCircle
                avatar={profile.avatar}
                avatarType={profile.avatarType}
                avatarImageUrl={profile.avatarImageUrl}
                size={56}
                fontSize={18}
                border={`2.5px solid ${COLORS.goldLight}50`}
              />
              <div className="text-left">
                <div className="text-gold-lt/50 text-sm">สวัสดีค่ะ</div>
                <div className="text-white font-bold text-xl leading-[1.15]">
                  {profile.name}
                </div>
                <div className="text-gold-lt/55 text-sm mt-0.5">
                  {profile.role}
                </div>
              </div>
              <div className="ml-auto w-10 h-10 rounded-[10px] bg-gold-lt/13 flex items-center justify-center shrink-0">
                <IconEdit size={22} color="#fff" strokeWidth={2.5} />
              </div>
            </button>
          ) : (
            <button
              onClick={onEditProfile}
              className="flex items-center gap-3 bg-white/12 border-[1.5px] border-dashed border-gold-lt/37 rounded-[14px] px-4 py-3 cursor-pointer flex-1 font-[inherit]"
            >
              <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center text-gold-lt">
                <IconUser size={24} strokeWidth={2} />
              </div>
              <div className="text-left">
                <div className="text-gold-lt font-bold text-base">
                  ตั้งค่าโปรไฟล์ของคุณ
                </div>
                <div className="text-gold-lt/50 text-sm mt-0.5">
                  กรอกชื่อและเลือกรูปโปรไฟล์
                </div>
              </div>
            </button>
          )}
        </div>
      )}
      {tab === "home" && isAdmin && (
        <div className="flex items-center gap-3.5 mb-4.5 relative">
          <div className="w-12 h-12 rounded-xl bg-white/12 border border-gold-lt/20 flex items-center justify-center shrink-0">
            <IconShield size={24} color={COLORS.goldLight} strokeWidth={2.4} />
          </div>
          <div className="text-left">
            <div className="text-gold-lt/50 text-sm">โหมดผู้ดูแล</div>
            <div className="text-white font-bold text-xl leading-[1.15]">
              ผู้ดูแลระบบ
            </div>
            <div className="text-gold-lt/55 text-sm mt-0.5">
              จัดการข้อมูลพนักงาน
            </div>
          </div>
        </div>
      )}
      {tab !== "home" && <div className="h-2" />}
      <div className="h-0.5 bg-gold-divider" />
    </div>
  );
}
