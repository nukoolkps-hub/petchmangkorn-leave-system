/* ─── App — Orchestrator ────────────────────────────────────────
   All business logic lives in hooks; all UI in focused components.
   This file wires everything together.                            */

import {
  AlertTriangle as IconAlertTriangle,
  Check as IconCheck,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomeTab from "./components/home/HomeTab";
import RequestTab from "./components/home/RequestTab";
import SuccessScreen from "./components/home/SuccessScreen";
import type { AdminSectionId } from "./components/layout/adminNavConfig";
import BottomNav from "./components/layout/BottomNav";
import DesktopHeader from "./components/layout/DesktopHeader";
import MobileHeader from "./components/layout/MobileHeader";
import { getNavItems } from "./components/layout/navConfig";
import Sidebar from "./components/layout/Sidebar";
import ProfileSetupModal from "./components/modals/ProfileSetupModal";
import BootLoadingScreen, {
  clearBootReloadGuard,
} from "./components/shared/BootLoadingScreen";
import Diamond from "./components/shared/Diamond";
import { COLORS } from "./constants";
import { useAuth } from "./contexts/AuthContext";
import useAppData from "./data/useAppData";
import useLeaveForm from "./hooks/useLeaveForm";
import useProfile from "./hooks/useProfile";

/* ─── Lazy chunks ─────────────────────────────────────────────────
   AdminPanel ลาก section ทั้ง 8 + ตารางสรุปเงินมาด้วย · ManualModal เป็น
   หน้าข้อความยาว · ทั้งคู่ "ไม่ได้ใช้ตอนเปิดแอป" — พนักงานทุกคนเคยต้อง
   โหลดทั้งก้อนก่อนหน้าแรกจะขึ้น ซึ่งคือเวลาที่เสียไปบนหน้า loading พอดี */
const AdminPanel = lazy(() => import("./components/admin/AdminPanel"));
const ManualModal = lazy(() => import("./components/modals/ManualModal"));

/** fallback ระหว่างโหลด chunk — เตี้ย ๆ ไม่กระโดดทั้งหน้า */
function ChunkFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-[3px] border-bdr border-t-gold animate-spin" />
    </div>
  );
}

function UnlinkedEmployeeScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 bg-cream font-sans">
      <div className="w-full max-w-[420px] px-5 py-6 bg-white rounded-[18px] border border-gold/25 text-center shadow-[0_8px_24px_rgba(90,30,10,0.10)]">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-gold-pale flex items-center justify-center">
          <Diamond size={28} color={COLORS.maroon} />
        </div>
        <div className="text-base font-bold text-maroon mb-2">
          ยังไม่พบข้อมูลพนักงาน
        </div>
        <div className="text-sm text-txt-mid leading-relaxed">
          บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลพนักงานใน Firebase
          กรุณาติดต่อผู้ดูแลระบบให้สร้างหรือผูก LINE User ID ก่อนใช้งาน
        </div>
        <button
          onClick={onSignOut}
          className="mt-5 px-5 py-2.5 rounded-[10px] border-none bg-maroon text-white font-bold cursor-pointer font-[inherit] text-sm"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

