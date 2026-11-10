import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../lib/auth';
import { Icon, type IconName } from './Icons';
import { Logo } from './ui';
import { AppTop } from './AppTop';

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
  footnote,
  surface
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  topbarTitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
  surface: 'store' | 'admin';
}) {
  const { staff, logout } = useStaffAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const groups = Array.from(new Set(nav.map((item) => item.group || ''))).filter(Boolean);
  const initials = staff?.name?.slice(0, 1) || '时';

  return (
    <div className="app-shell">
      <AppTop active={surface === 'store' ? 'workbench' : 'manage'} />

      <div className="ops-shell">
        <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="主导航">
          <div className="sidebar-brand">
            <Link to="/" aria-label="返回顾客端">
              <Logo variant="zh" size="md" subtitle={surface === 'store' ? 'Store operations' : 'Brand operations'} />
            </Link>
            <small>{surface === 'store' ? 'STORE OPERATIONS' : 'BRAND OPERATIONS'}</small>
          </div>
          <nav className="sidebar-nav" aria-label="功能导航">
            {groups.map((group) => (
              <React.Fragment key={group}>
                <div className="sidebar-label">{group}</div>
                {nav
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
            {footnote || '本地演示：支付、打印、泡茶机、会员与平台均为预留接口，未连接真实设备。'}
          </div>
        </aside>

        <main className="ops-main">
          {actions ? (
            <header className="ops-header shell-topbar">
              <div className="shell-topbar-note">
                {surface === 'store' ? 'STORE OPERATIONS' : 'BRAND OPERATIONS'} · Full愈·时叙
              </div>
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
