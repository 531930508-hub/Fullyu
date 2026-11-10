import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokens } from './api';
import type { Staff } from './types';

type StaffAuth = {
  staff: Staff | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<Staff>;
  logout: () => void;
  reload: () => Promise<void>;
  can: (permission: string) => boolean;
};

const StaffAuthContext = createContext<StaffAuth | null>(null);

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!tokens.staff()) {
      setStaff(null);
      setReady(true);
      return;
    }
    try {
      const result = await api.staffMe();
      setStaff(result.staff);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) tokens.clearStaff();
      setStaff(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.staffLogin(username, password);
    tokens.setStaff(result.token);
    setStaff(result.staff);
    setReady(true);
    return result.staff;
  }, []);

  const logout = useCallback(() => {
    tokens.clearStaff();
    setStaff(null);
    // 退出登录时清掉营业台未完成的代点草稿，避免下一位伙伴恢复上一人的单子。
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('teahour.pos.draft.'))
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      /* 存储不可用时无需清理 */
    }
  }, []);

  const can = useCallback(
    (permission: string) => !!staff && (staff.permissions.includes('*') || staff.permissions.includes(permission)),
    [staff]
  );

  const value = useMemo(() => ({ staff, ready, login, logout, reload, can }), [staff, ready, login, logout, reload, can]);
  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error('StaffAuthProvider missing');
  return ctx;
}
