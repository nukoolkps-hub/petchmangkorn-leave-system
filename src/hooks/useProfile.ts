/* ─── useProfile — Profile state & sync ──────────────────────── */

import type { User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import type { Employee } from "../types";

interface ProfileData {
  id: string;
  name: string;
  avatar: string;
  avatarType: string;
  avatarImageUrl: string | null;
  role: string;
}

interface UseProfileOptions {
  authUser: User | null;
  employeeDirectory: Employee[];
  isAdmin?: boolean;
  updateEmployee: (
    id: string,
    fields: Partial<Employee>,
  ) => void | Promise<void>;
  showToast?: (msg: string) => void;
}

export default function useProfile({
  authUser,
  employeeDirectory,
  isAdmin = false,
  updateEmployee,
  showToast,
}: UseProfileOptions) {
  /* ─── Auth-derived profile ─────────────────────────────────── */
  const authEmployee = useMemo(() => {
    if (!authUser || isAdmin) return null;
    const byLineId = employeeDirectory.find(
      (e) => e.lineUserId && e.lineUserId === authUser.uid,
    );
    return byLineId || null;
  }, [authUser, employeeDirectory, isAdmin]);

  const authDerivedProfile = useMemo(() => {
    if (!authUser || isAdmin) return null;
    if (!authEmployee) return null;
    const displayName = authEmployee.name;
    const initials = authEmployee?.avatar || displayName.slice(0, 2);
    return {
      id: authEmployee.id,
      name: displayName,
      avatar: initials,
      avatarType:
        authEmployee?.avatarType || (authUser.photoURL ? "image" : "text"),
      avatarImageUrl: authEmployee?.avatarImageUrl ?? authUser.photoURL ?? null,
      role: authEmployee?.role || "-",
    };
  }, [authUser, authEmployee, isAdmin]);

  const [profile, setProfile] = useState<ProfileData | null>(
    authDerivedProfile,
  );
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Sync profile when auth user changes or resolves to an employee record.
  useEffect(() => {
    if (isAdmin) {
      setProfile(null);
      setShowEditProfile(false);
      return;
    }
    if (!authDerivedProfile) return;
    if (
      !profile ||
      profile.name === "พนักงาน" ||
      profile.name === authUser?.displayName ||
      authEmployee
    ) {
      setProfile(authDerivedProfile);
    }
  }, [
    authDerivedProfile,
    authEmployee,
    authUser?.displayName,
    isAdmin,
    profile,
  ]);

  /* ─── Profile save handler ─────────────────────────────────── */
  async function handleProfileSave(data: any) {
    if (isAdmin) {
      throw new Error("ผู้ดูแลระบบไม่มีโปรไฟล์พนักงานให้แก้ไข");
    }
    if (!authEmployee) {
      throw new Error("ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชี LINE นี้");
    }
    const fields = {
      avatar: data.avatar,
      avatarType: data.avatarType,
      avatarImageUrl: data.avatarImageUrl,
    };
    await updateEmployee(authEmployee.id, fields);
    setProfile({
      id: authEmployee.id,
      name: authEmployee.name,
      role: authEmployee.role || "-",
      ...fields,
    });
    setShowEditProfile(false);
    showToast?.("บันทึกโปรไฟล์แล้ว");
  }

  // keep profile.role in sync when admin updates roles
  useEffect(() => {
    if (isAdmin) return;
    if (profile) {
      const employee = employeeDirectory.find((e) => e.id === profile.id);
      // sync ทั้งชื่อและตำแหน่งเมื่อ admin แก้ (join ด้วย id กันเปลี่ยนชื่อ)
      if (
        employee &&
        (employee.role !== profile.role || employee.name !== profile.name)
      )
        setProfile((p) =>
          p ? { ...p, role: employee.role, name: employee.name } : p,
        );
    }
  }, [employeeDirectory, isAdmin, profile?.role, profile?.name, profile]);

  const currentEmployee = isAdmin ? null : authEmployee;

  return {
    profile,
    setProfile,
    showEditProfile,
    setShowEditProfile,
    handleProfileSave,
    currentEmployee,
    employeeId: currentEmployee?.id || null,
  };
}
