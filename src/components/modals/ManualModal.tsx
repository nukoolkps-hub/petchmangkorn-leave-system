import {
  AlertTriangle as IconAlertTriangle,
  Book as IconBook,
  CalendarDays as IconCalendar,
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  ClipboardList as IconClipboardList,
  Gift as IconGift,
  Store as IconStore,
  Sun as IconSun,
} from "lucide-react";
import { BUSINESS_RULES, COLORS, MAX_LEAVE_BONUS } from "../../constants";
import BaseModal from "../shared/BaseModal";
import { Box, Card, Section } from "../shared/Layout";

/* ─── Manual / User Guide Modal ──────────────────────────────────
   อัตราหัก/โบนัสดึงจาก BUSINESS_RULES เสมอ — ห้าม hardcode
   ไม่งั้นคู่มือกับระบบจะพูดคนละเรื่องตอนร้านปรับกฎ                     */
const WEEKDAY_FINE = BUSINESS_RULES.WEEKDAY_LEAVE_DEDUCTION;
const SUNDAY_FINE = BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION;
const WEEKDAY_BONUS = BUSINESS_RULES.NO_WEEKDAY_LEAVE_BONUS;
const TOPUP = BUSINESS_RULES.PERFECT_ATTENDANCE_TOPUP;
const BONUS = MAX_LEAVE_BONUS;

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
              การลาคิดเงินยังไง
            </span>
          }
          color={COLORS.maroon}
        >
          <p>
            <b>ทุกวันที่ลาถูกหัก</b> — ไม่มีวันลาฟรีแล้ว · คิดเป็น "วัน" ไม่ใช่จำนวนใบลา
            (ใบเดียวลายาว 3 วัน = 3 วัน)
          </p>
          <ul className="mt-1.5">
            <li>
              ลา <b>วันธรรมดา</b> → หัก{" "}
              <b className="text-red">{WEEKDAY_FINE} บาท/วัน</b>
            </li>
            <li>
              ลา <b>วันอาทิตย์</b> → หัก{" "}
              <b className="text-red">{SUNDAY_FINE} บาท/วัน</b>
            </li>
            <li>
              ลา <b>วันที่ร้านปิด</b> → ไม่นับ ไม่หัก
            </li>
          </ul>

          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <div className="flex items-center gap-1.5 text-maroon font-bold mb-1">
              <IconGift size={14} strokeWidth={2.4} />
              โบนัส 2 ก้อน (คิดจากทั้งรอบ)
            </div>
            <ul>
              <li>
                <b>ไม่ลาวันธรรมดาเลย</b> → ได้เพิ่ม{" "}
                <b className="text-green">+{WEEKDAY_BONUS} บาท</b>
                <br />
                <span className="text-xs text-txt-soft">
                  ลาวันอาทิตย์ไม่ทำให้เสียก้อนนี้
                </span>
              </li>
              <li>
                <b>ไม่ลาเลยทั้งรอบ</b> → ได้ top up อีก{" "}
                <b className="text-green">+{TOPUP} บาท</b> (รวมเป็น{" "}
                <b className="text-green">
                  +{BONUS.toLocaleString("th-TH")} บาท
                </b>
                )
                <br />
                <span className="text-xs text-txt-soft">
                  ลาวันร้านปิดไม่ทำให้เสียโบนัส
                </span>
              </li>
            </ul>
          </Box>

          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <div className="text-maroon font-bold mb-1">ตัวอย่างทั้งรอบ</div>
            <ul className="text-xs leading-[1.9]">
              <li>
                ไม่ลาเลย →{" "}
                <b className="text-green">+{BONUS.toLocaleString("th-TH")}</b>
              </li>
              <li>
                ลาอาทิตย์ 1 วัน → −{SUNDAY_FINE} +{WEEKDAY_BONUS} ={" "}
                <b className="text-red">−{SUNDAY_FINE - WEEKDAY_BONUS}</b>
              </li>
              <li>
                ลาวันธรรมดา 1 วัน → <b className="text-red">−{WEEKDAY_FINE}</b>{" "}
                (เสียโบนัสทั้ง 2 ก้อนด้วย)
              </li>
              <li>
                ลาวันธรรมดา 2 + อาทิตย์ 1 →{" "}
                <b className="text-red">
                  −{(WEEKDAY_FINE * 2 + SUNDAY_FINE).toLocaleString("th-TH")}
                </b>
              </li>
            </ul>
          </Box>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarClock size={16} strokeWidth={2.4} />
              รอบจ่ายเงินเดือน — ทำไมไม่ใช่ "เดือน"
            </span>
          }
          color={COLORS.maroon}
        >
          <p>
            ร้านคิดเงินเดือน <b>ก่อนสิ้นเดือน</b> ได้ · ADMIN จะกด "ปิดรอบ" แล้วเลือกวันตัด
            เช่นวันที่ 27
          </p>
          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <p className="text-xs leading-[1.9]">
              รอบ ส.ค. = <b>28 ก.ค. → 27 ส.ค.</b>
              <br />
              รอบ ก.ย. = <b>28 ส.ค. → 27 ก.ย.</b>
            </p>
          </Box>
          <ul>
            <li>
              <b>ลาหลังวันตัด ยกไปนับรอบถัดไป</b> — เช่นปิดรอบวันที่ 27 แล้วลา วันที่ 29
              จะไปนับในรอบหน้า ไม่ใช่รอบที่จ่ายไปแล้ว
            </li>
            <li>
              <b>ค่าหัก · โบนัส คิดตามรอบ</b> ไม่ใช่เดือนปฏิทิน
            </li>
            <li>
              วันตัดไม่เท่ากันทุกเดือนก็ได้ · เดือนที่ ADMIN ยังไม่ปิดรอบ จะนับถึงสิ้นเดือนตามปกติ
            </li>
            <li>
              <b>ปิดรอบแล้ว = ล็อกยอด</b> — ระบบเก็บยอดหัก/โบนัสของทุกคน ณ วันที่กดปิดรอบไว้
              ถ้าหลังจากนั้นมีการแก้ปฏิทินร้านหรือใบลาย้อนหลัง ยอดของรอบที่จ่ายไปแล้ว{" "}
              <b>จะไม่ขยับตาม</b>
            </li>
          </ul>
          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <p className="text-xs leading-[1.9]">
              ถ้ามีการแก้ย้อนหลังจนยอดสดไม่ตรงกับที่ล็อกไว้ ตารางสรุปจะขึ้น
              <b>แถบแดงเตือน</b> พร้อมบอกว่าใครขยับจากเท่าไหร่เป็นเท่าไหร่ · ADMIN
              เลือกได้ว่าจะคงยอดเดิมที่จ่ายไปแล้ว หรือกด <b>"ยึดยอดใหม่"</b> เพื่อล็อกทับ
              <br />
              กด <b>"เปิดรอบกลับ"</b> ยอดที่ล็อกไว้จะถูกลบ กลับไปคิดสดตามปกติ
            </p>
          </Box>
          <p className="mt-1.5 text-xs text-txt-soft">
            การ์ดสรุปหน้าแรกจะเขียนช่วงวันของรอบไว้ให้ (เช่น "รอบ 28 ก.ค. – 27 ส.ค.")
            ถ้ารอบไม่ตรงกับเดือนปฏิทิน
          </p>
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
                ลาวันไหนก็ <b>หัก</b>{" "}
                <b className="text-red">{WEEKDAY_FINE} บาท/วัน</b> ไม่มีวันฟรี
              </li>
              <li>
                ลาแม้วันเดียวก็ <b>เสียโบนัสทั้ง 2 ก้อน</b> (
                <b className="text-green">
                  {BONUS.toLocaleString("th-TH")} บาท
                </b>
                )
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
                <b>นับแยก</b> คนละอัตรากับวันธรรมดา —{" "}
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
                การ์ด "การลารอบนี้"
              </span>
            }
            color={COLORS.text}
          >
            <ul>
              <li>
                นับ <b>เฉพาะวันที่ร้านเปิด</b> · แยกป้ายวันธรรมดากับวันอาทิตย์ เพราะคนละอัตรา
              </li>
              <li>โชว์ยอดสุทธิของรอบ (ค่าหัก + โบนัส) เป็นตัวเลขใหญ่มุมขวา</li>
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
              <li className="text-xs text-txt-soft">
                นับตาม <b>เดือนปฏิทิน</b> ไม่ใช่รอบจ่าย — ถ้ารอบไม่ตรงเดือน
                ตัวเลขนี้กับการ์ดสรุปจะต่างกันได้
              </li>
            </ul>
          </Card>
          <p className="mt-1.5 text-xs text-txt-soft">
            <b>ตัวอย่าง:</b> เดือนนี้ลากิจ วันธรรมดา 5 + อาทิตย์ 1 → การ์ดสรุปโชว์ <b>5</b>{" "}
            · ชิปลากิจโชว์ <b>6</b> (ถูกต้องทั้งคู่)
          </p>
          <Box bg={COLORS.creamDark} border={`${COLORS.gold}40`}>
            <div className="flex items-center gap-1.5 text-maroon font-bold mb-1">
              <IconSun size={14} strokeWidth={2.4} />
              ในประวัติการลา — ป้าย "อาทิตย์ −{SUNDAY_FINE}"
            </div>
            <p>
              ใบลาที่ตรง/คร่อม <b>วันอาทิตย์ที่ร้านเปิด</b> จะมีป้าย{" "}
              <b>"อาทิตย์ −{SUNDAY_FINE}"</b> เตือนว่าวันนั้นถูกหัก {SUNDAY_FINE} บาท
              (คนละอัตรากับวันธรรมดา)
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
              ถ้า ADMIN กำหนด "เสาร์เปิดพิเศษ" → <b>ลาเสาร์นั้นนับเหมือนวันธรรมดา</b> (หัก{" "}
              {WEEKDAY_FINE} บาท/วัน เหมือนวันธรรมดา)
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
              <b>ลากิจ</b> — ลาล่วงหน้าได้ ไม่ติดเพดาน 2 อาทิตย์เหมือนลาป่วย
              (คิดค่าหักเหมือนกัน)
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
