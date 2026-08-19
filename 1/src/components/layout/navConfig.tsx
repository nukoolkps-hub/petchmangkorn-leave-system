/* ─── Navigation Configuration ───────────────────────────────── */

import {
  FilePlus as IconFilePlus,
  Home as IconHome,
  Shield as IconShield,
} from "lucide-react";
import { COLORS } from "../../constants";

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

export function getNavItems(options: { isAdmin: boolean }): NavItem[] {
  if (options.isAdmin) {
    return [
      {
        id: "admin",
        path: "/admin",
        label: "ADMIN",
        icon: (a: boolean) => (
          <IconShield
            size={22}
            strokeWidth={a ? 2.5 : 2}
            fill={a ? `${COLORS.maroon}40` : "none"}
          />
        ),
      },
    ];
  }

  return [
    {
      id: "home",
      path: "/home",
      label: "หน้าแรก",
      icon: (a) => (
        <IconHome
          size={22}
          strokeWidth={a ? 2.5 : 2}
          fill={a ? `${COLORS.gold}30` : "none"}
        />
      ),
    },
    {
      id: "request",
      path: "/request",
      label: "ยื่นคำขอลา",
      icon: (a) => (
        <IconFilePlus
          size={22}
          strokeWidth={a ? 2.5 : 2}
          fill={a ? `${COLORS.gold}30` : "none"}
        />
      ),
    },
  ];
}

export const PAGE_TITLES: Record<string, string | null> = {
  home: null,
  request: "ยื่นคำขอลา",
  admin: "จัดการข้อมูลพนักงาน",
};
