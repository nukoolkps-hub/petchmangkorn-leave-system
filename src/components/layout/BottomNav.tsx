/* ─── BottomNav — Mobile bottom tab bar ──────────────────────── */

import { useLocation, useNavigate } from "react-router-dom";
import type { NavItem } from "./navConfig";

interface BottomNavProps {
  navItems: NavItem[];
}

export default function BottomNav({ navItems }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <div className="leave-bottom-nav bg-white border-t border-bdr shadow-[0_-4px_20px_rgba(90,30,10,0.10)] z-100">
      {navItems.map((n) => {
        const active = currentPath === n.path,
          isAdminTab = n.id === "admin";
        return (
          <button
            key={n.id}
            onClick={() => navigate(n.path)}
            className={`flex-1 pt-2.5 pb-3 bg-transparent border-none cursor-pointer font-[inherit] flex flex-col items-center gap-1 transition-all duration-150 relative active:scale-[0.92] ${active ? (isAdminTab ? "text-maroon" : "text-gold") : "text-txt-soft"}`}
          >
            {active && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div
                  className={`absolute top-0 w-9 h-0.5 rounded-b ${isAdminTab ? "bg-linear-to-r from-maroon to-maroon-lt" : "bg-linear-to-r from-gold to-gold-lt"}`}
                />
                <div
                  className={`absolute top-1.5 left-1/2 -translate-x-[26px] w-1.5 h-1.5 rounded-full ${isAdminTab ? "bg-maroon" : "bg-gold"}`}
                />
                <div
                  className={`absolute top-1.5 left-1/2 translate-x-[18px] w-1.5 h-1.5 rotate-45 ${isAdminTab ? "bg-maroon-lt" : "bg-gold-lt"}`}
                />
              </div>
            )}
            <span
              className={`transition-transform duration-150 ${active ? "-translate-y-px" : ""}`}
            >
              {n.icon(active)}
            </span>
            <span className={`text-xs ${active ? "font-bold" : "font-medium"}`}>
              {n.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
