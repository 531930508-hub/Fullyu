import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Logo } from '../components/ui';
import { Icon } from '../components/Icons';

const demoAccounts = [
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
  const [username, setUsername] = useState('13800000001');
  const [password, setPassword] = useState('teahour2026');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const afterLogin = (permissions: string[]) => {
    const target = (location.state as { from?: string } | null)?.from;
    if (target && target !== '/login') {
      navigate(target, { replace: true });
      return;
    }
    // 总部岗位才默认进入后台；门店店长虽有 dashboard:view，也应先到营业台。
    const admin = ['finance:view', 'product:view', 'store:config', 'rbac:view'];
    if (admin.some((perm) => permissions.includes('*') || permissions.includes(perm))) {
      navigate('/admin/overview', { replace: true });
    } else {
      navigate('/store/workbench', { replace: true });
    }
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
      <section className="login-brand" aria-label="品牌介绍">
        <img className="bg" src="/assets/tea.jpg" alt="" />
        <div>
          <Logo variant="zh" size="lg" subtitle="Tea Hour · Store operations" />
          <h1>一杯茶的时间，<br />把门店与总部连在一起。</h1>
          <p>
            Full愈·时叙茶饮零售系统：顾客小程序、门店营业台与总部经营后台使用同一套订单、库存与财务数据。
            支付、云打印、泡茶机、会员与外卖平台均以适配接口预留，当前为可运行的本地演示环境。
          </p>
          <div className="login-points">
            <div className="login-point">
              <i><Icon name="scan" size={14} /></i>
              <span>逐杯扫码出餐：杯贴一扫即更新状态，不增加吧台操作步骤。</span>
            </div>
            <div className="login-point">
              <i><Icon name="chart" size={14} /></i>
              <span>门店利润核算：原料、报损、运营费用与退款统一归集到门店。</span>
            </div>
            <div className="login-point">
              <i><Icon name="users" size={14} /></i>
              <span>31 项权限、7 个内置角色、按门店授权，退款与报损走审批。</span>
            </div>
          </div>
        </div>
        <div className="login-foot">Demo environment · No real payments or devices connected</div>
      </section>

      <main className="login-main">
        <div className="login-card">
          <span className="eyebrow">Staff access</span>
          <h2>登录运营系统</h2>
          <p className="sub">使用总部或门店账号登录，系统会按角色与门店范围展示可用功能。</p>
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
                placeholder="演示密码 teahour2026"
                required
              />
            </label>
            {error ? <div className="inline-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div> : null}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? '正在登录…' : '进入系统'}
              {!busy ? <Icon name="arrowRight" size={17} /> : null}
            </button>
          </form>

          <div className="login-demo">
            <div className="flex between">
              <span className="eyebrow">Demo accounts</span>
              <span className="tiny muted">密码均为 teahour2026</span>
            </div>
            <div className="demo-accounts">
              {demoAccounts.map((account) => (
                <button
                  type="button"
                  key={account.username}
                  className="demo-account"
                  onClick={() => {
                    setUsername(account.username);
                    setPassword('teahour2026');
                  }}
                >
                  <strong>{account.name} · {account.role}</strong>
                  <small>{account.username} · {account.scope}</small>
                </button>
              ))}
            </div>
            <div className="login-hint">
              点击账号卡片可自动填入。不同角色登录后看到的页面、按钮与门店范围不同，便于验证权限边界。
            </div>
          </div>

          <div className="login-switch">
            <Link to="/">← 返回顾客小程序</Link>
            <span className="muted"> · 本地演示，不接入真实支付与设备</span>
          </div>
        </div>
      </main>
    </div>
  );
}
