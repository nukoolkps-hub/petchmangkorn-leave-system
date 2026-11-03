import {
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  UserCheck as IconUserCheck,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { DutyAssignmentsSnapshot } from "../../firebase/dutyAssignments";
import type { Duty, LeaveEntry, StoreCalendar } from "../../types";
import AvatarCircle from "../shared/AvatarCircle";
import { MemphisCornerSticker } from "../shared/MemphisPattern";

/* ปฏิทินหน้าที่ใช้คำนวณหนัก (forecast ถึงสิ้นปี) และเปิดเฉพาะตอนกดปุ่ม →
   lazy chunk ไม่ให้หน้าแรกของพนักงานต้องโหลดก่อน */
const DutyForecastModal = lazy(() => import("../modals/DutyForecastModal"));

/* ─── หน้าที่วันนี้ — สำหรับ HomeTab พนักงาน ────────────────────────
   ใช้ server-computed snapshot · ฝั่งพนักงานอ่าน employees ของคนอื่นไม่ได้
   เพราะ Firestore rules → Cloud Function compute ส่วนกลาง ส่ง safe
   projection (id/name/nickname/avatar/displayOrder เท่านั้น ไม่มี
   lineUserId)                                                            */
export default function DutyTodayCard({
  duties,
  snapshot,
  profileId,
  allLeaves,
  storeCalendar,
}: {
  duties: Duty[];
  snapshot: DutyAssignmentsSnapshot;
  profileId: string | null;
  allLeaves: LeaveEntry[];
  storeCalendar?: StoreCalendar | null;
}) {
  const [showForecast, setShowForecast] = useState(false);
  const assignments = snapshot.assignments;
  // empById จาก pool members ของทุก duty รวมกัน (snapshot self-contained)
  const empById = new Map<
    string,
    {
      name: string;
      nickname: string;
      avatar: string;
      avatarType: "text" | "emoji" | "image";
      avatarImageUrl: string | null;
    }
  >();
  for (const a of assignments) {
    for (const m of a.pool) empById.set(m.id, m);
  }
  // รวมสมาชิกจาก dutyPools ด้วย — pool ของหน้าที่ที่วันนี้ไม่มี entry
  for (const info of Object.values(snapshot.dutyPools || {})) {
    for (const m of info.pool) empById.set(m.id, m);
  }
  const myDuties = assignments.filter((a) => a.actualEmpId === profileId);

  return (
    <div className="relative overflow-hidden bg-white rounded-[18px] px-5 py-4.5 shadow-[0_2px_14px_rgba(90,30,10,0.08)] mb-3 border-[1.5px] border-bdr">
      <MemphisCornerSticker position="tr" tone="gold" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <IconCalendarClock
            size={18}
            strokeWidth={2.4}
            className="text-maroon"
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-maroon text-base">หน้าที่วันนี้</div>
            <div className="text-sm text-txt-soft mt-0.5">
              {new Intl.DateTimeFormat("th-TH", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
                .formatToParts(new Date())
                .map((p) => (p.type === "year" ? `พ.ศ. ${p.value}` : p.value))
                .join("")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForecast(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] border border-bdr bg-cream text-maroon text-xs font-bold cursor-pointer font-[inherit] active:scale-[0.96] transition-transform"
          >
            <IconCalendarRange size={13} strokeWidth={2.4} />
            ปฏิทินหน้าที่
          </button>
        </div>

        {/* ของฉัน */}
        {myDuties.length > 0 && (
          <div className="mb-3 p-2.5 rounded-[10px] bg-gold-pale border border-gold/40">
            <div className="text-xs font-bold text-maroon mb-1.5 inline-flex items-center gap-1">
              <IconUserCheck size={12} strokeWidth={2.4} />
              ของคุณวันนี้
            </div>
            <div className="flex flex-wrap gap-2">
              {myDuties.map((a) => {
                const primary = a.primaryEmpId
                  ? empById.get(a.primaryEmpId)
                  : null;
                const isSub =
                  a.reason === "substitute_for_leave" ||
                  a.reason === "double_up";
                const isCov = a.kind === "coverage";
                return (
                  <div
                    key={`${a.dutyId}-${a.targetEmpId || ""}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-[5px] rounded-[20px] bg-maroon text-white text-sm font-semibold"
                  >
                    {a.dutyName}
                    {isCov ? (
                      <span className="text-xs opacity-80">
                        แทน {a.targetName || "—"} (ลา)
                      </span>
                    ) : (
                      isSub &&
                      primary && (
                        <span className="text-xs opacity-80">
                          แทน {primary.nickname || primary.name} (
                          {a.primaryPulledToDuty ? "ติดหน้าที่อื่น" : "ลา"})
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* หน้าที่ของคนอื่น — exclude ตัวเอง เพราะมีในช่อง "ของคุณวันนี้" แล้ว
            + ซ่อน coverage ที่เป้าหมายไม่ลา (ไม่มีอะไรเกิดขึ้น) */}
        {(() => {
          const otherAssignments = assignments.filter(
            (a) =>
              a.actualEmpId !== profileId &&
              a.reason !== "target_present" &&
              a.reason !== "empty_target_role",
          );
          if (otherAssignments.length === 0) return null;
          return (
            <div className="flex flex-col gap-1.5">
              {myDuties.length > 0 && (
                <div className="text-xs font-bold text-txt-soft mb-0.5">
                  ของคนอื่นๆ
                </div>
              )}
              {otherAssignments.map((a) => {
                const actual = a.actualEmpId
                  ? empById.get(a.actualEmpId)
                  : null;
                const primary = a.primaryEmpId
                  ? empById.get(a.primaryEmpId)
                  : null;
                const isSub =
                  a.reason === "substitute_for_leave" ||
                  a.reason === "double_up";
                const isCov = a.kind === "coverage";
                return (
                  <div
                    key={`${a.dutyId}-${a.targetEmpId || ""}`}
                    className="flex items-center gap-2 p-2 rounded-[9px] bg-cream"
                  >
                    <div className="text-sm font-semibold text-maroon flex-1 truncate">
                      {a.dutyName}
                    </div>
                    {actual ? (
                      <>
                        <AvatarCircle
                          avatar={actual.avatar}
                          avatarType={actual.avatarType}
                          avatarImageUrl={actual.avatarImageUrl}
                          size={24}
                          fontSize={10}
                          border="none"
                        />
                        <div className="text-xs font-semibold text-txt">
                          {actual.nickname || actual.name}
                        </div>
                        {isCov ? (
                          <div className="text-[10px] text-txt-soft">
                            แทน {a.targetName || "—"} (ลา)
                          </div>
                        ) : (
                          isSub &&
                          primary && (
                            <div className="text-[10px] text-txt-soft">
                              แทน {primary.nickname || primary.name} (
                              {a.primaryPulledToDuty ? "ติดหน้าที่อื่น" : "ลา"})
                            </div>
                          )
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-txt-soft italic">
                        {a.reason === "all_on_leave"
                          ? "ทุกคนลา"
                          : a.reason === "coverage_no_candidate"
                            ? "ไม่มีคนแทน"
                            : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {showForecast && (
        <Suspense fallback={null}>
          <DutyForecastModal
            duties={duties}
            dutyAssignmentsToday={snapshot}
            allLeaves={allLeaves}
            storeCalendar={storeCalendar}
            profileId={profileId}
            onClose={() => setShowForecast(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
