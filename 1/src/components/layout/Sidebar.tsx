/* ─── Sidebar — Desktop navigation (≥768px) ─────────────────── */

import {
  Pencil as IconEdit,
  LogOut as IconLogout,
  Shield as IconShield,
  User as IconUser,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { COLORS } from "../../constants";
import AppLogo from "../shared/AppLogo";
import AvatarCircle from "../shared/AvatarCircle";
import MemphisPattern from "../shared/MemphisPattern";
import {
  ADMIN_NAV_GROUPS,
  type AdminSectionId,
  getAdminGroupForSection,
} from "./adminNavConfig";
import type { NavItem } from "./navConfig";

interface SidebarProps {
  profile: any;
  isAdmin?: boolean;
  navItems: NavItem[];
  holding?: boolean;
  onEditProfile: () => void;
  onSignOut: () => void;
  startHold?: () => void;
  endHold?: () => void;
  onRingComplete?: () => void;
  /* Admin nav: ส่งเมื่อ isAdmin เพื่อให้ sidebar แสดง groups + sub-items แทน flat */
  adminSection?: AdminSectionId;
  onAdminSectionChange?: (next: AdminSectionId) => void;
}

export default function Sidebar({
  profile,
  isAdmin = false,
  navItems,
  holding = false,
  onEditProfile,
  onSignOut,
  startHold = () => {},
  endHold = () => {},
  onRingComplete = () => {},
  adminSection,
  onAdminSectionChange,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <div className="leave-sidebar">
      {/* Memphis bg */}
      <MemphisPattern variant="sidebar" />

      {/* Brand */}
      <div className="leave-sidebar-profile relative">
        <div className="flex items-center gap-2.5 mb-4">
          {/* Long-press target */}
          <div
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            className="relative w-7 h-7 flex items-center justify-center cursor-default select-none shrink-0"
          >
            {holding && (
              <svg
                className="absolute -inset-2 w-11 h-11 pointer-events-none"
                viewBox="0 0 44 44"
              >
                <circle
                  cx="22"
                  cy="22"
                  r="19"
                  fill="none"
                  stroke={COLORS.goldLight}
                  strokeWidth="2.5"
                  strokeOpacity="0.25"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="19"
                  fill="none"
                  stroke={COLORS.goldLight}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="119.38"
                  strokeDashoffset="119.38"
                  transform="rotate(-90 22 22)"
                  onAnimationEnd={onRingComplete}
                  className="animate-[ringFillSide_5s_linear_forwards]"
                />
              </svg>
            )}
            <AppLogo size={28} />
          </div>
          <div>
            <div className="text-gold-lt font-extrabold text-base leading-none">
              ห้างทองเพชรมังกร
            </div>
            <div className="text-gold-lt/45 text-xs mt-0.5">ระบบพนักงาน</div>
          </div>
        </div>
        {/* Profile */}
        {isAdmin ? (
          <div className="flex items-center gap-3 bg-white/8 border border-gold-lt/15 rounded-[14px] px-3.5 py-2.5 w-full font-[inherit]">
            <div className="w-10 h-10 rounded-xl bg-gold-lt/15 flex items-center justify-center shrink-0">
              <IconShield
                size={21}
                color={COLORS.goldLight}
                strokeWidth={2.4}
              />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="text-white font-bold text-sm truncate">
                ผู้ดูแลระบบ
              </div>
              <div className="text-gold-lt/50 text-sm mt-px">
                จัดการข้อมูลพนักงาน
              </div>
            </div>
          </div>
        ) : profile ? (
          <button
            onClick={onEditProfile}
            className="flex items-center gap-3 bg-white/8 border border-gold-lt/15 rounded-[14px] px-3.5 py-2.5 w-full cursor-pointer font-[inherit] transition-all duration-200"
          >
            <AvatarCircle
              avatar={profile.avatar}
              avatarType={profile.avatarType}
              avatarImageUrl={profile.avatarImageUrl}
              size={40}
              fontSize={14}
              border={`2px solid ${COLORS.goldLight}50`}
            />
            <div className="text-left flex-1 min-w-0">
              <div className="text-white font-bold text-sm truncate">
                {profile.name}
              </div>
              <div className="text-gold-lt/50 text-sm mt-px">
                {profile.role}
              </div>
            </div>
            <div className="shrink-0 w-9 h-9 rounded-[9px] bg-gold-lt/15 flex items-center justify-center">
              <IconEdit size={20} color="#fff" strokeWidth={2.5} />
            </div>
          </button>
        ) : (
          <button
            onClick={onEditProfile}
            className="flex items-center gap-2.5 bg-white/8 border-[1.5px] border-dashed border-gold-lt/30 rounded-[14px] px-3.5 py-2.5 w-full cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
          >
            <IconUser size={24} strokeWidth={2} className="text-gold-lt" />
            <span className="text-gold-lt text-sm font-semibold">
              ตั้งค่าโปรไฟล์
            </span>
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="leave-sidebar-nav">
        {isAdmin && adminSection && onAdminSectionChange
          ? ADMIN_NAV_GROUPS.map((group) => {
              const activeGroup =
                getAdminGroupForSection(adminSection).id === group.id;
              const GroupIcon = group.Icon;
              return (
                <div key={group.id} className="mb-1">
                  <div className="flex items-center gap-2.5 px-3 pt-2 pb-1.5 text-xs font-bold uppercase tracking-wide text-gold-lt/45">
                    <GroupIcon
                      size={14}
                      strokeWidth={2.2}
                      color={
                        activeGroup
                          ? COLORS.goldLight
                          : "rgba(232,200,122,0.45)"
                      }
                    />
                    <span>{group.label}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = adminSection === item.id;
                      const ItemIcon = item.Icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onAdminSectionChange(item.id)}
                          className={`flex items-center gap-3 px-3 py-2 ml-3.5 rounded-lg cursor-pointer transition-all duration-150 relative text-left active:scale-[0.97] ${active ? "bg-white/12 text-gold-lt" : "bg-transparent text-white/55"}`}
                        >
                          <ItemIcon
                            size={16}
                            strokeWidth={active ? 2.5 : 2}
                            color={
                              active
                                ? COLORS.goldLight
                                : "rgba(255,255,255,0.55)"
                            }
                            className="transition-colors duration-200"
                          />
                          <span className="text-sm">{item.label}</span>
                          {active && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-[fadeIn_0.2s_ease-out]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          : navItems.map((n) => {
              const active = currentPath === n.path;
              return (
                <button
                  key={n.id}
                  onClick={() => navigate(n.path)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 relative ${active ? "bg-white/12" : "bg-transparent"} ${active ? "text-gold-lt" : "text-white/55"}`}
                >
                  <span>{n.icon(active)}</span>
                  <span>{n.label}</span>
                  {active && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-[fadeIn_0.2s_ease-out]" />
                  )}
                </button>
              );
            })}
      </div>

      {/* Footer */}
      <div className="leave-sidebar-footer relative">
        <button
          onClick={onSignOut}
          className="w-full px-4 py-2.5 rounded-[10px] border border-white/15 bg-white/6 text-white/50 cursor-pointer font-[inherit] text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 mb-3 hover:bg-white/12 hover:text-white/80"
        >
          <IconLogout size={16} strokeWidth={2} />
          ออกจากระบบ
        </button>
        <div className="text-xs text-white/25 text-center">
          Haangpetchthongmukda Co., Ltd
        </div>
      </div>
    </div>
  );
}
