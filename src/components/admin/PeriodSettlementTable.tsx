/* ─── PeriodSettlementTable — สรุปเงินของทั้งรอบ ทุกคนในตารางเดียว ──────
   ตอบโจทย์ "อยากเห็นสรุปทั้งหมดว่าใครได้โบนัส หรือโดนหักเท่าไหร่"

   ต่างจากลิสต์ด้านล่างของ LeaveSummaryPanel ตรงที่โชว์ "ทุกคน" รวมคนที่
   ไม่มีใบลาเลย (ซึ่งคือกลุ่มที่ได้โบนัส) — ลิสต์นั้นโชว์เฉพาะคนที่มีใบลา

   รอบที่ปิดแล้วโชว์ "ยอดที่ล็อกไว้" (snapshot ตอนกดปิดรอบ) ไม่ใช่ยอดสด
   ถ้ายอดสดขยับไปจากที่ล็อก (มีคนแก้ใบลา/ปฏิทินร้านย้อนหลัง) จะขึ้นแถบ
   เตือนพร้อมปุ่มให้ admin ตัดสินใจว่าจะยึดยอดใหม่ไหม                     */

import {
  Check as IconCheck,
  Copy as IconCopy,
  LockKeyhole as IconLock,
  RefreshCw as IconRelock,
  AlertTriangle as IconWarn,
} from "lucide-react";
import { useState } from "react";
import { fmtShort, toYMD } from "../../utils/dateUtils";
import { formatBaht } from "../../utils/format";
import type { LeavePeriod } from "../../utils/payrollPeriod";
import type {
  SettlementDrift,
  SettlementRow,
  SettlementTotals,
} from "../../utils/periodSettlement";
import Spinner from "../shared/Spinner";

interface Props {
  rows: SettlementRow[];
  period: LeavePeriod;
  totals: SettlementTotals;
  /** true = ตัวเลขชุดนี้มาจาก snapshot ที่ล็อกไว้ตอนปิดรอบ */
  locked: boolean;
  /** epoch ms ตอนกดปิดรอบ (มีเมื่อ locked) */
  lockedAt?: number;
  /** คนที่ยอดสดตอนนี้ไม่ตรงกับที่ล็อกไว้ */
  drift: SettlementDrift[];
  onRelock: () => Promise<void>;
  showToast: (msg: string) => void;
}

