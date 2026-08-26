import {
  AlertTriangle as IconAlertTriangle,
  Book as IconBook,
  CalendarDays as IconCalendar,
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  ClipboardList as IconClipboardList,
  Store as IconStore,
  Sun as IconSun,
} from "lucide-react";
import { BUSINESS_RULES, COLORS } from "../../constants";
import BaseModal from "../shared/BaseModal";
import { Box, Card, Section } from "../shared/Layout";

/* ─── Manual / User Guide Modal ──────────────────────────────────
   ตัวเลขโควต้า/อัตราหักดึงจาก BUSINESS_RULES เสมอ — ห้าม hardcode
   ไม่งั้นคู่มือกับระบบจะพูดคนละเรื่องตอนร้านปรับกฎ                     */
const QUOTA = BUSINESS_RULES.WEEKDAY_LEAVE_QUOTA;
const WEEKDAY_FINE = BUSINESS_RULES.OVER_QUOTA_WEEKDAY_DEDUCTION;
const SUNDAY_FINE = BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION;

export default function ManualModal({ onClose }) {
  return (
    <BaseModal
      onClose={onClose}
      maxWidthClass="max-w-[560px]"
      contentClassName="px-5.5 pt-6 pb-7"
    >
      {/* header */}
      <div className="flex items-center gap-3 mb-4.5">
        <div className="w-[46px] h-[46px] rounded-xl bg-linear-135 from-gold to-gold-lt flex items-center justify-center shadow-[0_4px_14px_rgba(201,151,58,0.25)]">
          <IconBook size={22} color="#fff" strokeWidth={2.2} />
        </div>
        <div className="flex-1">
          <div className="font-extrabold text-lg text-txt">คู่มือการใช้งาน</div>
          <div className="text-sm text-txt-soft mt-0.5">
            ห้างทองเพชรมังกร · ระบบการลา
          </div>
        </div>
      </div>

      {/* content */}
      <div className="text-sm text-txt-mid leading-[1.8] animate-[fadeIn_0.18s_ease-out]">
        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconClipboardList size={16} strokeWidth={2.4} />
              โควต้าการลา
            </span>
          }
          color={COLORS.maroon}
        >
          <p>
            ทุกคนได้โควต้า <b>ลากิจ + ลาป่วย รวม {QUOTA} วัน/เดือน</b> (เฉพาะวันธรรมดา)
          </p>
          <ul className="mt-1.5">
            <li>
              ลาวันธรรมดา <b>เกินโควต้า</b> → หัก{" "}
              <b className="text-red">{WEEKDAY_FINE} บาท/วัน</b>
            </li>
            <li>
              ลา <b>วันอาทิตย์</b> → หัก{" "}
              <b className="text-red">{SUNDAY_FINE} บาท/วัน ทันที</b> ตั้งแต่วันแรก
              (โควต้าไม่ช่วย)
            </li>
            <li>
              ลา <b>วันที่ร้านปิด</b> → ไม่นับ ไม่หัก
            </li>
          </ul>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendar size={16} strokeWidth={2.4} />
              วันลาแบ่งเป็น 2 ประเภท
            </span>
          }
          color={COLORS.maroon}
        >
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar size={14} strokeWidth={2.4} />
                วันธรรมดา (จันทร์-ศุกร์)
              </span>
            }
            color={COLORS.text}
          >
            <ul>
              <li>
                มี <b>โควต้า {QUOTA} วัน/เดือน</b>
              </li>
              <li>
                ลาเกินโควต้า → หัก <b className="text-red">{WEEKDAY_FINE} บาท</b>{" "}
                ต่อวันที่เกิน + ขึ้นสถานะ <b className="text-red">เกินโควต้า</b> ให้ ADMIN
                เห็น
              </li>
            </ul>
          </Card>
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <IconSun size={14} strokeWidth={2.4} />
                วันอาทิตย์
              </span>
            }
            color={COLORS.text}
          >
            <ul>
              <li>
                <b>นับแยก</b> ไม่กินโควต้าวันธรรมดา — แต่{" "}
                <b className="text-red">หัก {SUNDAY_FINE} บาท/วัน ทันที</b>{" "}
                ตั้งแต่วันแรก
              </li>
              <li>
                ตอนยื่นลาที่มีวันอาทิตย์ ระบบจะให้ <b>ติ๊กรับทราบยอดหักก่อน</b> ถึงจะกดส่งได้
              </li>
              <li className="text-xs text-txt-soft">
                ยกเว้น <b>อาทิตย์ที่ ADMIN ปิดพิเศษ</b> → ร้านปิด · ลาไม่นับ ไม่หัก
                (ดูหัวข้อด้านล่าง)
              </li>
            </ul>
          </Card>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarRange size={16} strokeWidth={2.4} />
              ตัวเลขวันลาบนหน้าแรก — นับ 2 แบบ
            </span>
          }
          color={COLORS.maroon}
        >
          <p>
            หน้าแรกโชว์จำนวนวันลา 2 ที่ · <b>นับคนละแบบ</b> — ถ้าเลขไม่เท่ากัน{" "}
            <b className="text-green">ไม่ใช่ error</b> (เกิดเมื่อมีลาวันอาทิตย์)
          </p>
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <IconClipboardList size={14} strokeWidth={2.4} />
                การ์ด "โควต้าการลา X / {QUOTA} วัน"
              </span>
            }
            color={COLORS.text}
          >
            <ul>
              <li>
                นับ <b>เฉพาะวันธรรมดา</b> ที่ใช้โควต้า · <b>วันอาทิตย์ไม่นับ</b> (หัก{" "}
                {SUNDAY_FINE} บาท แยกต่างหาก)
              </li>
              <li>ไว้ดูว่าเหลือโควต้ากี่วัน + โชว์ยอดที่ถูกหักเดือนนี้</li>
            </ul>
          </Card>
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar size={14} strokeWidth={2.4} />
                ชิป "ลากิจ / ลาป่วย เดือนนี้ X วัน"
              </span>
            }
            color={COLORS.text}
          >
            <ul>
              <li>
                นับ <b>จำนวนวันลาจริง</b> แยกตามประเภท
              </li>
              <li>
                <b>รวมวันอาทิตย์ที่ร้านเปิด</b> + เสาร์เปิดพิเศษ · <b>ตัดวันร้านปิด</b> ออก
              </li>
              <li>
                เป็นแค่ตัวบอกจำนวนวัน · <b>ไม่เกี่ยวกับการคิดเงิน</b>
              </li>
            </ul>
          </Card>
          <p className="mt-1.5 text-xs text-txt-soft">
            <b>ตัวอย่าง:</b> เดือนนี้ลากิจ วันธรรมดา 5 + อาทิตย์ 1 → การ์ดโควต้าโชว์{" "}
            <b>5</b> · ชิปลากิจโชว์ <b>6</b> (ถูกต้องทั้งคู่)
          </p>
          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <div className="flex items-center gap-1.5 text-maroon font-bold mb-1">
              <IconSun size={14} strokeWidth={2.4} />
              ในประวัติการลา — ป้าย "อาทิตย์ −{SUNDAY_FINE}"
            </div>
            <p>
              ใบลาที่ตรง/คร่อม <b>วันอาทิตย์ที่ร้านเปิด</b> จะมีป้าย{" "}
              <b>"อาทิตย์ −{SUNDAY_FINE}"</b> เตือนว่าวันนั้นถูกหัก {SUNDAY_FINE} บาท
              และไม่กินโควต้าวันธรรมดา
            </p>
          </Box>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconStore size={16} strokeWidth={2.4} />
              วันเสาร์ — ร้านปกติหยุด
            </span>
          }
          color={COLORS.maroon}
        >
          <ul>
            <li>
              ร้าน <b>หยุดวันเสาร์</b> เป็นค่าเริ่มต้น — <b>ลาเสาร์ปกติไม่นับ</b>{" "}
              (ร้านปิดอยู่แล้ว)
            </li>
            <li>
              ถ้า ADMIN กำหนด "เสาร์เปิดพิเศษ" → <b>ลาเสาร์นั้นนับเหมือนวันธรรมดา</b>{" "}
              (เข้าโควต้า {QUOTA} วัน/เดือน · เกินหัก {WEEKDAY_FINE} บาท/วัน)
            </li>
            <li>
              ถ้า ADMIN กำหนด "วันธรรมดาปิดพิเศษ" (อบรม, หยุดยาว ฯลฯ) →{" "}
              <b>ลาวันนั้นไม่นับ</b>
            </li>
            <li>
              ถ้า ADMIN กำหนด "อาทิตย์ปิดพิเศษ" → อาทิตย์นั้นกลายเป็นวันร้านปิด ·{" "}
              <b>ลาวันนั้นไม่นับ · ไม่หัก</b> (ปกติอาทิตย์เปิดหัก {SUNDAY_FINE} บาท)
            </li>
          </ul>

          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <div className="flex items-center gap-1.5 text-maroon font-bold mb-1.5">
              <IconAlertTriangle size={14} strokeWidth={2.4} />
              ADMIN: ลบวันเปิด/ปิดพิเศษที่มีคนลา
            </div>
            <p>
              ถ้า ADMIN จะลบ "เสาร์เปิดพิเศษ" หรือ "วันธรรมดาปิดพิเศษ"{" "}
              <b>ที่มีคนลาในวันนั้นอยู่</b> ระบบจะ <b>ลบใบลาในวันนั้นออกให้ก่อนอัตโนมัติ</b>{" "}
              แล้วค่อยลบวันออกจากปฏิทิน (ทำในขั้นตอนเดียว)
            </p>
            <p className="mt-1.5 text-xs text-txt-soft">
              · กล่องยืนยันจะโชว์รายชื่อ + ช่วงวันของทุกใบลาก่อน — ใบที่ครอบหลายวัน
              จะถูกลบทั้งใบ (ไม่ใช่แค่วันเดียว)
              <br />· เหตุผล: กันใบลาค้างอยู่ในวันที่เปลี่ยนสถานะแล้ว — ทำให้ยอดวันลา
              กับยอดหักตรงกับปฏิทินร้านเสมอ
            </p>
          </Box>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarClock size={16} strokeWidth={2.4} />
              กฎการยื่นลา
            </span>
          }
          color={COLORS.maroon}
        >
          <ul>
            <li>
              <b>ลาวันเดิมซ้ำไม่ได้</b> — วันที่เลือกห้ามทับกับใบลาที่ยื่นไว้แล้ว
            </li>
            <li>
              <b>ลาป่วยล่วงหน้าได้ไม่เกิน 2 อาทิตย์</b> — เลือกวันได้ไม่เกิน 14 วันนับจากวันนี้
            </li>
            <li>
              <b>ลากิจ</b> — ลาล่วงหน้าได้ ไม่ติดเพดาน 2 อาทิตย์เหมือนลาป่วย (ยังอยู่ในโควต้า{" "}
              {QUOTA} วัน/เดือนเหมือนเดิม)
            </li>
          </ul>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarRange size={16} strokeWidth={2.4} />
              ปฏิทินทีม (หน้าแรก)
            </span>
          }
          color={COLORS.maroon}
        >
          <p>
            หน้าแรกมี <b>ปฏิทินทีม</b> — เห็นภาพรวมทั้งเดือนว่าใครลาวันไหน + วันไหนร้านเปิด/ปิด
          </p>
          <ul>
            <li>
              <b>จุดสี</b> = ใบลาของแต่ละคน (สีตามประเภทลา) · แตะวันเพื่อดูรายชื่อ
            </li>
            <li>
              <b>วันเทา + "ปิด"</b> = ร้านปิด (เสาร์ปกติ · จ-ศ/อาทิตย์ ปิดพิเศษ) —
              ลาวันนั้นไม่นับ
            </li>
            <li>
              <b>วันเขียว + "เปิด"</b> = เสาร์เปิดพิเศษ (มาทำงานเหมือนวันธรรมดา)
            </li>
          </ul>
          <p className="mt-1.5 text-xs text-txt-soft">
            ใช้กันลาทับวันเพื่อนร่วมงานมากเกินไป + วางแผนวันหยุดของทีมได้
          </p>
        </Section>
      </div>

      {/* close */}
      <button
        onClick={onClose}
        className="w-full p-3.5 mt-3.5 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
      >
        ปิด
      </button>
    </BaseModal>
  );
}
