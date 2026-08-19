/* ─── ฟิลด์ที่แก้ได้ใน EmployeeEditModal ────────────────────────────
   เก็บ list ที่เดียว — ใช้ทั้งเช็ค draft ค้าง (badge) และล้าง draft
   เพิ่ม field ใหม่ → เพิ่มที่นี่ที่เดียว (กับ UI input + saveAll)        */
export const EMPLOYEE_EDIT_FIELDS = [
  "prefix",
  "name",
  "nickname",
  "role",
  "startWorkMonth",
] as const;

/** มี draft ค้างสำหรับพนักงานคนนี้ไหม (ใช้โชว์ badge "มีการแก้ไข") */
export function hasEmployeeDraft(
  editingRole: Record<string, unknown>,
  employeeId: string,
) {
  return EMPLOYEE_EDIT_FIELDS.some(
    (f) => editingRole[`${employeeId}:${f}`] !== undefined,
  );
}

/** ลบ draft ทุก field ของพนักงานคนนี้ออกจาก editingRole map */
export function clearEmployeeDraft<T extends Record<string, unknown>>(
  editingRole: T,
  employeeId: string,
): T {
  const next = { ...editingRole };
  for (const f of EMPLOYEE_EDIT_FIELDS) delete next[`${employeeId}:${f}`];
  return next;
}