/** ข้อความสรุปสำหรับวางในไลน์/สมุดบัญชี — ไม่ต้องจดมือ */
function buildCopyText(
  rows: SettlementRow[],
  period: LeavePeriod,
  totals: SettlementTotals,
  locked: boolean,
): string {
  const lines = [
    `สรุปรอบ ${fmtShort(period.start)} – ${fmtShort(period.end)}${
      locked ? " (ปิดรอบแล้ว)" : ""
    }`,
    "",
    ...rows.map((r) => {
      const detail: string[] = [];
      if (r.deduction.weekdayDays > 0)
        detail.push(`ธรรมดาเกินโควต้า ${r.deduction.weekdayDays} วัน`);
      if (r.deduction.sundayDays > 0)
        detail.push(`อาทิตย์ ${r.deduction.sundayDays} วัน`);
      if (r.bonus > 0) detail.push("ไม่ลาเลย");
      const sign = r.net > 0 ? "+" : "";
      return `${r.name}: ${sign}${r.net.toLocaleString("th-TH")} บาท${
        detail.length ? ` (${detail.join(" · ")})` : ""
      }`;
    }),
    "",
    `รวมหัก ${formatBaht(totals.deducted)}`,
    `รวมโบนัส ${formatBaht(totals.bonus)}`,
    `สุทธิ ${totals.net > 0 ? "+" : ""}${totals.net.toLocaleString("th-TH")} บาท`,
  ];
  return lines.join("\n");
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("th-TH")}`;
}

/** อธิบายว่ายอดของคนนี้ขยับจากเท่าไหร่เป็นเท่าไหร่ */
function driftLabel(d: SettlementDrift): string {
  if (d.lockedNet === undefined) return `${d.name}: เพิ่งเพิ่มเข้าระบบ`;
  if (d.liveNet === undefined) return `${d.name}: ถูกลบออกจากระบบ`;
  return `${d.name}: ${signed(d.lockedNet)} → ${signed(d.liveNet)}`;
}

export default function PeriodSettlementTable({
  rows,
  period,
  totals,
  locked,
  lockedAt,
  drift,
  onRelock,
  showToast,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [relocking, setRelocking] = useState(false);
  // ไม่มีทั้งแถวและ drift = ไม่มีอะไรจะบอก · แต่ถ้ามี drift ต้องโชว์เสมอ
  // (เช่น ปิดรอบตอนยังไม่มีพนักงานสักคน แล้วเพิ่งเพิ่มคนเข้าระบบทีหลัง)
  if (rows.length === 0 && drift.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        buildCopyText(rows, period, totals, locked),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต");
    }
  }

  async function relock() {
    setRelocking(true);
    try {
      await onRelock();
      showToast("ล็อกยอดใหม่แล้ว");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "ล็อกยอดใหม่ไม่สำเร็จ");
    } finally {
      setRelocking(false);
    }
  }

  return (
    <div className="rounded-xl border border-bdr overflow-hidden mb-3">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-cream border-b border-bdr">
        <div className="min-w-0">
          <span className="text-sm font-bold text-maroon">สรุปเงินทั้งรอบ</span>
          {locked && (
            <span className="ml-1.5 text-[11px] text-green font-semibold inline-flex items-center gap-1 whitespace-nowrap">
              <IconLock size={11} strokeWidth={2.6} />
              ยอดล็อกแล้ว
              {lockedAt ? ` ${fmtShort(toYMD(new Date(lockedAt)))}` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-2.5 py-1 rounded-[8px] border-[1.5px] border-bdr bg-white text-txt-mid text-xs font-semibold cursor-pointer font-[inherit] inline-flex items-center gap-1.5"
        >
          {copied ? (
            <IconCheck size={12} strokeWidth={2.6} className="text-green" />
          ) : (
            <IconCopy size={12} strokeWidth={2.4} />
          )}
          {copied ? "คัดลอกแล้ว" : "คัดลอกสรุป"}
        </button>
      </div>

      {locked && drift.length > 0 && (
        <div className="px-3.5 py-2.5 bg-red-lt border-b border-[#C0392B30]">
          <div className="text-xs font-bold text-red inline-flex items-center gap-1.5">
            <IconWarn size={13} strokeWidth={2.4} />
            มีการแก้ย้อนหลังหลังปิดรอบ — ตารางนี้ยังเป็นยอดที่จ่ายจริง
          </div>
          <ul className="mt-1 text-[11px] text-txt-mid leading-relaxed list-none pl-0">
            {drift.map((d) => (
              <li key={d.id}>• {driftLabel(d)}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={relock}
            disabled={relocking}
            className="mt-1.5 px-2.5 py-1 rounded-[8px] border-[1.5px] border-bdr bg-white text-txt-mid text-xs font-semibold cursor-pointer font-[inherit] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {relocking ? (
              <Spinner size={12} />
            ) : (
              <IconRelock size={12} strokeWidth={2.4} />
            )}
            ยึดยอดใหม่ (ล็อกทับ)
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-txt-soft">
                <th className="text-left font-semibold px-3.5 py-2">พนักงาน</th>
                <th className="text-right font-semibold px-2 py-2">หัก</th>
                <th className="text-right font-semibold px-2 py-2">โบนัส</th>
                <th className="text-right font-semibold px-3.5 py-2">สุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-bdr">
                  <td className="px-3.5 py-2 font-semibold text-txt">
                    {r.name}
                  </td>
                  <td className="px-2 py-2 text-right text-red whitespace-nowrap">
                    {r.deduction.total > 0
                      ? `−${r.deduction.total.toLocaleString("th-TH")}`
                      : "–"}
                  </td>
                  <td className="px-2 py-2 text-right text-green whitespace-nowrap">
                    {r.bonus > 0 ? `+${r.bonus.toLocaleString("th-TH")}` : "–"}
                  </td>
                  <td
                    className={`px-3.5 py-2 text-right font-extrabold whitespace-nowrap ${
                      r.net > 0
                        ? "text-green"
                        : r.net < 0
                          ? "text-red"
                          : "text-txt-soft"
                    }`}
                  >
                    {signed(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[1.5px] border-bdr bg-cream">
                <td className="px-3.5 py-2 font-bold text-maroon">รวม</td>
                <td className="px-2 py-2 text-right font-bold text-red whitespace-nowrap">
                  {totals.deducted > 0
                    ? `−${totals.deducted.toLocaleString("th-TH")}`
                    : "–"}
                </td>
                <td className="px-2 py-2 text-right font-bold text-green whitespace-nowrap">
                  {totals.bonus > 0
                    ? `+${totals.bonus.toLocaleString("th-TH")}`
                    : "–"}
                </td>
                <td
                  className={`px-3.5 py-2 text-right font-extrabold whitespace-nowrap ${
                    totals.net > 0
                      ? "text-green"
                      : totals.net < 0
                        ? "text-red"
                        : "text-txt-soft"
                  }`}
                >
                  {signed(totals.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
