import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStaffAuth } from './lib/auth';
import { defaultLanding } from './lib/nav';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { StoreApp } from './pages/StoreApp';
import { AdminApp } from './pages/AdminApp';

function Splash() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Spinner label="正在恢复登录状态" />
    </div>
  );
}

function StaffGate({ children }: { children: React.ReactNode }) {
  const { staff, ready } = useStaffAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!staff) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function StaffHome() {
  const { staff, ready, can } = useStaffAuth();
  if (!ready) return <Splash />;
  if (!staff) return <Navigate to="/login" replace />;
  // 统一导航下的默认落地页：有营业台权限先进营业台，否则取第一个可见菜单。
  const landing = defaultLanding(can);
  if (landing) return <Navigate to={landing} replace />;
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/store/*" element={<StaffGate><StoreApp /></StaffGate>} />
      <Route path="/admin/*" element={<StaffGate><AdminApp /></StaffGate>} />
      <Route path="/staff" element={<StaffHome />} />
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
}