/* ─── Main App ─────────────────────────────────────────────────── */
export default function LeaveApp() {
  /* ─── Router ───────────────────────────────────────────────── */
  const location = useLocation();
  const tab = location.pathname.replace("/", "") || "home";

  /* ─── Auth ─────────────────────────────────────────────────── */
  const { user: authUser, signOut: authSignOut } = useAuth();

  /* ─── Admin claim state ────────────────────────────────────── */
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  useEffect(() => {
    let active = true;
    if (!authUser) {
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    setAdminChecked(false);
    authUser
      .getIdTokenResult()
      .then((result) => {
        if (active) setIsAdmin(result.claims.admin === true);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      })
      .finally(() => {
        if (active) setAdminChecked(true);
      });
    return () => {
      active = false;
    };
  }, [authUser]);

  /* ─── Toast ────────────────────────────────────────────────── */
  const [toastMsg, setToastMsg] = useState("");
  const [toastClosing, setToastClosing] = useState(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastClosing(false);
    setTimeout(() => setToastClosing(true), 2600);
    setTimeout(() => {
      setToastMsg("");
      setToastClosing(false);
    }, 2800);
  }

  /* ─── Data layer (Firebase) ────────────────────────────────── */
  const {
    allLeaves,
    employeeDirectory,
    storeCalendar,
    periodCutoffs,
    periodSnapshots,
    loading,
    leavesLoading,
    error,
    addLeave: addLeaveAction,
    deleteLeave: deleteLeaveAction,
    updateEmployee,
    deleteEmployee,
    reorderEmployees,
    updateStoreCalendar: updateStoreCalendarAction,
    closePayrollPeriod,
    reopenPayrollPeriod,
    relockPayrollPeriod,
    finalizePayrollPeriod,
  } = useAppData({
    authUid: authUser?.uid || "",
    isAdmin,
    onWarning: showToast,
  });

  /* ─── Profile hook ─────────────────────────────────────────── */
  const {
    profile,
    showEditProfile,
    setShowEditProfile,
    handleProfileSave,
    currentEmployee,
    employeeId,
  } = useProfile({
    authUser,
    employeeDirectory,
    isAdmin,
    updateEmployee,
    showToast,
  });
  const currentEmployeeId = employeeId || "";

  /* ─── Leave form hook ──────────────────────────────────────── */
  const leaveForm = useLeaveForm({
    profileName: profile?.name || null,
    allLeaves,
    employeeDirectory,
    storeCalendar,
    addLeave: addLeaveAction,
    deleteLeave: deleteLeaveAction,
    authUid: currentEmployeeId,
    showToast,
  });

  /* ─── Admin section state (lifted up so the Sidebar can drive it) */
  const [adminSection, setAdminSection] =
    useState<AdminSectionId>("calendar-view");
  function tryChangeAdminSection(next: AdminSectionId) {
    if (next === adminSection) return;
    setAdminSection(next);
  }

  const [showManual, setShowManual] = useState(false);

  /* ─── Employee handlers (admin) ────────────────────────────── */
  async function handleUpdateRole(id: string, field: string, value: unknown) {
    try {
      await updateEmployee(id, { [field]: value });
      showToast("บันทึกข้อมูลแล้ว");
    } catch (err) {
      console.error("[Admin] update employee failed:", err);
    }
  }

  async function handleDeleteEmployee(id: string) {
    try {
      await deleteEmployee(id);
      showToast("ลบพนักงานแล้ว");
    } catch (err) {
      console.error("[Admin] delete employee failed:", err);
    }
  }

  /* ─── Nav items ────────────────────────────────────────────── */
  const navItems = getNavItems({ isAdmin });

  /* บูตสำเร็จแล้ว → ล้าง flag auto-reload ให้ครั้งหน้ากู้ตัวเองได้อีก
     (ล้างที่นี่ไม่ใช่ใน cleanup ของ BootLoadingScreen เพราะ boot ปกติมีหน้า
     loading 2 จอต่อกัน จอแรก unmount จะไปล้าง flag ให้จอสอง reload ได้อีก) */
  const booted = !loading && adminChecked && !error;
  useEffect(() => {
    if (booted) clearBootReloadGuard();
  }, [booted]);

  /* ─── Loading & Error states ───────────────────────────────── */
  if (loading || !adminChecked) {
    return <BootLoadingScreen message="เชื่อมต่อ Firebase..." />;
  }
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6 bg-cream font-sans">
        <div className="max-w-[400px] px-5 py-6 bg-white rounded-[18px] border border-red/25 text-center shadow-[0_8px_24px_rgba(192,57,43,0.12)]">
          <div className="flex justify-center mb-2">
            <IconAlertTriangle size={36} strokeWidth={2} className="text-red" />
          </div>
          <div className="text-base font-bold text-red mb-2">
            เชื่อมต่อข้อมูลไม่สำเร็จ
          </div>
          <div className="text-sm text-txt-mid leading-relaxed">
            {error.message || "ไม่ทราบสาเหตุ"}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-5 py-2.5 rounded-[10px] border-none bg-maroon text-white font-bold cursor-pointer font-[inherit] text-sm"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }
  if (!currentEmployee && !isAdmin) {
    return <UnlinkedEmployeeScreen onSignOut={authSignOut} />;
  }

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <div className="leave-app-root animate-[fadeIn_0.25s_ease-out]">
      {/* ══ SIDEBAR (desktop only) ══ */}
      <Sidebar
        profile={profile}
        isAdmin={isAdmin}
        navItems={navItems}
        onEditProfile={() => {
          if (!isAdmin) setShowEditProfile(true);
        }}
        onSignOut={authSignOut}
        adminSection={isAdmin ? adminSection : undefined}
        onAdminSectionChange={isAdmin ? tryChangeAdminSection : undefined}
      />

      {/* ══ MAIN CONTENT ══ */}
      <div className="leave-main">
        <DesktopHeader
          profile={profile}
          isAdmin={isAdmin}
          onShowManual={() => setShowManual(true)}
        />

        <MobileHeader
          profile={profile}
          isAdmin={isAdmin}
          onEditProfile={() => {
            if (!isAdmin) setShowEditProfile(true);
          }}
          onShowManual={() => setShowManual(true)}
        />

        {/* ── Scrollable Body ── */}
        <div className="leave-content flex-1 px-4 pt-4.5 pb-[90px]">
          {/* key=tab → fade เนื้อหาเข้าใหม่ทุกครั้งที่สลับแท็บหลัก */}
          <div key={tab} className="animate-[fadeIn_0.22s_ease-out]">
            <Routes>
              {/* HOME */}
              <Route
                path="/home"
                element={
                  isAdmin ? (
                    <Navigate to="/admin" replace />
                  ) : (
                    <HomeTab
                      profile={profile}
                      allLeaves={allLeaves}
                      employeeDirectory={employeeDirectory}
                      currentEmployee={currentEmployee}
                      storeCalendar={storeCalendar}
                      periodCutoffs={periodCutoffs}
                    />
                  )
                }
              />

              {/* REQUEST */}
              <Route
                path="/request"
                element={
                  isAdmin ? (
                    <Navigate to="/admin" replace />
                  ) : leaveForm.submitted ? (
                    <SuccessScreen
                      form={leaveForm.form}
                      days={leaveForm.days}
                      onReset={leaveForm.reset}
                    />
                  ) : (
                    <RequestTab
                      profile={profile}
                      allLeaves={allLeaves}
                      form={leaveForm.form}
                      setForm={leaveForm.setForm}
                      errors={leaveForm.errors}
                      histDetail={leaveForm.histDetail}
                      setHistDetail={leaveForm.setHistDetail}
                      myLeaves={leaveForm.myLeaves}
                      balance={leaveForm.balance}
                      used={leaveForm.used}
                      days={leaveForm.days}
                      remain={leaveForm.remain}
                      overLimit={leaveForm.overLimit}
                      onValidate={leaveForm.validateAndSetErrors}
                      onSubmit={() => {
                        if (profile) leaveForm.submit(profile);
                      }}
                      onResetForm={leaveForm.reset}
                      onDelete={(id: string | number) =>
                        leaveForm.handleDelete(id)
                      }
                      storeCalendar={storeCalendar}
                      periodCutoffs={periodCutoffs}
                    />
                  )
                }
              />

              {/* ADMIN */}
              <Route
                path="/admin"
                element={
                  isAdmin ? (
                    <Suspense fallback={<ChunkFallback />}>
                      <AdminPanel
                        section={adminSection}
                        onSectionChange={tryChangeAdminSection}
                        allLeaves={allLeaves}
                        leavesLoading={leavesLoading}
                        employeeDirectory={employeeDirectory}
                        onDelete={leaveForm.handleDelete}
                        onAddLeave={addLeaveAction}
                        onUpdateRole={handleUpdateRole}
                        onDeleteEmployee={handleDeleteEmployee}
                        onReorderEmployees={reorderEmployees}
                        storeCalendar={storeCalendar}
                        periodCutoffs={periodCutoffs}
                        periodSnapshots={periodSnapshots}
                        onClosePeriod={closePayrollPeriod}
                        onReopenPeriod={reopenPayrollPeriod}
                        onRelockPeriod={relockPayrollPeriod}
                        onFinalizePeriod={finalizePayrollPeriod}
                        onUpdateStoreCalendar={updateStoreCalendarAction}
                        showToast={showToast}
                      />
                    </Suspense>
                  ) : (
                    <Navigate to="/home" replace />
                  )
                }
              />

              {/* Catch-all: redirect to home */}
              <Route
                path="*"
                element={<Navigate to={isAdmin ? "/admin" : "/home"} replace />}
              />
            </Routes>
          </div>
        </div>

        {/* ── Bottom nav (mobile only) ── */}
        <BottomNav navItems={navItems} />

        {/* Modals */}
        {!isAdmin && showEditProfile && profile && (
          <ProfileSetupModal
            initial={profile}
            employeeId={currentEmployeeId}
            lockName
            onSave={handleProfileSave}
            onClose={() => setShowEditProfile(false)}
          />
        )}

        {showManual && (
          <Suspense fallback={null}>
            <ManualModal onClose={() => setShowManual(false)} />
          </Suspense>
        )}

        {/* Toast */}
        {toastMsg && (
          // `md:left-[calc(50%+130px)]` ชดเชย sidebar 260px ให้ toast อยู่กลาง
          // .leave-main ไม่ใช่ viewport center · z-1200 = สูงกว่าทุก modal
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 md:left-[calc(50%+130px)] z-[1200]">
            <div
              className={`bg-maroon text-white px-5.5 py-3 rounded-[30px] text-sm font-semibold font-[inherit] shadow-[0_6px_20px_rgba(123,28,28,0.37)] whitespace-nowrap inline-flex items-center gap-1.5 ${
                toastClosing
                  ? "animate-[toastOut_0.2s_ease-in_forwards]"
                  : "animate-[toastIn_0.25s_ease]"
              }`}
            >
              <IconCheck size={14} strokeWidth={2.6} />
              {toastMsg}
            </div>
          </div>
        )}
      </div>
      {/* end leave-main */}
    </div>
  );
}
