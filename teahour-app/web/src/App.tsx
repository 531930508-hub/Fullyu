import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStaffAuth } from './lib/auth';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { CustomerApp } from './customer/CustomerApp';
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
  const { staff, ready } = useStaffAuth();
  if (!ready) return <Splash />;
  if (!staff) return <Navigate to="/login" replace />;
  const permissions = staff.permissions;
  const canAdmin = ['dashboard:view', 'finance:view', 'product:view', 'store:config', 'rbac:view', 'log:view', 'approval:view', 'loss:view'].some(
    (perm) => permissions.includes('*') || permissions.includes(perm)
  );
  const canStore = ['pos:use', 'retail:handover', 'order:view', 'store:stock', 'loss:report', 'store:device'].some(
    (perm) => permissions.includes('*') || permissions.includes(perm)
  );
  if (canAdmin) return <Navigate to="/admin/overview" replace />;
  if (canStore) return <Navigate to="/store/workbench" replace />;
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<CustomerApp />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/store/*" element={<StaffGate><StoreApp /></StaffGate>} />
      <Route path="/admin/*" element={<StaffGate><AdminApp /></StaffGate>} />
      <Route path="/staff" element={<StaffHome />} />
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
