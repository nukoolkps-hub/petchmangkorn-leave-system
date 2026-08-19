/* ─── App-wide constants — ระบบการลา ห้างทองเพชรมังกร ─────────────────────────────────────────── */

import {
  Briefcase as IconBriefcase,
  Stethoscope as IconStethoscope,
} from "lucide-react";

export const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800&display=swap";

export const COLORS = {
  maroon: "#7B1C1C",
  maroonDark: "#5C1212",
  maroonLt: "#9B3030",
  gold: "#C9973A",
  goldLight: "#E8C87A",
  goldPale: "#F5E6C8",
  cream: "#FDF8F0",
  creamDark: "#F0E4CC",
  white: "#FFFFFF",
  text: "#2D1A0E",
  textMedium: "#7A5C3A",
  textSoft: "#B89A72",
  border: "#E8D5B0",
  red: "#C0392B",
  redLight: "#FDECEA",
  green: "#1A6B3A",
  greenLight: "#E8F5EE",
  amber: "#D97706",
  amberLight: "#FEF3C7",
};

export const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
export const THAI_MONTH_SHORT_NAMES = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
export const THAI_SHORT_WEEKDAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export const LEAVE_TYPES = [
  {
    id: "personal",
    label: "ลากิจ",
    Icon: IconBriefcase,
    color: "#1E40AF",
    colorLt: "#DDEEFF",
  },
  {
    id: "sick",
    label: "ลาป่วย",
    Icon: IconStethoscope,
    color: "#0F766E",
    colorLt: "#CCFBF1",
  },
];

export const EMOJI_LIST = [
  "😊",
  "😄",
  "🙂",
  "😎",
  "🤩",
  "🥰",
  "😇",
  "🤗",
  "😏",
  "🥳",
  "👨‍💼",
  "👩‍💼",
  "👨‍⚕️",
  "👩‍⚕️",
  "👨‍🍳",
  "👩‍🍳",
  "👷",
  "💁",
  "🧑‍💻",
  "👮",
  "🧑‍🎨",
  "🧑‍🏫",
  "🦸",
  "🦹",
  "🧙",
  "🧝",
  "🧛",
  "🐯",
  "🦊",
  "🐼",
  "🌟",
  "💎",
  "🌺",
  "🌸",
  "🍀",
  "🦋",
  "🐉",
  "👑",
  "🎯",
  "🔥",
];

export const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

/* ─── Business rules (คอนฟิกของบริษัท) ─────────────────────────────
   ค่าเหล่านี้คือ "สูตร/กฎของบริษัท" — แก้ที่นี่ที่เดียวจะปรับทุกที่
   อนาคต: ย้ายไปเป็น settings ใน admin panel ให้แก้ผ่าน UI ได้     */
export const BUSINESS_RULES = {
  /** โควต้าวันลาธรรมดา (วัน/เดือน) — เกินจากนี้ถือว่า "เกินโควต้า" */
  WEEKDAY_LEAVE_QUOTA: 2,

  /** จำนวนวันสูงสุดต่อใบลา 1 ใบ (กันกรอกช่วงยาวผิดพลาด) */
  MAX_LEAVE_DAYS_PER_REQUEST: 31,
};

/* ─── Validation patterns ─────────────────────────────────────────── */
export const VALIDATION = {
  /** LINE User ID: ต้องขึ้นต้น U + ตามด้วย hex 32 ตัว */
  LINE_USER_ID_PATTERN: /^U[a-f0-9]{32}$/,
};
