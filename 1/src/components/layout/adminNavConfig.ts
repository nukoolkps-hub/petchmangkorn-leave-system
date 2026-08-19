/* ─── Admin Navigation Config ─────────────────────────────────────
   แยกออกมาจาก AdminPanel เพื่อให้ Sidebar ใช้ render nav บน Desktop ได้   */

import {
  Bell as IconBell,
  CalendarDays as IconCalendarEvent,
  CalendarOff as IconCalendarOff,
  CalendarRange as IconCalendarRange,
  BarChart3 as IconChartBar,
  ClipboardList as IconClipboardList,
  MessageCircle as IconMessageCircle,
  Settings as IconSettings,
  Terminal as IconTerminal,
  Users as IconUsers,
} from "lucide-react";

export type AdminSectionId =
  | "summary"
  | "leaves"
  | "roles"
  | "calendar-view"
  | "store-calendar"
  | "linebot-notifications"
  | "linebot-commands";

export type AdminGroupId = "leave" | "settings" | "calendar" | "linebot";

type AdminNavIcon = typeof IconChartBar;

export interface AdminNavItem {
  id: AdminSectionId;
  label: string;
  Icon: AdminNavIcon;
}

export interface AdminNavGroup {
  id: AdminGroupId;
  label: string;
  defaultSection: AdminSectionId;
  Icon: AdminNavIcon;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "calendar",
    label: "ปฏิทิน",
    defaultSection: "calendar-view",
    Icon: IconCalendarRange,
    items: [
      { id: "calendar-view", label: "ปฏิทินการลา", Icon: IconCalendarEvent },
      {
        id: "store-calendar",
        label: "วันเปิด-ปิดร้าน",
        Icon: IconCalendarOff,
      },
    ],
  },
  {
    id: "leave",
    label: "การลา",
    defaultSection: "summary",
    Icon: IconCalendarEvent,
    items: [
      { id: "summary", label: "สรุปลา", Icon: IconChartBar },
      { id: "leaves", label: "เพิ่ม - ลบ การลา", Icon: IconClipboardList },
    ],
  },
  {
    id: "linebot",
    label: "LINE BOT",
    defaultSection: "linebot-notifications",
    Icon: IconMessageCircle,
    items: [
      { id: "linebot-notifications", label: "การแจ้งเตือน", Icon: IconBell },
      { id: "linebot-commands", label: "คำสั่ง", Icon: IconTerminal },
    ],
  },
  {
    id: "settings",
    label: "ตั้งค่า",
    defaultSection: "roles",
    Icon: IconSettings,
    items: [{ id: "roles", label: "พนักงาน", Icon: IconUsers }],
  },
];

export function getAdminGroupForSection(
  section: AdminSectionId,
): AdminNavGroup {
  return (
    ADMIN_NAV_GROUPS.find((group) =>
      group.items.some((item) => item.id === section),
    ) || ADMIN_NAV_GROUPS[0]
  );
}
