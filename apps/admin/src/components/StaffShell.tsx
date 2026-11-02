import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../lib/auth';
import { useApprovalCount } from '../lib/approvalBadge';
import { Icon, type IconName } from './Icons';
import { Logo } from './ui';
import { AboutLink } from './AboutDialog';

export type NavItem = {
  key: string;
  label: string;
  icon: IconName;
  badge?: number;
  group?: string;
};

export function StaffShell({
  nav,
  active,
  onNavigate,
  topbarTitle,
  actions,
  children,
  footnote
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  topbarTitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  const { staff, logout, can } = useStaffAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // 审批角标在侧边栏统一维护，门店页与后台页看到的数字一致。
  const pendingApprovals = useApprovalCount(can('approval:view'), location.pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const items = nav.map((item) =>
    item.key === 'admin/approvals' && item.badge == null ? { ...item, badge: pendingApprovals } : item
  );
  const groups = Array.from(new Set(items.map((item) => item.group || ''))).filter(Boolean);
  const initials = staff?.name?.slice(0, 1) || '时';

  return (
    <div className="app-shell">
      <div className="ops-shell">
        <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="主导航">
          <div className="sidebar-brand">
            <div>
              <Logo variant="zh" size="md" subtitle="Operations" />
            </div>
            <small>TEA HOUR OPERATIONS</small>
          </div>
          <nav className="sidebar-nav" aria-label="功能导航">
            {groups.map((group) => (
              <React.Fragment key={group}>
                <div className="sidebar-label">{group}</div>
                {items
                  .filter((item) => (item.group || '') === group)
                  .map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`side-link ${active === item.key ? 'active' : ''}`}
                      aria-current={active === item.key ? 'page' : undefined}
                      onClick={() => {
                        onNavigate(item.key);
                        setOpen(false);
                      }}
                    >
                      <Icon name={item.icon} size={17} />
                      <span>{item.label}</span>
                      {item.badge ? <span className="badge">{item.badge}</span> : null}
                    </button>
                  ))}
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-user">
            <span>{initials}</span>
            <div>
              <strong>{staff?.name}</strong>
              <small>{staff?.roles.map((role) => role.name).join(' / ') || '—'}</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="退出登录"
              title="退出登录"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <AboutLink />
            <div>{footnote || '门店营业与经营管理共用一套账号与数据，可见范围由角色权限决定。'}</div>
          </div>
        </aside>

        <main className="ops-main">
          {actions ? (
            <header className="ops-header shell-topbar">
              <div className="shell-topbar-note">OPERATIONS · Full愈·时叙</div>
              <div className="ops-toolbar">{actions}</div>
            </header>
          ) : null}
          {children}
        </main>
      </div>
      {open ? <div className="sidebar-scrim" onClick={() => setOpen(false)} /> : null}
    </div>
  );
}
