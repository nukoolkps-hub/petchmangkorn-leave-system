/* ─── LINE Bot Notifications Panel ─────────────────────────────
   - toggle เปิด-ปิด "สรุปเช้า 07:30" (ใครหยุดวันนี้)
   - ตั้งกลุ่ม LINE ปลายทาง (หา ID ด้วยคำสั่ง "ไอดีกลุ่ม" ในกลุ่มนั้น)

   เก็บทั้งคู่ใน `config/notifications` · Cloud Function `sendDailySummary`
   อ่านค่าเดียวกัน → เปลี่ยนแล้วมีผลทันที ไม่ต้อง deploy ใหม่

   Default semantic: missing field / true = enabled (กัน Function ที่
   deploy ใหม่ทำงานไม่ได้ก่อน admin จะกดเปิด/สร้าง config doc)             */

import {
  Bell as IconBell,
  Clock as IconClock,
  Plus as IconPlus,
  Trash2 as IconTrash,
  Users as IconUsers,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  type NotificationSettings,
  subscribeNotificationSettings,
  updateNotificationSettings,
} from "../../firebase/notificationSettings";
import ToggleSwitch from "../shared/ToggleSwitch";

interface LineBotNotificationsPanelProps {
  showToast?: (message: string) => void;
}

export default function LineBotNotificationsPanel({
  showToast,
}: LineBotNotificationsPanelProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({});
  const [loading, setLoading] = useState(true);
  // Optimistic override — flip toggle ทันทีโดยไม่รอ Firestore round-trip
  const [optimistic, setOptimistic] = useState<NotificationSettings>({});
  const [newTarget, setNewTarget] = useState("");
  const [savingTargets, setSavingTargets] = useState(false);

  useEffect(() => {
    const unsub = subscribeNotificationSettings(
      (s) => {
        setSettings(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  // Default semantic: ไม่ใช่ false → enabled
  const isOn = (field: "dailySummaryEnabled") => {
    if (field in optimistic) return optimistic[field] !== false;
    return settings[field] !== false;
  };

  const targets = settings.dailySummaryTargets ?? [];

  async function toggle(field: "dailySummaryEnabled") {
    const next = !isOn(field);
    setOptimistic((prev) => ({ ...prev, [field]: next }));
    try {
      await updateNotificationSettings(
        { [field]: next },
        user?.uid || "anonymous",
      );
      showToast?.(`${next ? "เปิด" : "ปิด"}การแจ้งเตือนเรียบร้อย`);
    } catch (err) {
      // Rollback: ลบ override ของ field นี้ → กลับไปแสดง value จาก Firestore
      console.error("[LineBotNotificationsPanel] toggle error:", err);
      setOptimistic((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
      showToast?.("บันทึกไม่สำเร็จ");
    }
  }

  async function saveTargets(next: string[]) {
    setSavingTargets(true);
    try {
      await updateNotificationSettings(
        { dailySummaryTargets: next },
        user?.uid || "anonymous",
      );
      showToast?.("บันทึกกลุ่มปลายทางแล้ว");
    } catch (err) {
      console.error("[LineBotNotificationsPanel] save targets error:", err);
      showToast?.("บันทึกไม่สำเร็จ");
    } finally {
      setSavingTargets(false);
    }
  }

  async function addTarget() {
    const id = newTarget.trim();
    if (!id) return;
    if (targets.includes(id)) {
      showToast?.("มีกลุ่มนี้อยู่แล้ว");
      return;
    }
    await saveTargets([...targets, id]);
    setNewTarget("");
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <IconBell size={18} strokeWidth={2.4} className="text-maroon" />
        <h2 className="text-lg font-extrabold text-txt">การแจ้งเตือน LINE</h2>
      </div>
      <p className="text-sm text-txt-soft mb-4 leading-relaxed">
        เปลี่ยนแล้วมีผลทันที ไม่ต้องรอ deploy
      </p>

      <ToggleRow
        icon={IconClock}
        title="สรุปเช้า 07:30 — ใครหยุดวันนี้"
        description="Bot push รายชื่อพนักงานที่ลาคร่อมวันนี้เข้ากลุ่ม LINE ที่ตั้งไว้ด้านล่าง · ข้ามวันเสาร์ปกติ (ส่งเฉพาะเสาร์ที่เปิดพิเศษในปฏิทินร้าน)"
        enabled={isOn("dailySummaryEnabled")}
        disabled={loading}
        onToggle={() => toggle("dailySummaryEnabled")}
      />

      {/* ── กลุ่มปลายทาง ── */}
      <div className="mt-4 rounded-[12px] border-[1.5px] border-bdr bg-white">
        <div className="px-3.5 py-3 border-b border-bdr flex items-center gap-2">
          <IconUsers size={16} strokeWidth={2.4} className="text-maroon" />
          <span className="text-sm font-bold text-txt">กลุ่มที่รับสรุปเช้า</span>
          <span className="ml-auto text-xs text-txt-soft">
            {targets.length} กลุ่ม
          </span>
        </div>

        <div className="px-3.5 py-3">
          {targets.length === 0 && (
            <div className="text-sm text-txt-soft text-center py-2 leading-relaxed">
              ยังไม่ได้ตั้งกลุ่ม — สรุปเช้าจะไม่ถูกส่ง
              <br />
              <span className="text-xs">
                เชิญบอทเข้ากลุ่ม แล้วพิมพ์ "ไอดีกลุ่ม" ในกลุ่มนั้นเพื่อดู ID
              </span>
            </div>
          )}

          {targets.map((id) => (
            <div
              key={id}
              className="flex items-center gap-2 py-1.5 border-b border-bdr/40 last:border-b-0"
            >
              <span className="flex-1 min-w-0 text-sm text-txt font-[Prompt,monospace] tracking-[0.02em] truncate">
                {id}
              </span>
              <button
                type="button"
                aria-label="ลบกลุ่ม"
                disabled={savingTargets}
                onClick={() => saveTargets(targets.filter((t) => t !== id))}
                className="w-7 h-7 rounded-[7px] bg-red-lt text-red border border-red/20 cursor-pointer flex items-center justify-center shrink-0"
              >
                <IconTrash size={12} strokeWidth={2.2} />
              </button>
            </div>
          ))}

          <div className="flex gap-2 mt-2.5">
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="วาง Group ID ที่นี่ (ขึ้นต้นด้วย C หรือ U)"
              className="flex-1 min-w-0 py-[9px] px-3 rounded-[9px] text-sm outline-none font-[Prompt,monospace] text-txt border-[1.5px] border-bdr bg-cream"
            />
            <button
              type="button"
              onClick={addTarget}
              disabled={savingTargets || !newTarget.trim()}
              className="shrink-0 px-3.5 rounded-[9px] border-none bg-maroon text-white text-sm font-bold cursor-pointer font-[inherit] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <IconPlus size={14} strokeWidth={2.5} />
              เพิ่ม
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-txt-soft leading-relaxed px-1">
        ทดสอบได้โดยพิมพ์ "ทดสอบแจ้งเตือน" ในแชทส่วนตัวกับบอท — บอทจะส่งตัวอย่าง
        มาให้ดูก่อนถึงเวลาจริง
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  title: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full text-left px-3.5 py-3 rounded-[12px] border-[1.5px] transition-all duration-150 cursor-pointer font-[inherit] active:scale-[0.99] ${
        enabled ? "bg-cream border-gold/40" : "bg-white border-bdr opacity-70"
      } ${disabled ? "cursor-wait" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors ${
            enabled ? "bg-gold-pale" : "bg-bdr"
          }`}
        >
          <Icon
            size={16}
            strokeWidth={2.4}
            className={enabled ? "text-maroon" : "text-txt-soft"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-txt">{title}</div>
          <div className="text-xs text-txt-soft mt-0.5 leading-relaxed">
            {description}
          </div>
        </div>
        <div className="shrink-0 mt-1">
          <ToggleSwitch enabled={enabled} disabled={disabled} />
        </div>
      </div>
    </button>
  );
}
