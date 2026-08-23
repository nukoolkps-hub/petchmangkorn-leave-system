/* ─── useAuth — Track current logged-in user ──────────────── */
import { useEffect, useState } from "react";
import { onAuthChange } from "../auth";
import { getEmployeeByLineId } from "../employees";

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string | undefined;
}

interface AuthEmployee {
  id: string;
  [key: string]: any;
}

interface UseAuthReturn {
  user: AuthUser | null;
  employee: AuthEmployee | null;
  isAdmin: boolean;
  loading: boolean;
  error: Error | null;
  refreshClaims: () => Promise<void>;
}

/**
 * ติดตาม auth state + ดึง:
 * - employee record (จาก /employees collection)
 * - isAdmin (จาก custom claims)
 */
export default function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employee, setEmployee] = useState<AuthEmployee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setEmployee(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // อ่าน custom claims (force refresh เพื่อให้ได้ค่าล่าสุด)
        const tokenResult = await firebaseUser.getIdTokenResult();
        const adminClaim = tokenResult.claims.admin === true;

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          provider: firebaseUser.providerData[0]?.providerId,
        });
        setIsAdmin(adminClaim);

        // หา employee record ที่ผูกกับ user นี้
        // - LINE: uid = LINE userId (จาก custom token)
        // - Google: matching by email หรือ uid
        const employee = await getEmployeeByLineId(firebaseUser.uid);
        setEmployee(employee);
      } catch (err) {
        console.error("[useAuth]", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  /** Force refresh token to get latest claims (เรียกหลังจาก backend อัพเดต claims) */
  async function refreshClaims() {
    const fbUser = (await import("firebase/auth")).getAuth().currentUser;
    if (!fbUser) return;
    const tokenResult = await fbUser.getIdTokenResult(true);
    setIsAdmin(tokenResult.claims.admin === true);
  }

  return { user, employee, isAdmin, loading, error, refreshClaims };
}
