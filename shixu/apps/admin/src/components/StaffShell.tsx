import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../lib/auth';
import { useApprovalCount } from '../lib/approvalBadge';
import { groupNav, groupOf, pinnedNav, type OpsNavItem } from '../lib/nav';
import { Icon } from './Icons';
import { Logo } from './ui';

export type NavItem = OpsNavItem & {
  badge?: number;
};

const NARROW_QUERY = '(max-width: 900px)';
const SIDEBAR_STORAGE_KEY = 'teahour.admin.sidebar';

export function StaffShell({
  nav,
  active,
  onNavigate,
  topbarTitle,
  actions,
  children
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  topbarTitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { staff, logout, can } = useStaffAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // 宽屏侧栏可以收成 72px 图标栏，状态记在本地，换页/刷新都不弹回来。
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  // 窄屏没有「收起」语义（本来就是图标栏 + 抽屉），按钮要按视口宽度切换行为。
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  // 审批角标在侧边栏统一维护，门店页与后台页看到的数字一致。
  const pendingApprovals = useApprovalCount(can('approval:view'), location.pathname);

  const items = nav.map((item) =>
    item.key === 'admin/approvals' && item.badge == null ? { ...item, badge: pendingApprovals } : item
  );
  // 营业台固定在一级，其余菜单按分组折叠；直达项不参与分组自动展开。
  const pinned = pinnedNav(items);
  const groups = groupNav(items);
  const activeGroup = groupOf(items, active);
  // 一级分组一次只展开一个；进入页面时自动展开当前路由所在分组。
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup || null);
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 抽屉只在窄屏生效：锁住背景滚动，避免手指滑动穿透到正文。
  useEffect(() => {
    if (!open || !window.matchMedia(NARROW_QUERY).matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // 前进/后退等非菜单触发的跳转也要把抽屉收起来。
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // 回到宽屏后图标栏重新出现，抽屉状态要一并清掉，否则背景滚动会一直锁着。
  useEffect(() => {
    const onResize = () => {
      const isNarrow = window.matchMedia(NARROW_QUERY).matches;
      setNarrow(isNarrow);
      if (!isNarrow) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 收起的偏好只有宽屏才有意义，但仍照常落库，窄屏忽略即可。
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* 无痕模式或存储被禁用时按当前会话生效即可 */
    }
  }, [collapsed]);

  const initials = staff?.name?.slice(0, 1) || '时';
  // 同一个按钮两种语义：窄屏开关抽屉，宽屏把侧栏收成图标栏。
  const menuExpanded = narrow ? open : !collapsed;
  const toggleMenu = () => {
    if (narrow) {
      setOpen((value) => !value);
      return;
    }
    setCollapsed((value) => !value);
  };

  return (
    <div className="app-shell">
      <div className={`ops-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside id="ops-sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="主导航">
          <div className="sidebar-brand">
            {/* 点 logo 回到当前角色的默认首页：总部进经营概览，门店进营业台。 */}
            <Link to="/staff" className="sidebar-brand-link" aria-label="返回首页" title="返回首页">
              <Logo variant="zh" size="md" subtitle="Operations" />
            </Link>
            <small>TEA HOUR OPERATIONS</small>
          </div>
          <nav className="sidebar-nav" aria-label="功能导航">
            {pinned.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`side-link side-link-pinned ${active === item.key ? 'active' : ''}`}
                aria-current={active === item.key ? 'page' : undefined}
                onClick={() => {
                  onNavigate(item.key);
                  setOpen(false);
                }}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </button>
            ))}
            {pinned.length && groups.length ? (
              <div className="nav-pinned-divider" aria-hidden="true" />
            ) : null}
            {groups.map(({ group, items: groupItems }, index) => {
              const expanded = openGroup === group;
              const hasActive = groupItems.some((item) => item.key === active);
              const panelId = `nav-group-${index}`;
              return (
                <section className="nav-group" key={group}>
                  <button
                    type="button"
                    className={`nav-group-toggle ${hasActive ? 'has-active' : ''}`}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpenGroup(expanded ? null : group)}
                  >
                    <span className="nav-group-name">{group}</span>
                    <span className="nav-group-count" aria-hidden="true">
                      {groupItems.length}
                    </span>
                    <Icon
                      name="chevronDown"
                      size={13}
                      className={`nav-group-chevron ${expanded ? 'expanded' : ''}`}
                    />
                  </button>
                  <div id={panelId} className={`nav-group-items ${expanded ? '' : 'collapsed'}`}>
                    {groupItems.map((item) => (
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
                  </div>
                </section>
              );
            })}
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
        </aside>

        <main className="ops-main">
          {/* 宽屏把侧栏收成图标栏，窄屏把完整菜单以抽屉形式拉出来，按钮全宽度常驻。 */}
          <header className={`ops-header shell-topbar ${actions ? '' : 'shell-topbar-empty'}`}>
            <div className="shell-topbar-left">
              <button
                type="button"
                className="icon-btn bordered menu-toggle"
                aria-label={menuExpanded ? '收起主导航' : '展开主导航'}
                aria-expanded={menuExpanded}
                aria-controls="ops-sidebar"
                title={menuExpanded ? '收起主导航' : '展开主导航'}
                onClick={toggleMenu}
              >
                <Icon name={narrow && open ? 'x' : 'hamburger'} size={17} />
              </button>
              <div className="shell-topbar-note">OPERATIONS · Full愈·时叙</div>
            </div>
            {actions ? <div className="ops-toolbar">{actions}</div> : null}
          </header>
          {children}
        </main>
      </div>
      {open ? <div className="sidebar-scrim" onClick={() => setOpen(false)} /> : null}
    </div>
  );
}
