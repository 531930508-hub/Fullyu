import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../lib/auth';
import { defaultLanding } from '../lib/nav';
import { ApiError } from '../lib/api';
import { Logo } from '../components/ui';
import { Icon } from '../components/Icons';

/** 本地开发用的内置账号快捷入口；生产部署不渲染，避免公开暴露账号清单。 */
const BUILT_IN_ACCOUNTS = [
  { username: '13800000001', name: '林知秋', role: '超级管理员', scope: '全部门店' },
  { username: '13800000002', name: '周予安', role: '总部财务', scope: '全部门店' },
  { username: '13800000003', name: '陈默', role: '区域店长', scope: '上海两店' },
  { username: '13800000004', name: '苏禾', role: '门店店长', scope: '上海·城市中心店' },
  { username: '13800000005', name: '顾小满', role: '门店店员', scope: '上海·城市中心店' },
  { username: '13800000006', name: '许知远', role: '只读审计', scope: '全部门店' }
];


export function LoginPage() {
  const { staff, login } = useStaffAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const afterLogin = (permissions: string[]) => {
    const target = (location.state as { from?: string } | null)?.from;
    if (target && target !== '/login') {
      navigate(target, { replace: true });
      return;
    }
    // 与 /staff 共用 lib/nav 的落地规则：总部岗位进经营概览，门店岗位进营业台。
    const landing = defaultLanding((perm) => permissions.includes('*') || permissions.includes(perm));
    navigate(landing || '/store/workbench', { replace: true });
  };

  useEffect(() => {
    // Redirect authoritative staff sessions away from the login screen.
    if (staff) afterLogin(staff.permissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(username.trim(), password);
      afterLogin(result.permissions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand" aria-label="品牌">
        <img className="bg" src="/assets/tea.jpg" alt="" />
        <div>
          <Logo variant="zh" size="lg" subtitle="Tea Hour · Operations" />
          <h1>时叙<br />门店运营系统</h1>
        </div>
      </section>

      <main className="login-main">
        <div className="login-card">
          <h2>登录</h2>
          <p className="sub">使用总部或门店账号登录。</p>
          <form className="login-form" onSubmit={submit}>
            <label className="field">
              <span className="field-label">账号</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
                placeholder="11 位手机号"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="请输入登录密码"
                required
              />
            </label>
            {error ? <div className="inline-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div> : null}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? '正在登录…' : '进入系统'}
              {!busy ? <Icon name="arrowRight" size={17} /> : null}
            </button>
          </form>

          {import.meta.env.DEV ? (
            <div className="login-demo">
              <div className="flex between">
                <span className="eyebrow">本地调试账号</span>
                <span className="tiny muted">仅开发环境显示</span>
              </div>
              <div className="demo-accounts">
                {BUILT_IN_ACCOUNTS.map((account) => (
                  <button
                    type="button"
                    key={account.username}
                    className="demo-account"
                    onClick={() => setUsername(account.username)}
                  >
                    <strong>{account.name} · {account.role}</strong>
                    <small>{account.username} · {account.scope}</small>
                  </button>
                ))}
              </div>
              <div className="login-hint">点击卡片填入账号；密码由管理员设置。</div>
            </div>
          ) : null}

          <div className="login-switch">
            <Link to="/staff">← 返回工作区</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
