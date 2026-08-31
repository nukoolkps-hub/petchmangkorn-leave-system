/* ─── PeriodSettlementTable — สรุปเงินของทั้งรอบ ทุกคนในตารางเดียว ──────
   ตอบโจทย์ "อยากเห็นสรุปทั้งหมดว่าใครได้โบนัส หรือโดนหักเท่าไหร่"

   ต่างจากลิสต์ด้านล่างของ LeaveSummaryPanel ตรงที่โชว์ "ทุกคน" รวมคนที่
   ไม่มีใบลาเลย (ซึ่งคือกลุ่มที่ได้โบนัส) — ลิสต์นั้นโชว์เฉพาะคนที่มีใบลา

   ตัวเลขทุกช่องมาจาก getLeaveDeduction/hasPerfectAttendance ที่ panel
   คำนวณมาแล้ว component นี้แค่ render + ทำข้อความสำหรับคัดลอก            */

import { Check as IconCheck, Copy as IconCopy } from "lucide-react";
import { useState } from "react";
import { fmtShort } from "../../utils/dateUtils";
import { formatBaht } from "../../utils/format";
import type { LeaveDeduction } from "../../utils/leaveUtils";
import type { LeavePeriod } from "../../utils/payrollPeriod";

export interface SettlementRow {
  id: string;
  name: string;
  deduction: LeaveDeduction;
  bonus: number;
  net: number;
}

interface Props {
  rows: SettlementRow[];
  period: LeavePeriod;
  totals: { deducted: number; bonus: number; net: number };
  showToast: (msg: string) => void;
}

/** ข้อความสรุปสำหรับวางในไลน์/สมุดบัญชี — ไม่ต้องจดมือ */
function buildCopyText(
  rows: SettlementRow[],
  period: LeavePeriod,
  totals: Props["totals"],
): string {
  const lines = [
    `สรุปรอบ ${fmtShort(period.start)} – ${fmtShort(period.end)}`,
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

export default function PeriodSettlementTable({
  rows,
  period,
  totals,
  showToast,
}: Props) {
  const [copied, setCopied] = useState(false);
  if (rows.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildCopyText(rows, period, totals));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต");
    }
  }

  return (
    <div className="rounded-xl border border-bdr overflow-hidden mb-3">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-cream border-b border-bdr">
        <span className="text-sm font-bold text-maroon">สรุปเงินทั้งรอบ</span>
        <button
          type="button"
          onClick={copy}
          className="px-2.5 py-1 rounded-[8px] border-[1.5px] border-bdr bg-white text-txt-mid text-xs font-semibold cursor-pointer font-[inherit] inline-flex items-center gap-1.5"
        >
          {copied ? (
            <IconCheck size={12} strokeWidth={2.6} className="text-green" />
          ) : (
            <IconCopy size={12} strokeWidth={2.4} />
          )}
          {copied ? "คัดลอกแล้ว" : "คัดลอกสรุป"}
        </button>
      </div>

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
                <td className="px-3.5 py-2 font-semibold text-txt">{r.name}</td>
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
                  {r.net > 0 ? "+" : ""}
                  {r.net.toLocaleString("th-TH")}
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
                {totals.net > 0 ? "+" : ""}
                {totals.net.toLocaleString("th-TH")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
