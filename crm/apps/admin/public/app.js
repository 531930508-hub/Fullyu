/* Full愈 CRM 管理后台：零构建单页应用。所有数据来自同源 /api，权限由服务端再次校验。 */
(() => {
  'use strict';

  const API = window.CRM_API_BASE || '/api';
  const STORAGE_KEY = 'fullyu.crm.session';
  const BUSINESS_LABEL = {
    sx: '时叙',
    ql: '轻疗',
    zc: '在场',
    teahour: '时叙',
    retreat: '轻疗',
    presence: '在场',
    hq: '总部'
  };
  const BUSINESS_OPTIONS = [
    ['sx', '时叙'],
    ['ql', '轻疗'],
    ['zc', '在场']
  ];
  const LEDGER_TYPE_LABEL = {
    EARN: '获得',
    CONSUME: '消耗',
    REFUND: '退回',
    REVOKE: '撤销',
    EXPIRE: '到期',
    ADJUST: '调整',
    MIGRATE: '迁移'
  };
  const LEDGER_TYPE_OPTIONS = Object.entries(LEDGER_TYPE_LABEL);
  const LEDGER_TYPE_TONE = {
    EARN: 'green',
    REFUND: 'green',
    ADJUST: 'amber',
    REVOKE: 'red',
    EXPIRE: 'red'
  };
  const STATIONS = [
    '起点 · 茶园',
    '第 01 站 · 溪桥',
    '第 02 站 · 松林',
    '第 03 站 · 竹林',
    '第 04 站 · 山居',
    '第 05 站 · 云台',
    '第 06 站 · 石泉',
    '第 07 站 · 温泉',
    '第 08 站 · 湖畔',
    '第 09 站 · 花田',
    '第 10 站 · 月洞',
    '第 11 站 · 归途'
  ];
  const NAV = [
    { id: 'overview', label: '概览', group: '工作台' },
    { id: 'members', label: '会员', group: '会员与积分', perm: 'crm:member:view' },
    { id: 'ledger', label: '积分流水', group: '会员与积分', perm: 'crm:member:view' },
    { id: 'adjustments', label: '调整审批', group: '会员与积分', any: ['crm:adjust:create', 'crm:adjust:approve', 'crm:adjust:batch'] },
    { id: 'brand-cards', label: '品牌年卡', group: '卡与规则', perm: 'crm:card:view' },
    { id: 'issued-cards', label: '会员卡台账', group: '卡与规则', perm: 'crm:card:view' },
    { id: 'business-cards', label: '业务会员卡', group: '卡与规则', perm: 'crm:card:view' },
    { id: 'rules', label: '规则配置', group: '卡与规则', perm: 'crm:config:edit' },
    { id: 'prizes', label: '游戏礼物', group: '愈行之旅', perm: 'crm:member:view' },
    { id: 'gifts', label: '会员码', group: '会员运营', perm: 'crm:card:view' },
    { id: 'vouchers', label: '提货核销', group: '会员运营', perm: 'crm:voucher:redeem' },
    { id: 'feedback', label: '反馈与故事', group: '会员运营', perm: 'crm:feedback:handle' },
    { id: 'sync', label: '三端同步', group: '同步与对账', perm: 'crm:sync:view' },
    { id: 'queue', label: '异常队列', group: '同步与对账', perm: 'crm:queue:handle' },
    { id: 'reports', label: '月度对账', group: '同步与对账', perm: 'crm:report:view' },
    { id: 'audit', label: '审计日志', group: '治理', perm: 'crm:audit:view' },
    { id: 'roles', label: '角色权限', group: '治理', perm: 'crm:role:edit' }
  ];

  let session = loadSession();
  let badges = { adjustments: 0, prizes: 0, queue: 0 };
  let currentPage = '';
  let toastTimer = null;

  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(next) {
    session = next;
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }

  class ApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    let response;
    try {
      response = await fetch(API + path, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch {
      throw new ApiError('无法连接服务，请确认 CRM 服务已启动', 0, 'NETWORK');
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      if (response.status === 401 && session) {
        saveSession(null);
        renderLogin('登录已过期，请重新登录');
        throw new ApiError('登录已过期', 401, 'UNAUTHORIZED');
      }
      throw new ApiError(
        (data && data.message) || response.statusText || '请求失败',
        response.status,
        data && data.error,
        data && data.details
      );
    }
    return data;
  }

  /** 二进制下载（会员码小程序码）：仍带登录态，错误响应按 JSON 解析文案。 */
  async function apiBlob(path) {
    const headers = { Accept: 'image/png' };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    let response;
    try {
      response = await fetch(API + path, { headers });
    } catch {
      throw new ApiError('无法连接服务，请确认 CRM 服务已启动', 0, 'NETWORK');
    }
    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (response.status === 401 && session) {
        saveSession(null);
        renderLogin('登录已过期，请重新登录');
        throw new ApiError('登录已过期', 401, 'UNAUTHORIZED');
      }
      throw new ApiError(
        (data && data.message) || '二维码生成失败，请稍后重试',
        response.status,
        data && data.error
      );
    }
    return response.blob();
  }

  function can(perm) {
    if (!session?.staff) return false;
    const perms = session.staff.perms || [];
    return perms.includes('*') || perms.includes(perm);
  }

  function canAny(list) {
    return (list || []).some((perm) => can(perm));
  }

  function navAllowed(item) {
    if (item.perm) return can(item.perm);
    if (item.any) return canAny(item.any);
    return true;
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function fmt(value, withTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    const text = date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    });
    return text.replace(/\//g, '-');
  }

  /** 上海时区的 YYYY-MM-DD，供日期输入框回填（数据库生日是 UTC 瞬间）。 */
  function day(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function shanghaiMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}`;
  }

  function money(cents) {
    return `¥${((Number(cents) || 0) / 100).toFixed(2)}`;
  }

  function biz(value) {
    return BUSINESS_LABEL[value] || value || '—';
  }

  function pill(text, tone = '') {
    return `<span class="pill ${tone}">${esc(text)}</span>`;
  }

  const STATUS_TONE = {
    ACTIVE: 'green',
    CURRENT: 'green',
    APPLIED: 'green',
    DELIVERED: 'green',
    COLLECTED: 'green',
    PENDING: 'amber',
    PENDING_APPROVAL: 'amber',
    PAUSED: 'amber',
    NEW: 'amber',
    ISSUED: 'amber',
    CLAIMED: 'green',
    REDEEMED: 'green',
    PUBLISHED: 'green',
    READ: '',
    VOID: 'red',
    SCHEDULED: 'amber',
    DRAFT: 'amber',
    EXPIRING: 'amber',
    FAILED: 'red',
    EXPIRED: 'red',
    REFUNDED: 'red',
    REJECTED: 'red',
    CANCELED: 'red',
    ARCHIVED: '',
    IGNORED: ''
  };

  const STATUS_LABEL = {
    ACTIVE: '生效中',
    CURRENT: '当前',
    APPLIED: '已执行',
    DELIVERED: '已投递',
    COLLECTED: '已交付',
    PENDING: '待处理',
    PENDING_APPROVAL: '待审批',
    PAUSED: '已暂停',
    NEW: '未读',
    ISSUED: '待核销',
    CLAIMED: '已领取',
    REDEEMED: '已核销',
    PUBLISHED: '已发布',
    READ: '已读',
    VOID: '已作废',
    SCHEDULED: '待生效',
    DRAFT: '草稿',
    EXPIRING: '即将到期',
    FAILED: '失败',
    EXPIRED: '已过期',
    REFUNDED: '已退款',
    REJECTED: '已驳回',
    CANCELED: '已撤销',
    ARCHIVED: '已归档',
    IGNORED: '已忽略',
    RETIRED: '已下架'
  };

  function statusPill(status) {
    return pill(STATUS_LABEL[status] || status || '—', STATUS_TONE[status] || '');
  }

  /** 会员卡状态在台账里的口径与列表 / 详情 / 会员页统一。 */
  const CARD_STATE_TEXT = {
    ACTIVE: '生效中',
    PENDING: '待开始',
    REFUND_LOCKED: '退款锁定',
    REFUNDED: '已退款',
    EXPIRING: '即将到期',
    EXPIRED: '已过期'
  };

  function cardStateText(state) {
    return CARD_STATE_TEXT[state] || STATUS_LABEL[state] || state || '—';
  }

  function cardStatePill(state) {
    return pill(cardStateText(state), state === 'REFUND_LOCKED' ? 'amber' : STATUS_TONE[state] || '');
  }

  function toast(message, kind = 'ok') {
    toastEl.className = `toast ${kind === 'error' ? 'error' : ''}`;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 4200);
  }

  function reportError(error) {
    if (!error || error.status === 401) return;
    if (error.code === 'CONFLICT' || error.status === 409) {
      toast(error.message, 'error');
      return;
    }
    toast(error.message || '操作失败', 'error');
  }

  function idemKey(prefix) {
    const random = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  async function guard(button, fn) {
    if (!button) return fn();
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '处理中…';
    try {
      return await fn();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function emptyRow(cols, text = '暂无数据') {
    return `<tr><td colspan="${cols}"><div class="empty">${esc(text)}</div></td></tr>`;
  }

  function formValues(form) {
    const out = {};
    new FormData(form).forEach((value, key) => {
      out[key] = typeof value === 'string' ? value : value.name;
    });
    return out;
  }

  function options(list, selected) {
    return list
      .map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`)
      .join('');
  }

  /* ---------------------------------------------------------------- 登录 */

  function renderLogin(message = '') {
    currentPage = '';
    appEl.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="brand-mark">FULLYU · CRM</div>
          <h1>Full愈中台</h1>
          <p class="muted small">品牌会员、积分与愈行之旅的唯一账本。三端登录与调整均留痕。</p>
          ${message ? `<div class="note" style="margin-top:16px">${esc(message)}</div>` : ''}
          <form id="login-form">
            <div class="field">
              <label for="login-username">后台账号</label>
              <input id="login-username" name="username" autocomplete="username" required placeholder="手机号或账号" />
            </div>
            <div class="field">
              <label for="login-password">密码</label>
              <input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="密码" />
            </div>
            <div class="field">
              <button class="btn block" type="submit">登录</button>
            </div>
          </form>
          <p class="help" style="margin-top:14px">账号由 CRM 管理员分配；忘记密码请联系管理员重置。</p>
        </div>
      </div>`;
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const values = formValues(form);
      if (!values.username || !values.password) return;
      try {
        await guard(button, async () => {
          const data = await api('/auth/login', {
            method: 'POST',
            body: { username: values.username, password: values.password }
          });
          if (!data || !data.token || !data.staff) {
            throw new ApiError('登录响应异常，请刷新页面后重试', 0, 'BAD_RESPONSE');
          }
          saveSession({ token: data.token, staff: data.staff });
          boot();
          toast(`欢迎，${data.staff.name}`);
        });
      } catch (error) {
        reportError(error);
      }
    });
  }

  /* ---------------------------------------------------------------- 框架 */

  function boot() {
    if (!session?.token || !session.staff) return renderLogin();
    if (!location.hash) location.hash = '#/overview';
    renderShell();
    refreshBadges();
    route();
  }

  function renderShell() {
    const groups = [];
    for (const item of NAV) {
      if (!navAllowed(item)) continue;
      let group = groups.find((row) => row.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    appEl.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="logo">Full愈<small>MEMBERSHIP LEDGER</small></div>
          <div>
            ${groups
              .map(
                (group) => `
              <div class="nav-group">
                <span>${esc(group.name)}</span>
                ${group.items
                  .map(
                    (item) => `
                  <a class="nav-item" href="#/${item.id}" data-nav="${item.id}">
                    <span>${esc(item.label)}</span>
                    <span class="badge" data-badge="${item.id}" hidden></span>
                  </a>`
                  )
                  .join('')}
              </div>`
              )
              .join('')}
          </div>
          <div class="who">
            <b>${esc(session.staff.name)} · ${esc(session.staff.username)}</b>
            ${(session.staff.perms || []).includes('*') ? '全部权限' : `${(session.staff.perms || []).length} 项权限`}
            <button class="btn ghost small" id="logout" style="margin-top:10px;color:#e9ddca;border-color:#5a4735">退出登录</button>
          </div>
        </aside>
        <main class="main">
          <div class="topbar">
            <div>
              <h1 id="page-title">概览</h1>
              <div class="sub" id="page-sub"></div>
            </div>
            <div class="row-actions" id="page-actions"></div>
          </div>
          <section id="view"></section>
        </main>
      </div>`;
    document.getElementById('logout').addEventListener('click', () => {
      saveSession(null);
      renderLogin('已退出登录');
    });
  }

  function markNav(page) {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === page);
    });
  }

  function setBadge(page, count) {
    const el = document.querySelector(`[data-badge="${page}"]`);
    if (!el) return;
    if (count > 0) {
      el.hidden = false;
      el.textContent = count > 99 ? '99+' : String(count);
    } else {
      el.hidden = true;
    }
  }

  async function refreshBadges() {
    const tasks = [];
    if (canAny(['crm:adjust:create', 'crm:adjust:approve', 'crm:adjust:batch'])) {
      tasks.push(
        api('/adjustments')
          .then((rows) => {
            badges.adjustments = rows.filter((row) => row.status === 'PENDING').length;
          })
          .catch(() => {})
      );
    }
    if (can('crm:member:view')) {
      tasks.push(
        api('/game/prizes?status=PENDING')
          .then((data) => {
            badges.prizes = data.prizes.length;
          })
          .catch(() => {})
      );
    }
    if (can('crm:queue:handle')) {
      tasks.push(
        api('/queue')
          .then((data) => {
            badges.queue = data.counts.outboxFailed + data.counts.expiredQuotes;
          })
          .catch(() => {})
      );
    }
    await Promise.all(tasks);
    setBadge('adjustments', badges.adjustments);
    setBadge('prizes', badges.prizes);
    setBadge('queue', badges.queue);
  }

  function query(extra = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!raw) return { page: 'overview', param: '' };
    const parts = raw.split('/').filter(Boolean);
    const page = parts[0] || 'overview';
    return { page, param: parts.slice(1).join('/') };
  }

  async function route() {
    const { page, param } = parseHash();
    const item = NAV.find((row) => row.id === page);
    if (!item || !navAllowed(item)) {
      currentPage = '';
      markNav('');
      document.getElementById('page-title').textContent = '不可访问';
      document.getElementById('page-sub').textContent = '当前账号没有该页面的权限';
      document.getElementById('page-actions').innerHTML = '';
      document.getElementById('view').innerHTML = `<div class="panel"><div class="empty">请联系 CRM 管理员调整角色权限。</div></div>`;
      return;
    }
    currentPage = page;
    markNav(page);
    const view = document.getElementById('view');
    const actions = document.getElementById('page-actions');
    const title = document.getElementById('page-title');
    const sub = document.getElementById('page-sub');
    actions.innerHTML = '';
    view.innerHTML = '<div class="panel"><div class="empty">加载中…</div></div>';
    const ctx = {
      param,
      view,
      actions,
      setTitle(next, description = '') {
        title.textContent = next;
        sub.textContent = description;
      }
    };
    try {
      const render = PAGES[page];
      await render(ctx);
    } catch (error) {
      if (error.status === 401) return;
      view.innerHTML = `<div class="panel"><div class="empty">${esc(error.message || '加载失败')}</div></div>`;
      reportError(error);
    }
  }

  window.addEventListener('hashchange', () => {
    if (!session?.token) return renderLogin();
    route();
  });

  /* ---------------------------------------------------------------- 概览 */

  async function pageOverview(ctx) {
    ctx.setTitle('概览', '今天需要处理的会员事项与三端同步状态');
    const month = shanghaiMonth();
    const safe = async (path, fallback) => {
      try {
        return await api(path);
      } catch (error) {
        if (error.status === 403 || error.status === 404) return fallback;
        throw error;
      }
    };
    const [sync, adjustments, prizes, report] = await Promise.all([
      can('crm:sync:view') ? safe('/sync/status', null) : Promise.resolve(null),
      canAny(['crm:adjust:create', 'crm:adjust:approve', 'crm:adjust:batch']) ? safe('/adjustments', []) : Promise.resolve([]),
      can('crm:member:view') ? safe('/game/prizes?status=PENDING', { prizes: [] }) : Promise.resolve({ prizes: [] }),
      can('crm:report:view') ? safe(`/reports/monthly?month=${month}`, null) : Promise.resolve(null)
    ]);
    const pendingAdjust = adjustments.filter((row) => row.status === 'PENDING');
    const maxLag = sync
      ? Math.max(
          0,
          ...sync.businesses.filter((row) => row.lagSeconds !== null).map((row) => row.lagSeconds)
        )
      : null;
    ctx.view.innerHTML = `
      <div class="grid cols-3">
        <div class="stat">
          <div class="label">本月品牌卡</div>
          <div class="value">${report ? report.cards.total.count : '—'}</div>
          <div class="sub">${report ? `实收 ${money(report.cards.total.grossCents)}` : '无对账权限'}</div>
        </div>
        <div class="stat">
          <div class="label">待审批调整</div>
          <div class="value">${pendingAdjust.length}</div>
          <div class="sub">超过 500 分或批量需另一人审批</div>
        </div>
        <div class="stat">
          <div class="label">待交付礼物</div>
          <div class="value">${prizes.prizes.length}</div>
          <div class="sub">到店人工确认，不用扫码</div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-head">
          <h2>三端同步</h2>
          <a class="btn ghost small" href="#/sync">查看详情</a>
        </div>
        ${
          sync
            ? `<div class="table-wrap"><table>
                <thead><tr><th>业务端</th><th>最近调用</th><th>滞后</th><th>Webhook</th><th>待投递</th><th>失败</th><th>快照版本</th></tr></thead>
                <tbody>
                  ${sync.businesses
                    .map(
                      (row) => `<tr>
                        <td>${esc(biz(row.business))}</td>
                        <td class="small">${esc(fmt(row.lastSeenAt))}</td>
                        <td>${row.lagSeconds === null ? '—' : `${row.lagSeconds}s`}</td>
                        <td>${row.webhookConfigured ? pill('已配置', 'green') : pill('未配置', 'amber')}</td>
                        <td>${row.pending}</td>
                        <td>${row.failed ? pill(String(row.failed), 'red') : '0'}</td>
                        <td class="mono small">${row.snapshotVersion}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table></div>
              <p class="help" style="margin-top:10px">总滞后 ${maxLag === null ? '—' : `${maxLag} 秒`}；未配置 Webhook 时事件保留在待投递，不当作已同步。</p>`
            : '<div class="empty">当前账号无同步查看权限</div>'
        }
      </div>
      <div class="panel">
        <div class="panel-head"><h2>快速入口</h2></div>
        <div class="row-actions">
          ${navAllowed(NAV.find((n) => n.id === 'members')) ? '<a class="btn ghost small" href="#/members">查会员</a>' : ''}
          ${navAllowed(NAV.find((n) => n.id === 'adjustments')) ? '<a class="btn ghost small" href="#/adjustments">审批调整</a>' : ''}
          ${navAllowed(NAV.find((n) => n.id === 'prizes')) ? '<a class="btn ghost small" href="#/prizes">交付礼物</a>' : ''}
          ${navAllowed(NAV.find((n) => n.id === 'reports')) ? '<a class="btn ghost small" href="#/reports">月度对账</a>' : ''}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 会员 */

  async function pageMembers(ctx) {
    ctx.setTitle('会员', '手机号与身份按 CRM 明文展示，查看动作当天留痕一次');
    if (ctx.param) return renderMemberDetail(ctx, ctx.param);

    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const keyword = params.get('q') || '';
    const business = params.get('business') || '';
    const data = await api(`/members${query({ q: keyword, business })}`);
    ctx.view.innerHTML = `
      <div class="panel">
        <form id="member-search" class="toolbar">
          <div class="field"><label>搜索</label><input name="q" value="${esc(keyword)}" placeholder="姓名 / 手机号 / 会员号" /></div>
          <div class="field"><label>业务身份</label><select name="business">${options([['', '全部'], ...BUSINESS_OPTIONS], business)}</select></div>
          <button class="btn small" type="submit">查询</button>
          ${can('crm:member:view') ? `<span class="help">共 ${data.members.length} 位（最多显示 50）</span>` : ''}
        </form>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>会员号</th><th>姓名</th><th>手机号</th><th>积分余额</th><th>业务身份</th><th>状态</th></tr></thead>
            <tbody>
              ${
                data.members.length
                  ? data.members
                      .map(
                        (member) => `
                <tr>
                  <td><a class="mono small" href="#/members/${esc(member.id)}">${esc(member.memberNo)}</a></td>
                  <td>${esc(member.name)}</td>
                  <td class="mono small">${esc(member.phone)}</td>
                  <td>${member.balance}</td>
                  <td class="small">${member.identities.map((row) => esc(biz(row.business))).join(' · ') || '—'}</td>
                  <td>${statusPill(member.status)}</td>
                </tr>`
                      )
                      .join('')
                  : emptyRow(6, '没有匹配的会员')
              }
            </tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('member-search').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/members${query({ q: values.q, business: values.business })}`;
    });
  }

  async function renderMemberDetail(ctx, id) {
    const [detail, program] = await Promise.all([
      api(`/members/${id}`),
      api(`/members/${id}/program`).catch((error) => {
        if (error.status === 403 || error.status === 404) return null;
        throw error;
      })
    ]);
    const member = detail.member;
    const gameEnabled = detail.brandCards.some((card) => card.gameEnabled && card.effectiveState === 'ACTIVE');
    ctx.setTitle(member.name || member.memberNo, `${member.memberNo} · 档案查看已按频次留痕`);
    ctx.actions.innerHTML = `<a class="btn ghost small" href="#/members">返回列表</a>`;
    const cardRows = detail.brandCards.length
      ? detail.brandCards
          .map(
            (card) => `
        <tr>
          <td>${esc(card.productName)}<div class="help mono">v${card.version} · ${esc(card.productCode)}</div></td>
          <td>${statusPill(card.effectiveState)}</td>
          <td class="small">${fmt(card.validFrom, false)} → ${fmt(card.validUntil, false)}</td>
          <td>${money(card.paidCents)}</td>
          <td class="small">${esc(card.soldByName && card.soldByName !== biz(card.business) ? `${biz(card.business)} · ${card.soldByName}` : biz(card.business))}</td>
        </tr>`
          )
          .join('')
      : emptyRow(5, '尚无品牌会员卡');
    const batchRows = detail.batches.length
      ? detail.batches
          .map(
            (batch) => `<tr>
              <td>${fmt(batch.earnedAt, false)}</td>
              <td>${esc(biz(batch.issuerBusiness))}</td>
              <td>${batch.amount}</td>
              <td>${batch.remaining}</td>
              <td>${fmt(batch.expireAt, false)}</td>
              <td>${statusPill(batch.status)}</td>
            </tr>`
          )
          .join('')
      : emptyRow(6, '没有可用积分批次');
    const ledgerRows = detail.ledger.length
      ? detail.ledger
          .map(
            (row) => `<tr>
              <td class="small">${fmt(row.createdAt)}</td>
              <td>${esc(row.type)}</td>
              <td>${row.delta > 0 ? '+' : ''}${row.delta}</td>
              <td>${row.balanceAfter}</td>
              <td class="small">${esc(biz(row.business))} · ${esc(row.ref || '')}</td>
              <td class="small">${esc(row.note || '')}</td>
            </tr>`
          )
          .join('')
      : emptyRow(6);
    ctx.view.innerHTML = `
      <div class="grid cols-3">
        <div class="stat"><div class="label">可用积分</div><div class="value">${detail.balance}</div><div class="sub">1 分 = ¥1 · 按到期最早先扣</div></div>
        <div class="stat"><div class="label">愈行骰子</div><div class="value">${detail.game.dice}</div><div class="sub">${esc(STATIONS[detail.game.station] || '起点')} · 第 ${detail.game.lap + 1} 圈</div></div>
        <div class="stat"><div class="label">待交付礼物</div><div class="value">${detail.game.pendingPrizes}</div><div class="sub">${gameEnabled ? '年卡权益可用' : '没有生效中的年卡'}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>会员资料</h2><button class="btn ghost small" id="toggle-profile">编辑资料</button></div>
        <dl class="kv">
          <dt>会员号</dt><dd class="mono">${esc(member.memberNo)}</dd>
          <dt>手机号</dt><dd class="mono">${esc(member.phone)}</dd>
          <dt>姓名</dt><dd>${esc(member.name)}</dd>
          <dt>性别</dt><dd>${member.gender === 1 ? '男' : member.gender === 2 ? '女' : '未填写'}</dd>
          <dt>生日</dt><dd>${fmt(member.birthday, false)}</dd>
          <dt>状态</dt><dd>${statusPill(member.status)}</dd>
          <dt>资料版本</dt><dd>v${member.profileVersion}</dd>
          <dt>业务身份</dt><dd>${detail.identities.map((row) => `${esc(biz(row.business))} <span class="help mono">${esc(row.localUserId)}</span>`).join('<br>') || '—'}</dd>
        </dl>
        ${
          can('crm:member:edit')
            ? `<form id="profile-form" class="form-grid" style="margin-top:16px;display:none">
                <input type="hidden" name="baseVersion" value="${member.profileVersion}" />
                <div class="field"><label>姓名</label><input name="name" value="${esc(member.name)}" maxlength="20" required /></div>
                <div class="field"><label>性别</label><select name="gender">${options([['', '未填写'], ['1', '男'], ['2', '女']], member.gender ? String(member.gender) : '')}</select></div>
                <div class="field"><label>生日</label><input name="birthday" type="date" value="${day(member.birthday)}" /></div>
                <div class="field"><label>头像 URL</label><input name="avatarUrl" value="${esc(member.avatarUrl || '')}" placeholder="https://" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">保存</button><span class="help">版本冲突时会提示刷新，不覆盖他人修改。</span></div>
              </form>`
            : ''
        }
      </div>

      <div class="panel">
        <div class="panel-head"><h2>品牌会员卡</h2><a class="btn ghost small" href="#/brand-cards">卡产品</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>产品</th><th>状态</th><th>有效期</th><th>实付</th><th>售卖</th></tr></thead>
          <tbody>${cardRows}</tbody>
        </table></div>
      </div>

      ${program ? memberProgramPanels(program, id) : ''}

      <div class="panel">
        <div class="panel-head"><h2>愈行之旅</h2><span class="help">${STATIONS[detail.game.station] || ''} · 本月已得 ${detail.game.monthlyEarned} 骰</span></div>
        <p class="help">骰子由订单/签到按规则发放；掷骰与奖品入账都在 CRM，业务端只读展示。礼物到店人工领取。</p>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>积分批次</h2><a class="btn ghost small" href="#/reports">月度对账</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>获得日</th><th>发行业务</th><th>原始</th><th>剩余</th><th>到期</th><th>状态</th></tr></thead>
          <tbody>${batchRows}</tbody>
        </table></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>积分流水</h2><a class="btn ghost small" href="#/ledger${query({ q: member.memberNo })}">查看全部</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>变动后</th><th>来源</th><th>备注</th></tr></thead>
          <tbody>${ledgerRows}</tbody>
        </table></div>
      </div>

      ${
        can('crm:adjust:create')
          ? `<div class="panel">
              <div class="panel-head"><h2>单笔积分调整</h2><span class="help">|分值| ≤ 500 直接入账；超过 500 进入审批</span></div>
              <form id="adjust-form" class="form-grid">
                <div class="field"><label>分值（正加负减）</label><input name="points" type="number" step="1" required placeholder="例如 200 或 -100" /></div>
                <div class="field"><label>原因</label><input name="reason" required minlength="2" maxlength="200" placeholder="活动补发 / 客诉补偿" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">提交调整</button></div>
              </form>
            </div>`
          : ''
      }`;

    const toggle = document.getElementById('toggle-profile');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const form = document.getElementById('profile-form');
        form.style.display = form.style.display === 'none' ? 'grid' : 'none';
      });
    }
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(profileForm);
        try {
          await guard(event.submitter, async () => {
            await api(`/members/${id}/profile`, {
              method: 'PATCH',
              body: {
                baseVersion: Number(values.baseVersion),
                name: values.name,
                gender: values.gender ? Number(values.gender) : null,
                birthday: values.birthday || null,
                avatarUrl: values.avatarUrl || null
              }
            });
            toast('资料已保存');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    }
    bindForceRefund(ctx.view);
    const adjustForm = document.getElementById('adjust-form');
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(adjustForm);
        try {
          await guard(event.submitter, async () => {
            const result = await api('/adjustments', {
              method: 'POST',
              headers: { 'Idempotency-Key': idemKey('ui-adjust') },
              body: { memberId: id, points: Number(values.points), reason: values.reason }
            });
            if (result.status === 'APPLIED') {
              toast(`已入账，当前余额 ${result.balance}`);
              route();
            } else {
              toast('已提交审批，等待另一人处理');
              refreshBadges();
            }
          });
        } catch (error) {
          reportError(error);
        }
      });
    }
  }

  /* ---------------------------------------------------------------- 调整审批 */

  async function pageLedger(ctx) {
    ctx.setTitle('积分流水', '只追加不修改；按会员、类型、业务、单号与日期筛选，可导出对账');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const filter = {
      q: params.get('q') || '',
      type: params.get('type') || '',
      business: params.get('business') || '',
      ref: params.get('ref') || '',
      from: params.get('from') || '',
      to: params.get('to') || '',
      size: params.get('size') || '50'
    };
    const page = Math.max(1, Number(params.get('page')) || 1);
    const data = await api(`/points/ledger${query({ ...filter, page })}`);
    const totalPages = Math.max(1, Math.ceil(data.total / data.size));
    const rowHtml = data.rows.length
      ? data.rows
          .map(
            (row) => `<tr>
              <td class="small">${fmt(row.createdAt)}</td>
              <td><a class="mono small" href="#/members/${esc(row.memberId)}">${esc(row.memberNo)}</a>
                <div class="help">${esc(row.memberName)} · ${esc(row.phone)}</div></td>
              <td>${pill(LEDGER_TYPE_LABEL[row.type] || row.type, LEDGER_TYPE_TONE[row.type] || '')}</td>
              <td><b>${row.delta > 0 ? '+' : ''}${row.delta}</b></td>
              <td>${row.balanceAfter}</td>
              <td class="small">${esc(biz(row.business))}</td>
              <td class="small mono">${esc(row.ref || '—')}</td>
              <td class="small">${esc(row.operatorName || '—')}</td>
              <td class="small">${esc(row.note || '')}</td>
            </tr>`
          )
          .join('')
      : emptyRow(9, '没有匹配的流水');
    ctx.view.innerHTML = `
      <div class="panel">
        <form id="ledger-filter" class="toolbar">
          <div class="field"><label>会员</label><input name="q" value="${esc(filter.q)}" placeholder="姓名 / 手机号 / 会员号" /></div>
          <div class="field"><label>类型</label><select name="type">${options([['', '全部'], ...LEDGER_TYPE_OPTIONS], filter.type)}</select></div>
          <div class="field"><label>业务</label><select name="business">${options([['', '全部'], ...BUSINESS_OPTIONS, ['hq', '总部']], filter.business)}</select></div>
          <div class="field"><label>来源单号</label><input name="ref" value="${esc(filter.ref)}" placeholder="订单号 / 调整单号" /></div>
          <div class="field"><label>开始日期</label><input name="from" type="date" value="${esc(filter.from)}" /></div>
          <div class="field"><label>结束日期</label><input name="to" type="date" value="${esc(filter.to)}" /></div>
          <div class="field"><label>每页</label><select name="size">${options([['20', '20'], ['50', '50'], ['100', '100'], ['200', '200']], filter.size)}</select></div>
          <button class="btn small" type="submit">查询</button>
          <a class="btn ghost small" href="#/ledger">重置</a>
          <button class="btn ghost small" type="button" id="ledger-export">导出 CSV</button>
        </form>
        <div class="help" style="margin-top:10px">共 ${data.total} 条 · 正向 +${data.summary.plus} · 负向 ${data.summary.minus} · 第 ${data.page}/${totalPages} 页</div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>会员</th><th>类型</th><th>变动</th><th>变动后</th><th>业务</th><th>来源单号</th><th>操作人</th><th>备注</th></tr></thead>
            <tbody>${rowHtml}</tbody>
          </table>
        </div>
        <div class="row-actions" style="margin-top:14px">
          ${
            page > 1
              ? `<a class="btn ghost small" href="#/ledger${query({ ...filter, page: page - 1 })}">上一页</a>`
              : '<button class="btn ghost small" disabled>上一页</button>'
          }
          ${
            page < totalPages
              ? `<a class="btn ghost small" href="#/ledger${query({ ...filter, page: page + 1 })}">下一页</a>`
              : '<button class="btn ghost small" disabled>下一页</button>'
          }
        </div>
      </div>`;

    document.getElementById('ledger-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/ledger${query({ ...values, page: '' })}`;
    });
    document.getElementById('ledger-export').addEventListener('click', (event) => {
      const button = event.currentTarget;
      guard(button, async () => {
        const all = [];
        for (let p = 1; p <= 20; p += 1) {
          const chunk = await api(`/points/ledger${query({ ...filter, page: p, size: 200 })}`);
          all.push(...chunk.rows);
          if (!chunk.rows.length || all.length >= chunk.total) break;
        }
        if (!all.length) {
          toast('没有可导出的流水', 'error');
          return;
        }
        const cell = (value) => `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;
        const lines = [
          ['时间', '会员号', '姓名', '手机号', '类型', '变动', '变动后', '业务', '来源单号', '操作人', '备注'],
          ...all.map((row) => [
            fmt(row.createdAt),
            row.memberNo,
            row.memberName,
            row.phone,
            LEDGER_TYPE_LABEL[row.type] || row.type,
            row.delta,
            row.balanceAfter,
            biz(row.business),
            row.ref,
            row.operatorName || '',
            row.note
          ])
        ].map((line) => line.map(cell).join(','));
        const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `积分流水-${shanghaiMonth()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast(`已导出 ${all.length} 条`);
      }).catch(reportError);
    });
  }

  async function pageAdjustments(ctx) {
    ctx.setTitle('调整审批', '单笔超过 500 分或批量调整需另一人审批；审批前复核余额');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const filter = params.get('status') || 'PENDING';
    const rows = await api('/adjustments');
    const shown = filter === 'ALL' ? rows : rows.filter((row) => row.status === filter);
    const pending = rows.filter((row) => row.status === 'PENDING').length;
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="tabs">
          ${['PENDING', 'ALL', 'APPLIED', 'REJECTED']
            .map(
              (key) =>
                `<button class="tab ${filter === key ? 'active' : ''}" data-filter="${key}">${
                  key === 'ALL' ? '全部' : key === 'PENDING' ? `待审批 ${pending}` : key === 'APPLIED' ? '已执行' : '已驳回'
                }</button>`
            )
            .join('')}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>单号</th><th>发起</th><th>原因</th><th>合计</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              ${
                shown.length
                  ? shown
                      .map(
                        (row) => `<tr>
                          <td class="mono small">${esc(row.id)}</td>
                          <td>${esc(row.requestedByName)}<div class="help">${row.kind === 'BATCH' ? '批量' : '单笔'}</div></td>
                          <td>${esc(row.reason)}</td>
                          <td>${row.totalPoints > 0 ? '+' : ''}${row.totalPoints}</td>
                          <td>${statusPill(row.status)}</td>
                          <td class="small">${fmt(row.createdAt)}</td>
                          <td>
                            <div class="row-actions">
                              <button class="btn ghost small" data-lines="${esc(row.id)}">明细</button>
                              ${
                                row.status === 'PENDING' && can('crm:adjust:approve')
                                  ? `<button class="btn small" data-approve="${esc(row.id)}">批准</button>
                                     <button class="btn danger small" data-reject="${esc(row.id)}">驳回</button>`
                                  : ''
                              }
                            </div>
                          </td>
                        </tr>`
                      )
                      .join('')
                  : emptyRow(7, filter === 'PENDING' ? '没有待审批的调整单' : '暂无记录')
              }
            </tbody>
          </table>
        </div>
        <div id="lines-panel" class="note" style="margin-top:14px;display:none"></div>
      </div>
      ${
        can('crm:adjust:batch')
          ? `<div class="panel">
              <div class="panel-head"><h2>批量调整</h2><span class="help">每行「会员号,分值」；整单复核失败则不执行</span></div>
              <form id="batch-form" class="form-grid">
                <div class="field full"><label>调整行</label><textarea name="lines" rows="4" placeholder="FY-2602-008812,100&#10;FY-2607-001204,-50" required></textarea></div>
                <div class="field full"><label>原因</label><input name="reason" required minlength="2" maxlength="200" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">提交批量审批</button><span class="help">批量一律进入审批，由另一人批准。</span></div>
              </form>
            </div>`
          : ''
      }`;

    ctx.view.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/adjustments${query({ status: button.dataset.filter })}`;
      });
    });
    ctx.view.querySelectorAll('[data-lines]').forEach((button) => {
      button.addEventListener('click', () => guard(button, async () => {
        const detail = await api(`/adjustments/${button.dataset.lines}`);
        const panel = document.getElementById('lines-panel');
        panel.style.display = 'block';
        panel.innerHTML = `<b>${esc(detail.request.id)}</b> · ${esc(detail.request.reason)}
          <div class="table-wrap" style="margin-top:8px"><table>
            <thead><tr><th>会员</th><th>分值</th></tr></thead>
            <tbody>${detail.lines
              .map((line) => `<tr><td class="mono small">${esc(line.memberId)}</td><td>${line.points > 0 ? '+' : ''}${line.points}</td></tr>`)
              .join('')}</tbody>
          </table></div>`;
      }).catch(reportError));
    });
    const decide = async (id, action, button) => {
      const label = action === 'approve' ? '批准意见（可留空）' : '驳回意见（至少 2 个字）';
      const comment = window.prompt(label, '');
      if (comment === null) return;
      if (action === 'reject' && comment.trim().length < 2) {
        toast('驳回必须填写意见', 'error');
        return;
      }
      await guard(button, async () => {
        try {
          const result = await api(`/adjustments/${id}/${action}`, {
            method: 'POST',
            body: { comment: comment.trim() }
          });
          toast(result.status === 'APPLIED' ? '已批准并入账' : '已驳回');
          refreshBadges();
          route();
        } catch (error) {
          reportError(error);
        }
      });
    };
    ctx.view.querySelectorAll('[data-approve]').forEach((button) => {
      button.addEventListener('click', () => decide(button.dataset.approve, 'approve', button));
    });
    ctx.view.querySelectorAll('[data-reject]').forEach((button) => {
      button.addEventListener('click', () => decide(button.dataset.reject, 'reject', button));
    });
    const batchForm = document.getElementById('batch-form');
    if (batchForm) {
      batchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(batchForm);
        const members = await api('/members');
        const byNo = new Map(members.members.map((row) => [row.memberNo, row.id]));
        const lines = values.lines
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [memberNo, points] = line.split(/[,，\s]+/);
            return { memberId: byNo.get(memberNo), points: Number(points), memberNo };
          });
        const missing = lines.filter((line) => !line.memberId);
        if (missing.length) return toast(`找不到会员：${missing.map((line) => line.memberNo).join('、')}`, 'error');
        if (!lines.length) return toast('请填写至少一行', 'error');
        try {
          await guard(event.submitter, async () => {
            await api('/adjustments/batch', {
              method: 'POST',
              headers: { 'Idempotency-Key': idemKey('ui-batch') },
              body: {
                reason: values.reason,
                lines: lines.map((line) => ({ memberId: line.memberId, points: line.points }))
              }
            });
            toast('批量调整已提交审批');
            refreshBadges();
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    }
  }

  /* ---------------------------------------------------------------- 品牌年卡 */

  async function pageBrandCards(ctx) {
    ctx.setTitle('品牌年卡', '版本化配置；激活新版本立即归档旧版本，已售卡按购买时快照执行');
    const data = await api('/brand-cards');
    ctx.view.innerHTML = `
      ${
        can('crm:card:edit')
          ? `<div class="panel">
              <div class="panel-head"><h2>新增卡产品</h2><span class="help">编码形如 FY_ANNUAL</span></div>
              <form id="product-form" class="form-grid">
                <div class="field"><label>产品编码</label><input name="code" required placeholder="FY_ANNUAL" pattern="FY_[A-Z0-9_]{2,30}" /></div>
                <div class="field"><label>产品名称</label><input name="name" required maxlength="30" /></div>
                <div class="field"><label>排序</label><input name="sort" type="number" value="0" /></div>
                <div class="field" style="align-self:end"><button class="btn small" type="submit">新增</button></div>
              </form>
            </div>`
          : ''
      }
      ${data.products
        .map(
          (product) => `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>${esc(product.name)} ${statusPill(product.status)}</h2>
              <div class="help mono">${esc(product.code)} · 当前版本 v${product.currentVersion || '—'} · 排序 ${product.sort}</div>
            </div>
            ${can('crm:card:edit') ? `<button class="btn ghost small" data-new-version="${esc(product.code)}">新增版本</button>` : ''}
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>版本</th><th>状态</th><th>价格</th><th>有效期</th><th>权益</th><th>实物礼 / 在场权益</th><th>游戏</th><th>创建</th><th>操作</th></tr></thead>
            <tbody>
              ${product.versions
                .map(
                  (version) => `<tr>
                    <td class="mono">v${version.version}</td>
                    <td>${statusPill(version.status)}</td>
                    <td>${money(version.priceCents)}</td>
                    <td>${version.validDays} 天</td>
                    <td class="small">${version.benefits.map((benefit) => `${esc(biz(benefit.business))}：${esc(benefit.title)}`).join('<br>') || '—'}</td>
                    <td class="small">${(version.gifts || []).map((gift) => `${esc(gift.title)}（${money(gift.valueCents)}）`).join('<br>') || '无实物礼'}
                      <div class="help">${version.perks ? `在场：${version.perks.presence.prioritySeat ? '优先排位' : '—'} · ${version.perks.presence.tierPrice ? '阶梯价' : '—'} · 每月邀请 ${version.perks.presence.invitesPerMonth} 人` : ''}</div></td>
                    <td>${version.gameEnabled ? pill('开启', 'green') : '关闭'}</td>
                    <td class="small">${esc(version.createdByName)}<div class="help">${fmt(version.createdAt)}</div></td>
                    <td>${
                      version.status === 'DRAFT' && can('crm:card:edit')
                        ? `<button class="btn small" data-activate="${esc(product.code)}:${version.version}">激活</button>`
                        : ''
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table></div>
          <div id="version-form-${esc(product.code)}" style="display:none;margin-top:16px">
            <form class="version-form" data-code="${esc(product.code)}">
              <div class="form-grid">
                <div class="field"><label>价格（元）</label><input name="priceYuan" type="number" min="0.01" step="0.01" required /></div>
                <div class="field"><label>有效期（天）</label><input name="validDays" type="number" min="1" max="3650" value="365" required /></div>
                <div class="field full"><label>权益（1–3 条，标题留空的忽略）</label>
                  ${[0, 1, 2]
                    .map(
                      (index) => `<div class="toolbar" style="margin-bottom:8px">
                        <div class="field"><label>业务</label><select name="benefitBiz${index}">${options(BUSINESS_OPTIONS, '')}</select></div>
                        <div class="field" style="flex:1"><label>标题</label><input name="benefitTitle${index}" maxlength="40" placeholder="例：轻疗 · 项目会员价" /></div>
                        <div class="field" style="flex:1"><label>说明</label><input name="benefitDesc${index}" maxlength="120" /></div>
                      </div>`
                    )
                    .join('')}
                </div>
                <div class="field full"><label>实物礼（每行「名称|说明|价值元」，付费开卡后自动发提货码，任意门店核销一次；留空表示不送）</label>
                  <textarea name="gifts" rows="3" placeholder="Full愈 香薰礼盒|到店凭提货码领取|128"></textarea></div>
                <div class="field"><label class="check"><input type="checkbox" name="prioritySeat" checked /> 在场优先排位</label></div>
                <div class="field"><label class="check"><input type="checkbox" name="tierPrice" checked /> 在场阶梯价</label></div>
                <div class="field"><label>在场每月邀请好友名额</label><input name="invitesPerMonth" type="number" min="0" max="20" value="1" /></div>
                <div class="field full"><label>积分消耗模式（JSON，可留空）</label><textarea name="pointsSpend" rows="2" placeholder='{"sx":"BRAND"}'></textarea></div>
                <div class="field full"><label class="check"><input type="checkbox" name="gameEnabled" checked /> 购买后开启愈行之旅</label></div>
                <div class="field full"><label>版本备注</label><input name="note" maxlength="200" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">创建草稿版本</button><span class="help">草稿需在版本列表点击「激活」才生效。</span></div>
              </div>
            </form>
          </div>
        </div>`
        )
        .join('')}`;

    const productForm = document.getElementById('product-form');
    if (productForm) {
      productForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(productForm);
        try {
          await guard(event.submitter, async () => {
            await api('/brand-cards', {
              method: 'POST',
              body: { code: values.code, name: values.name, sort: Number(values.sort) || 0 }
            });
            toast('产品已新增');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    }
    // 新版本从当前版本预填，避免漏抄权益或实物礼；运营只改要变的项。
    const prefillVersion = (form, product) => {
      const base =
        product.versions.find((row) => row.version === product.currentVersion) || product.versions[0];
      if (!base || form.dataset.prefilled) return;
      form.dataset.prefilled = '1';
      form.priceYuan.value = (base.priceCents / 100).toFixed(2);
      form.validDays.value = base.validDays;
      base.benefits.slice(0, 3).forEach((benefit, index) => {
        form[`benefitBiz${index}`].value = benefit.business;
        form[`benefitTitle${index}`].value = benefit.title;
        form[`benefitDesc${index}`].value = benefit.desc || '';
      });
      form.gifts.value = (base.gifts || [])
        .map((gift) => `${gift.title}|${gift.desc || ''}|${(gift.valueCents / 100).toFixed(2).replace(/\.00$/, '')}`)
        .join('\n');
      const presence = (base.perks && base.perks.presence) || {};
      form.prioritySeat.checked = presence.prioritySeat !== false;
      form.tierPrice.checked = presence.tierPrice !== false;
      form.invitesPerMonth.value = presence.invitesPerMonth ?? 1;
      if (base.pointsSpend && Object.keys(base.pointsSpend).length) {
        form.pointsSpend.value = JSON.stringify(base.pointsSpend);
      }
      form.gameEnabled.checked = base.gameEnabled !== false;
    };
    ctx.view.querySelectorAll('[data-new-version]').forEach((button) => {
      button.addEventListener('click', () => {
        const box = document.getElementById(`version-form-${button.dataset.newVersion}`);
        const product = data.products.find((row) => row.code === button.dataset.newVersion);
        if (product) prefillVersion(box.querySelector('form'), product);
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });
    });
    ctx.view.querySelectorAll('.version-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(form);
        const benefits = [];
        for (const index of [0, 1, 2]) {
          const title = (values[`benefitTitle${index}`] || '').trim();
          if (!title) continue;
          benefits.push({
            business: values[`benefitBiz${index}`],
            title,
            desc: (values[`benefitDesc${index}`] || '').trim()
          });
        }
        if (!benefits.length) return toast('至少填写一条权益标题', 'error');
        const gifts = [];
        for (const line of (values.gifts || '').split(/\n+/).map((row) => row.trim()).filter(Boolean)) {
          const [title, desc = '', yuan = '0'] = line.split('|').map((part) => part.trim());
          const valueCents = Math.round(Number(yuan) * 100);
          if (!title || !Number.isFinite(valueCents) || valueCents < 0) {
            return toast(`实物礼格式不正确：${line}`, 'error');
          }
          gifts.push({ title, desc, valueCents });
        }
        const perks = {
          presence: {
            prioritySeat: values.prioritySeat === 'on',
            tierPrice: values.tierPrice === 'on',
            invitesPerMonth: Number(values.invitesPerMonth) || 0
          }
        };
        let pointsSpend = {};
        if ((values.pointsSpend || '').trim()) {
          try {
            pointsSpend = JSON.parse(values.pointsSpend);
          } catch {
            return toast('积分消耗模式不是合法 JSON', 'error');
          }
        }
        try {
          await guard(event.submitter, async () => {
            await api(`/brand-cards/${form.dataset.code}/versions`, {
              method: 'POST',
              body: {
                priceCents: Math.round(Number(values.priceYuan) * 100),
                validDays: Number(values.validDays),
                benefits,
                pointsSpend,
                gifts,
                perks,
                gameEnabled: values.gameEnabled === 'on',
                note: values.note || ''
              }
            });
            toast('草稿版本已创建，激活后生效');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    });
    ctx.view.querySelectorAll('[data-activate]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [code, version] = button.dataset.activate.split(':');
        if (!window.confirm(`激活 ${code} v${version}？旧版本将立即归档。`)) return;
        await guard(button, async () => {
          try {
            await api(`/brand-cards/${code}/versions/${version}/activate`, { method: 'POST', body: {} });
            toast('版本已激活');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 业务会员卡 */

  async function pageBusinessCards(ctx) {
    ctx.setTitle('业务会员卡', '业务自有的卡目录；来源系统与售卖归属只读，CRM 只维护展示与排序');
    const data = await api('/business-cards');
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="note">在场畅练卡、轻疗旧卡等由业务端拥有；CRM 不伪造有效期或权益，只读展示并提供管理路径。</div>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>业务</th><th>卡</th><th>权益</th><th>来源</th><th>售卖</th><th>状态</th><th>管理</th></tr></thead>
          <tbody>
            ${
              data.cards.length
                ? data.cards
                    .map(
                      (card) => `<tr>
                        <td>${esc(card.businessName || biz(card.business))}</td>
                        <td>${esc(card.name)}<div class="help mono">${esc(card.cardCode)}</div></td>
                        <td class="small">${esc(card.benefit)}${card.description ? `<div class="help">${esc(card.description)}</div>` : ''}</td>
                        <td class="small">${esc(card.sourceSystem)}${card.readOnly ? ' · 只读' : ''}</td>
                        <td>${card.sellableInCrm ? pill('CRM 可售', 'green') : '业务端售卖'}</td>
                        <td>${statusPill(card.status)}</td>
                        <td>${
                          can('crm:card:edit')
                            ? `<details><summary class="small">编辑</summary>
                                <form class="biz-form" data-business="${esc(card.business)}" data-code="${esc(card.cardCode)}" style="margin-top:10px;min-width:260px">
                                  <div class="field"><label>名称</label><input name="name" value="${esc(card.name)}" maxlength="30" /></div>
                                  <div class="field"><label>权益</label><input name="benefit" value="${esc(card.benefit)}" maxlength="120" /></div>
                                  <div class="field"><label>补充说明</label><input name="description" value="${esc(card.description)}" maxlength="300" /></div>
                                  <div class="field"><label>管理路径</label><input name="managePath" value="${esc(card.managePath)}" maxlength="200" /></div>
                                  <div class="field"><label>状态</label><select name="status">${options([['ACTIVE', '上架'], ['HIDDEN', '隐藏']], card.status)}</select></div>
                                  <div class="field"><label>排序</label><input name="sort" type="number" value="${card.sort}" /></div>
                                  <button class="btn small" type="submit">保存</button>
                                </form>
                              </details>`
                            : `<span class="small">${esc(card.managePath || '—')}</span>`
                        }</td>
                      </tr>`
                    )
                    .join('')
                : emptyRow(7)
            }
          </tbody>
        </table></div>
      </div>`;
    ctx.view.querySelectorAll('.biz-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(form);
        try {
          await guard(event.submitter, async () => {
            await api(`/business-cards/${form.dataset.business}/${form.dataset.code}`, {
              method: 'PATCH',
              body: {
                name: values.name,
                benefit: values.benefit,
                description: values.description,
                managePath: values.managePath,
                status: values.status,
                sort: Number(values.sort) || 0
              }
            });
            toast('业务卡展示信息已更新');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    });
  }

  /* ---------------------------------------------------------------- 规则配置 */

  async function pageRules(ctx) {
    ctx.setTitle('规则配置', '新版本只能从明天起生效；历史积分与骰子不追溯');
    const data = await api('/rules');
    const all = [...data.points.sx, ...data.points.ql, ...data.points.zc, ...data.dice.all];
    const current = (rows) => rows.find((row) => row.status === 'CURRENT') || rows[0] || null;
    const ruleKeyOf = (value) => value.split(':')[0];
    const scopeOf = (value) => value.split(':')[1];
    const prefill = (value) => {
      if (!value) return '';
      const [key, scope] = value.split(':');
      const source = key === 'points' ? data.points[scope] : data.dice.all;
      const rules = { ...((current(source || []) || {}).rules || {}) };
      if (key === 'dice') {
        // 2026-11-09 起不设单笔与每月上限，旧版本的残留字段不再带进新版本。
        delete rules.perOrderCap;
        delete rules.monthCap;
      }
      return JSON.stringify(rules, null, 2);
    };
    const pointsTable = (scope) => {
      const rows = data.points[scope] || [];
      return `<div class="table-wrap"><table>
        <thead><tr><th>版本</th><th>状态</th><th>生效日</th><th>规则</th><th>原因</th><th>创建</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td class="mono">v${row.version}</td>
              <td>${statusPill(row.status)}</td>
              <td class="small">${fmt(row.effectiveFrom, false)}</td>
              <td class="small">每 ${row.rules.centsPerPoint} 分钱 1 分 · ${row.rules.rounding === 'floor' ? '向下取整' : '四舍五入'} · 年卡 ×${row.rules.cardMultiplier} · 新会员 ${row.rules.newMember} · 冻结 ${row.rules.holdTtlMinutes} 分钟</td>
              <td class="small">${esc(row.reason)}<div class="help">${esc(row.createdByName)}</div></td>
              <td class="small">${fmt(row.createdAt)}</td>
              <td>${row.status === 'SCHEDULED' ? `<button class="btn danger small" data-cancel="points:${esc(row.scope)}:${row.version}">撤销</button>` : ''}</td>
            </tr>`
          )
          .join('') || emptyRow(7, '尚无积分规则')}</tbody>
      </table></div>`;
    };
    const diceRow = (row) => `<tr>
      <td class="mono">v${row.version}</td>
      <td>${statusPill(row.status)}</td>
      <td class="small">${fmt(row.effectiveFrom, false)}</td>
      <td class="small">实付每满 ${money(row.rules.centsPerDie)} 得 1 骰（余额跨单累计，不设单笔与每月上限）· 签到 ${row.rules.checkinDaily} · 体验券月预算 ${money(row.rules.chestBudgetCents)} · 游客${row.rules.guestPlay === 'yes' ? '可玩' : '不可玩'}
        ${(row.rules.laps || []).length ? `<div class="help">逐圈积分：${row.rules.laps.map((tier) => `第 ${tier.fromLap + 1} 圈起 ${tier.pointsMin}–${tier.pointsMax} 分 / ${tier.voucherSlots} 格券`).join('；')}</div>` : ''}
        ${row.rules.diversifyBoost !== undefined ? `<div class="help">少去业态的体验券权重最高 ×${1 + Number(row.rules.diversifyBoost)}（会员不可见）</div>` : ''}</td>
      <td class="small">${row.rules.prizes.map((prize) => `${esc(prize.name)}（${esc(biz(prize.business))}/${prize.validityDays}天/权重${prize.weight}${prize.faceCents ? `/面值${money(prize.faceCents)}` : ''}${prize.minLap ? `/第${prize.minLap + 1}圈起` : ''}${prize.minLifetimeDice ? `/累计${prize.minLifetimeDice}骰后` : ''}）`).join('<br>')}</td>
      <td class="small">${esc(row.reason)}<div class="help">${esc(row.createdByName)}</div></td>
      <td>${row.status === 'SCHEDULED' ? `<button class="btn danger small" data-cancel="dice:all:${row.version}">撤销</button>` : ''}</td>
    </tr>`;
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>积分规则</h2><span class="help">按业务分别配置；读取时自动切换到期版本</span></div>
        ${BUSINESS_OPTIONS.map(
          ([scope, label]) => `<h3 style="margin:14px 0 8px">${esc(label)}</h3>${pointsTable(scope)}`
        ).join('')}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>愈行之旅骰子规则</h2><span class="help">三端共用</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>版本</th><th>状态</th><th>生效日</th><th>参数</th><th>礼物池</th><th>原因</th><th></th></tr></thead>
          <tbody>${data.dice.all.map(diceRow).join('') || emptyRow(7, '尚无骰子规则')}</tbody>
        </table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>新建规则版本</h2><span class="help">生效日必须晚于今天；同一规则同时只能有一个待生效版本</span></div>
        <form id="rule-form" class="form-grid">
          <div class="field"><label>规则</label><select name="target">
            <option value="points:sx">积分 · 时叙</option>
            <option value="points:ql">积分 · 轻疗</option>
            <option value="points:zc">积分 · 在场</option>
            <option value="dice:all">骰子 · 三端通用</option>
          </select></div>
          <div class="field"><label>生效日</label><input name="effectiveFrom" type="date" required /></div>
          <div class="field full"><label>变更原因</label><input name="reason" required maxlength="200" /></div>
          <div class="field full"><label>规则 JSON</label><textarea name="rules" rows="10" class="mono" required>${esc(prefill('points:sx'))}</textarea></div>
          <div class="full row-actions"><button class="btn small" type="submit">创建待生效版本</button><span class="help">只影响生效日之后的发放；已有积分/骰子不重算。</span></div>
        </form>
      </div>`;

    const ruleForm = document.getElementById('rule-form');
    const targetSelect = ruleForm.querySelector('[name="target"]');
    const jsonArea = ruleForm.querySelector('[name="rules"]');
    targetSelect.addEventListener('change', () => {
      jsonArea.value = prefill(targetSelect.value);
    });
    ruleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = formValues(ruleForm);
      const key = ruleKeyOf(values.target);
      const scopeValue = scopeOf(values.target);
      let rules;
      try {
        rules = JSON.parse(values.rules);
      } catch {
        return toast('规则 JSON 格式不正确', 'error');
      }
      try {
        await guard(event.submitter, async () => {
          await api(`/rules/${key}/versions`, {
            method: 'POST',
            body: { scope: scopeValue, effectiveFrom: values.effectiveFrom, reason: values.reason, rules }
          });
          toast('待生效版本已创建');
          route();
        });
      } catch (error) {
        reportError(error);
      }
    });
    ctx.view.querySelectorAll('[data-cancel]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [key, scope, version] = button.dataset.cancel.split(':');
        if (!window.confirm('撤销这个待生效版本？')) return;
        await guard(button, async () => {
          try {
            await api(`/rules/${key}/versions/${version}/cancel`, {
              method: 'POST',
              body: { scope }
            });
            toast('已撤销');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 礼物 */

  async function pagePrizes(ctx) {
    ctx.setTitle('游戏礼物', '到店人工确认交付；每次交付写审计，重复点击会被拒绝');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const status = params.get('status') || 'PENDING';
    const data = await api(`/game/prizes${query({ status })}`);
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="tabs">
          ${['PENDING', 'COLLECTED', 'EXPIRED', 'ALL']
            .map(
              (key) =>
                `<button class="tab ${status === key ? 'active' : ''}" data-status="${key}">${
                  key === 'PENDING' ? '待交付' : key === 'COLLECTED' ? '已交付' : key === 'EXPIRED' ? '已过期' : '全部'
                }</button>`
            )
            .join('')}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>会员</th><th>礼物</th><th>业务</th><th>站点</th><th>获得</th><th>到期</th><th>状态</th><th>交付</th></tr></thead>
          <tbody>
            ${
              data.prizes.length
                ? data.prizes
                    .map(
                      (prize) => `<tr>
                        <td>${esc(prize.memberName)}<div class="help mono">${esc(prize.memberNo)}</div></td>
                        <td>${esc(prize.name)}</td>
                        <td>${esc(biz(prize.business))}</td>
                        <td class="small">${esc(prize.stationName)}</td>
                        <td class="small">${fmt(prize.wonAt)}</td>
                        <td class="small">${fmt(prize.expiresAt, false)}</td>
                        <td>${statusPill(prize.status)}${prize.collectedByName ? `<div class="help">${esc(prize.collectedByName)} · ${fmt(prize.collectedAt)}</div>` : ''}</td>
                        <td>${
                          prize.status === 'PENDING' && can('crm:member:edit')
                            ? `<form class="collect-form" data-id="${esc(prize.id)}" style="display:flex;gap:6px;min-width:220px">
                                <input name="note" placeholder="交付备注（可空）" maxlength="100" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:4px 8px" />
                                <button class="btn small" type="submit">确认交付</button>
                              </form>`
                            : prize.note
                              ? `<span class="small">${esc(prize.note)}</span>`
                              : '—'
                        }</td>
                      </tr>`
                    )
                    .join('')
                : emptyRow(8, status === 'PENDING' ? '没有待交付礼物' : '暂无记录')
            }
          </tbody>
        </table></div>
      </div>`;
    ctx.view.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/prizes${query({ status: button.dataset.status })}`;
      });
    });
    ctx.view.querySelectorAll('.collect-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const note = formValues(form).note || '';
        if (!window.confirm('确认已把礼物交给会员？此动作不可撤销。')) return;
        await guard(event.submitter, async () => {
          try {
            await api(`/game/prizes/${form.dataset.id}/collect`, {
              method: 'POST',
              body: { note }
            });
            toast('已确认交付');
            refreshBadges();
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 会员 360：净消费与会员运营 */

  const ORDER_KIND = { ORDER: '消费', REFUND: '退款', PARTIAL_REFUND: '部分退款' };
  const SOURCE_LABEL = { PAID: '付费开通', GIFT: '会员码赠送', MANUAL: '手工发卡', BUNDLE: '畅练卡附赠' };
  const REFUND_TYPE_LABEL = { WITHIN_7D: '7 天内无理由', AFTER_7D: '超 7 天按规则', PRORATED: '超 7 天按规则', NEGOTIATED: '协商退款', BUNDLE_REVOKED: '畅练卡撤销' };
  const RETREAT_STATE = { 0: '未支付', 1: '已支付', 2: '已关闭', 3: '已退款', 4: '已支付待开卡' };

  function memberProgramPanels(program, memberId) {
    const quoteOf = new Map((program.refundQuotes || []).map((quote) => [quote.cardId, quote]));
    const byBusiness = program.byBusiness.length
      ? program.byBusiness
          .map(
            (row) => `<tr><td>${esc(row.businessName || biz(row.business))}</td><td>${row.count}</td><td>${money(row.netPaidCents)}</td><td>${money(row.savedCents)}</td></tr>`
          )
          .join('')
      : emptyRow(4, '三端尚未上报订单');
    const orders = program.orders.length
      ? program.orders
          .map(
            (row) => `<tr>
              <td class="small">${fmt(row.occurredAt)}</td>
              <td>${esc(row.businessName || biz(row.business))}</td>
              <td>${esc(ORDER_KIND[row.kind] || row.kind)}</td>
              <td class="mono small">${esc(row.orderRef)}</td>
              <td>${money(row.paidCents)}</td>
              <td>${row.savedCents ? money(row.savedCents) : '—'}</td>
              <td>${row.brandMember ? pill('会员价', 'green') : '—'}</td>
            </tr>`
          )
          .join('')
      : emptyRow(7, '暂无订单');
    const cards = program.cards.length
      ? program.cards
          .map((card) => {
            const quote = quoteOf.get(card.cardId);
            const refunded = card.state === 'REFUNDED';
            const quoteText = refunded
              ? `已退 ${money(card.refundCents)} · ${esc(REFUND_TYPE_LABEL[card.refundType] || card.refundType || '')}`
              : quote
                ? `${quote.allowed ? `规则可退 <b>${money(quote.refundableCents)}</b>` : pill('规则不可退', 'red')}<div class="help">${esc(quote.message)}</div><div class="help">实付 ${money(quote.paidCents)} · 已享优惠 ${money(quote.savedCents)} · 已领实物礼 ${money(quote.redeemedGiftCents)} · 7 天窗口至 ${fmt(quote.windowEndsAt)}</div>`
                : '<span class="help">赠送/附赠资格不涉及退款</span>';
            const canRefund = program.canForceRefund && ['PAID', 'MANUAL'].includes(card.source) && !refunded;
            return `<tr>
              <td>${esc(card.productName)}<div class="help mono">${esc(card.cardId)}</div></td>
              <td>${esc(SOURCE_LABEL[card.source] || card.source)}</td>
              <td>${cardStatePill(card.state)}</td>
              <td class="small">${esc(card.validFrom)} → ${esc(card.validUntil)}</td>
              <td>${money(card.paidCents)}</td>
              <td class="small" style="min-width:260px">${quoteText}</td>
              <td><div class="row-actions">
                <a class="btn ghost small" href="#/issued-cards/${esc(card.cardId)}">台账</a>
                ${canRefund ? `<button class="btn danger small" data-force-refund="${esc(card.cardId)}" data-suggest="${quote ? quote.refundableCents : 0}" data-paid="${card.paidCents}">协商退款</button>` : ''}
              </div></td>
            </tr>`;
          })
          .join('')
      : emptyRow(7, '尚无品牌会员资格');
    const vouchers = program.vouchers.length
      ? program.vouchers
          .map(
            (row) => `<tr><td class="mono">${esc(row.code)}</td><td>${esc(row.title)}<div class="help">${esc(row.desc || '')}</div></td><td>${money(row.valueCents)}</td><td>${statusPill(row.status)}</td><td class="small">${row.redeemedAt ? `${fmt(row.redeemedAt)} · ${esc(row.redeemedStore)}` : '—'}</td></tr>`
          )
          .join('')
      : emptyRow(5, '没有实物礼提货码');
    const gifts = program.gifts.length
      ? program.gifts
          .map(
            (row) => `<tr><td class="mono">${esc(row.code)}</td><td>${esc(row.name)}</td><td>${row.days} 天</td><td class="small">${esc(row.channelTag || '—')}${row.referrerName ? ` · 推荐人 ${esc(row.referrerName)}` : ''}</td><td class="small">${fmt(row.claimedAt)}</td></tr>`
          )
          .join('')
      : emptyRow(5, '未领取过会员码');
    const invites = program.invites.length
      ? program.invites
          .map(
            (row) => `<tr><td class="mono">${esc(row.code)}</td><td>${row.role === 'INVITER' ? '邀请人' : '被邀请人'}</td><td>${statusPill(row.status)}</td><td class="small">${fmt(row.createdAt)}</td></tr>`
          )
          .join('')
      : emptyRow(4, '没有在场邀请记录');
    return `
      <div class="grid cols-3">
        <div class="stat"><div class="label">三端净消费</div><div class="value">${money(program.totals.netPaidCents)}</div><div class="sub">实付已扣除全部优惠与退款</div></div>
        <div class="stat"><div class="label">会员累计节省</div><div class="value">${money(program.totals.savedCents)}</div><div class="sub">续费提醒与退款试算都用这个数</div></div>
        <div class="stat"><div class="label">订单笔数</div><div class="value">${program.byBusiness.reduce((sum, row) => sum + row.count, 0)}</div><div class="sub">时叙 / 在场 / 轻疗上报</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>分业态消费</h2><span class="help">按会员实际付款统计，退款以负数冲减</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>业态</th><th>笔数</th><th>净消费</th><th>会员节省</th></tr></thead>
          <tbody>${byBusiness}</tbody>
        </table></div>
        <details style="margin-top:12px"><summary class="small">最近 30 笔订单</summary>
          <div class="table-wrap" style="margin-top:8px"><table>
            <thead><tr><th>时间</th><th>业态</th><th>类型</th><th>订单号</th><th>实付</th><th>节省</th><th>会员价</th></tr></thead>
            <tbody>${orders}</tbody>
          </table></div>
        </details>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>会员资格与退款试算</h2><div class="row-actions"><span class="help">${program.canForceRefund ? '规则退款、协商退款与轻疗同步都在「会员卡台账」完成' : '退款操作需要财务权限'}</span>${can('crm:card:edit') && can('crm:member:view') ? `<a class="btn ghost small" href="#/issued-cards${query({ memberId })}">发卡 / 续费</a>` : ''}</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>资格</th><th>来源</th><th>状态</th><th>有效期</th><th>实付</th><th>退款试算</th><th></th></tr></thead>
          <tbody>${cards}</tbody>
        </table></div>
        <div id="force-refund-box" class="note" style="margin-top:14px;display:none"></div>
      </div>
      <div class="grid cols-2">
        <div class="panel">
          <div class="panel-head"><h2>实物礼提货码</h2><a class="btn ghost small" href="#/vouchers">去核销</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>提货码</th><th>礼物</th><th>价值</th><th>状态</th><th>核销</th></tr></thead>
            <tbody>${vouchers}</tbody>
          </table></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>会员码与邀请</h2><span class="help">拉新归因</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>会员码</th><th>活动</th><th>天数</th><th>渠道 / 推荐人</th><th>领取</th></tr></thead>
            <tbody>${gifts}</tbody>
          </table></div>
          <div class="table-wrap" style="margin-top:10px"><table>
            <thead><tr><th>邀请码</th><th>角色</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>${invites}</tbody>
          </table></div>
        </div>
      </div>`;
  }

  function bindForceRefund(root) {
    const box = root.querySelector('#force-refund-box');
    root.querySelectorAll('[data-force-refund]').forEach((button) => {
      button.addEventListener('click', () => {
        const cardId = button.dataset.forceRefund;
        const suggest = Number(button.dataset.suggest) || 0;
        const paid = Number(button.dataset.paid) || 0;
        box.style.display = 'block';
        box.innerHTML = `
          <form id="force-refund-form" class="form-grid">
            <div class="full"><b>协商退款</b> · <span class="mono small">${esc(cardId)}</span>
              <div class="help">规则可退 ${money(suggest)}，实付 ${money(paid)}。提交后会员资格立即撤销、未核销的提货码作废，并通知售卡业务端原路退款。</div></div>
            <div class="field"><label>退款金额（元）</label><input name="refundYuan" type="number" min="0" step="0.01" max="${(paid / 100).toFixed(2)}" value="${(suggest / 100).toFixed(2)}" required /></div>
            <div class="field full"><label>协商原因（至少 4 个字，写清客诉与协商结果）</label><input name="reason" minlength="4" maxlength="200" required /></div>
            <div class="full row-actions"><button class="btn danger small" type="submit">确认协商退款</button><button class="btn ghost small" type="button" id="force-refund-cancel">取消</button></div>
          </form>`;
        box.querySelector('#force-refund-cancel').addEventListener('click', () => {
          box.style.display = 'none';
          box.innerHTML = '';
        });
        const form = box.querySelector('#force-refund-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const values = formValues(form);
          const refundCents = Math.round(Number(values.refundYuan) * 100);
          if (!window.confirm(`确认按 ${money(refundCents)} 协商退款？此操作不可撤销。`)) return;
          try {
            await guard(event.submitter, async () => {
              await api(`/member-cards/${cardId}/force-refund`, {
                method: 'POST',
                body: { refundCents, reason: values.reason }
              });
              toast('已协商退款，会员资格已撤销');
              route();
            });
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 会员卡台账（CRM 为中心） */

  const CARD_STATE_OPTIONS = [
    ['ACTIVE', '生效中'],
    ['PENDING', '待开始'],
    ['REFUND_LOCKED', '退款锁定'],
    ['REFUNDED', '已退款']
  ];
  const RETREAT_REFUND_STATE = { NONE: '未退款', SUCCESS: '已退款', PENDING_CRM: '待 CRM 落账' };

  /** 台账筛选区：保留除分页外的全部条件，供翻页链接复用。 */
  function cardFilters(params) {
    return {
      q: params.get('q') || '',
      state: params.get('state') || '',
      source: params.get('source') || '',
      soldBy: params.get('soldBy') || '',
      productCode: params.get('productCode') || '',
      orderRef: params.get('orderRef') || '',
      from: params.get('from') || '',
      to: params.get('to') || ''
    };
  }

  async function pageIssuedCards(ctx) {
    if (ctx.param) return renderIssuedCardDetail(ctx, ctx.param);
    ctx.setTitle('会员卡台账', 'CRM 是会员资格的唯一账本：发卡、续费、赠送、退款与轻疗同步都在这里留痕');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const filter = cardFilters(params);
    const page = Math.max(1, Number(params.get('page')) || 1);
    const presetMemberId = params.get('memberId') || '';
    const data = await api(`/issued-cards${query({ ...filter, page })}`);
    const totalPages = Math.max(1, Math.ceil(data.total / data.size));
    const productOptions = [['', '全部产品'], ...data.products.map((row) => [row.code, `${row.name}（v${row.currentVersion}）`])];
    if (filter.productCode && !data.products.some((row) => row.code === filter.productCode)) {
      productOptions.push([filter.productCode, filter.productCode]);
    }
    const rows = data.items.length
      ? data.items
          .map(
            (item) => `<tr>
              <td><a href="#/issued-cards/${esc(item.cardId)}">${esc(item.productName)}</a>
                <div class="help mono">${esc(item.cardId)}</div></td>
              <td><a class="small" href="#/members/${esc(item.member.id)}">${esc(item.member.name || item.member.memberNo)}</a>
                <div class="help mono">${esc(item.member.memberNo)}${item.member.phone ? ` · ${esc(item.member.phone)}` : ''}</div></td>
              <td class="small">${esc(SOURCE_LABEL[item.source] || item.source)}</td>
              <td>${cardStatePill(item.effectiveState)}${item.state !== item.effectiveState ? `<div class="help">库内 ${esc(cardStateText(item.state))}</div>` : ''}</td>
              <td class="small">${esc(item.validFrom)} → ${esc(item.validUntil)}</td>
              <td>${money(item.paidCents)}${item.refundCents ? `<div class="help">已退 ${money(item.refundCents)}</div>` : ''}</td>
              <td class="small">${esc(item.soldByName || biz(item.soldBy))}</td>
              <td class="small mono">${esc(item.orderRef)}</td>
              <td class="small">${fmt(item.createdAt)}</td>
            </tr>`
          )
          .join('')
      : emptyRow(9, '没有匹配的会员卡');
    ctx.view.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="label">卡总数</div><div class="value">${data.summary.total}</div><div class="sub">按当前筛选条件</div></div>
        <div class="stat"><div class="label">生效中</div><div class="value">${data.summary.active}</div><div class="sub">含 30 天内到期</div></div>
        <div class="stat"><div class="label">待开始</div><div class="value">${data.summary.pending}</div><div class="sub">续费接续中</div></div>
        <div class="stat"><div class="label">净实收</div><div class="value">${money(data.summary.netPaidCents)}</div><div class="sub">实付扣除已退款</div></div>
      </div>
      ${
        can('crm:card:edit') && can('crm:member:view')
          ? `<details class="panel" id="issue-card-panel"${presetMemberId ? ' open' : ''}>
              <summary style="cursor:pointer;font-weight:600">发卡 / 续费 / 赠送</summary>
              <div class="help" style="margin:8px 0 12px">新卡自动接在会员最后一张有效卡之后（等同续费）；赠送不发实物提货券，也不登记实付。</div>
              <form id="issue-member-search" class="toolbar">
                <div class="field"><label>找会员</label><input name="q" placeholder="姓名 / 手机号 / 会员号" /></div>
                <button class="btn ghost small" type="submit">搜索</button>
                <span class="help">先选中会员，再填写发卡信息</span>
              </form>
              <div id="issue-member-picked" class="note" style="margin:10px 0"><span class="help">尚未选择会员</span></div>
              <div id="issue-member-results"></div>
              <form id="issue-form" class="form-grid" style="margin-top:14px">
                <input type="hidden" name="memberId" value="" />
                <div class="field"><label>卡产品</label><select name="productCode" required>${options(productOptions.slice(1), filter.productCode)}</select></div>
                <div class="field"><label>发卡方式</label><select name="mode">${options([['MANUAL', '线下收款发卡'], ['GIFT', '赠送（无实收）']], 'MANUAL')}</select></div>
                <div class="field" id="issue-paid-field"><label>实收金额（元）</label><input name="paidYuan" type="number" min="0.01" step="0.01" placeholder="线下实际收到的金额" /></div>
                <div class="field"><label>售出归属</label><select name="soldBy">${options(BUSINESS_OPTIONS, 'ql')}</select></div>
                <div class="field"><label>订单号（可空）</label><input name="orderRef" maxlength="80" placeholder="线下单号；留空自动生成 CRM-*" /></div>
                <div class="field"><label>备注（可空）</label><input name="note" maxlength="200" placeholder="例：门店收银台线下购买" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">确认发卡</button><span class="help">${data.products.length ? '提交后立即生效并写入 CRM 操作日志与三端同步队列。' : '没有在售卡产品，请先在「品牌会员卡」配置版本。'}</span></div>
              </form>
            </details>`
          : ''
      }
      <div class="panel">
        <form id="issued-filter" class="toolbar">
          <div class="field"><label>搜索</label><input name="q" value="${esc(filter.q)}" placeholder="卡号 / 会员 / 手机号 / 订单号" /></div>
          <div class="field"><label>状态</label><select name="state">${options([['', '全部'], ...CARD_STATE_OPTIONS], filter.state)}</select></div>
          <div class="field"><label>来源</label><select name="source">${options([['', '全部'], ...Object.entries(SOURCE_LABEL)], filter.source)}</select></div>
          <div class="field"><label>售出归属</label><select name="soldBy">${options([['', '全部'], ...BUSINESS_OPTIONS], filter.soldBy)}</select></div>
          <div class="field"><label>卡产品</label><select name="productCode">${options(productOptions, filter.productCode)}</select></div>
          <div class="field"><label>订单号</label><input name="orderRef" value="${esc(filter.orderRef)}" placeholder="订单号片段" /></div>
          <div class="field"><label>发卡开始日</label><input name="from" type="date" value="${esc(filter.from)}" /></div>
          <div class="field"><label>发卡结束日</label><input name="to" type="date" value="${esc(filter.to)}" /></div>
          <button class="btn small" type="submit">查询</button>
          <a class="btn ghost small" href="#/issued-cards">重置</a>
        </form>
        <div class="help" style="margin-top:10px">共 ${data.total} 张 · 第 ${data.page}/${totalPages} 页</div>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>卡</th><th>会员</th><th>来源</th><th>状态</th><th>有效期</th><th>实付</th><th>售出</th><th>订单号</th><th>发卡时间</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="row-actions" style="margin-top:14px">
          ${
            page > 1
              ? `<a class="btn ghost small" href="#/issued-cards${query({ ...filter, page: page - 1 })}">上一页</a>`
              : '<button class="btn ghost small" disabled>上一页</button>'
          }
          ${
            page < totalPages
              ? `<a class="btn ghost small" href="#/issued-cards${query({ ...filter, page: page + 1 })}">下一页</a>`
              : '<button class="btn ghost small" disabled>下一页</button>'
          }
        </div>
      </div>`;

    document.getElementById('issued-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      location.hash = `#/issued-cards${query({ ...formValues(event.target), page: '' })}`;
    });

    const panel = document.getElementById('issue-card-panel');
    if (!panel) return;
    const issueForm = document.getElementById('issue-form');
    const picked = document.getElementById('issue-member-picked');
    const results = document.getElementById('issue-member-results');
    const paidField = document.getElementById('issue-paid-field');
    const paintPicked = (member) => {
      issueForm.elements.memberId.value = member ? member.id : '';
      picked.innerHTML = member
        ? `已选：<b>${esc(member.name)}</b> · <span class="mono">${esc(member.memberNo)}</span> · ${esc(member.phone || '无手机号')}`
        : '<span class="help">尚未选择会员</span>';
    };
    if (presetMemberId) {
      try {
        const detail = await api(`/members/${encodeURIComponent(presetMemberId)}`);
        paintPicked(detail.member);
      } catch (error) {
        reportError(error);
      }
    }
    document.getElementById('issue-member-search').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter;
      const keyword = formValues(event.target).q || '';
      await guard(button, async () => {
        try {
          const found = await api(`/members${query({ q: keyword })}`);
          results.innerHTML = found.members.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>会员号</th><th>姓名</th><th>手机号</th><th>状态</th><th></th></tr></thead>
                <tbody>${found.members
                  .map(
                    (member) => `<tr>
                      <td class="mono small">${esc(member.memberNo)}</td>
                      <td>${esc(member.name)}</td>
                      <td class="mono small">${esc(member.phone)}</td>
                      <td>${statusPill(member.status)}</td>
                      <td><button class="btn ghost small" type="button" data-pick-member="${esc(member.id)}" data-member-no="${esc(member.memberNo)}" data-member-name="${esc(member.name)}" data-member-phone="${esc(member.phone || '')}">选择</button></td>
                    </tr>`
                  )
                  .join('')}</tbody>
              </table></div>`
            : '<div class="empty">没有匹配的会员</div>';
          results.querySelectorAll('[data-pick-member]').forEach((pick) => {
            pick.addEventListener('click', () => {
              paintPicked({
                id: pick.dataset.pickMember,
                memberNo: pick.dataset.memberNo,
                name: pick.dataset.memberName,
                phone: pick.dataset.memberPhone
              });
              results.innerHTML = '';
              toast('已选择会员');
            });
          });
        } catch (error) {
          reportError(error);
        }
      });
    });
    const syncPaidField = () => {
      paidField.style.display = issueForm.elements.mode.value === 'MANUAL' ? '' : 'none';
    };
    issueForm.elements.mode.addEventListener('change', syncPaidField);
    syncPaidField();
    issueForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = formValues(issueForm);
      if (!values.memberId) return toast('请先搜索并选择会员', 'error');
      if (!values.productCode) return toast('请选择卡产品', 'error');
      const body = {
        memberId: values.memberId,
        productCode: values.productCode,
        mode: values.mode,
        soldBy: values.soldBy,
        note: values.note || undefined,
        orderRef: values.orderRef || undefined
      };
      if (values.mode === 'MANUAL') {
        const paidCents = Math.round(Number(values.paidYuan) * 100);
        if (!Number.isFinite(paidCents) || paidCents < 1) return toast('线下收款发卡需要填写实收金额', 'error');
        body.paidCents = paidCents;
      }
      await guard(event.submitter, async () => {
        try {
          const result = await api('/issued-cards', { method: 'POST', body });
          if (result.replayed) toast('该订单号已发过这张卡，已跳转到台账');
          else toast(values.mode === 'GIFT' ? '赠送卡已开通' : '发卡完成');
          location.hash = `#/issued-cards/${encodeURIComponent(result.card.cardId)}`;
        } catch (error) {
          reportError(error);
        }
      });
    });
  }

  async function renderIssuedCardDetail(ctx, id) {
    const data = await api(`/issued-cards/${encodeURIComponent(id)}`);
    const card = data.card;
    const member = data.member;
    const quote = data.quote;
    const retreat = data.retreat || {};
    const remote = retreat.order || null;
    const refunded = card.state === 'REFUNDED';
    const isRetreatCard = card.soldBy === 'ql' && card.source === 'PAID';
    const canRefund = can('crm:refund:force') && !refunded && ['PAID', 'MANUAL'].includes(card.source);
    ctx.setTitle(`${card.productName} 台账`, `${member.name || member.memberNo} · ${card.cardId}`);
    ctx.actions.innerHTML = `<a class="btn ghost small" href="#/issued-cards">返回台账</a>`;

    const quoteHtml = quote
      ? `<div class="grid cols-4" style="margin-bottom:12px">
          <div class="stat"><div class="label">实付</div><div class="value">${money(quote.paidCents)}</div><div class="sub">${esc(REFUND_TYPE_LABEL[quote.refundType] || '')}</div></div>
          <div class="stat"><div class="label">已享会员优惠</div><div class="value">${money(quote.savedCents)}</div><div class="sub">沿用订单减免口径</div></div>
          <div class="stat"><div class="label">已领实物礼</div><div class="value">${money(quote.redeemedGiftCents)}</div><div class="sub">退款时按价值扣除</div></div>
          <div class="stat"><div class="label">规则可退</div><div class="value">${money(quote.refundableCents)}</div><div class="sub">${esc(quote.window === 'WITHIN_7D' ? '7 天内' : '超过 7 天')}</div></div>
        </div>
        <div class="note">${quote.allowed ? pill('可退', 'green') : pill('不可退', 'red')} ${esc(quote.message)}<div class="help">7 天窗口至 ${fmt(quote.windowEndsAt)}；退款后会员资格立即撤销，未核销提货码作废。</div></div>`
      : `<div class="note">赠送或附赠的会员资格不涉及退款。</div>`;

    const retreatHtml = isRetreatCard
      ? `<div class="panel">
          <div class="panel-head"><h2>轻疗订单</h2><span class="help">单号 ${esc(card.orderRef)}</span></div>
          ${
            retreat.error
              ? `<div class="note">${esc(retreat.error)}</div>`
              : remote
                ? `<dl class="kv">
                    <dt>订单状态</dt><dd>${pill(RETREAT_STATE[Number(remote.state)] || remote.state, Number(remote.state) === 3 ? 'red' : Number(remote.state) === 1 ? 'green' : '')}</dd>
                    <dt>退款状态</dt><dd>${esc(RETREAT_REFUND_STATE[remote.refundState] || remote.refundState || '—')}${Number(remote.refundCents) ? ` · ${money(remote.refundCents)}` : ''}</dd>
                    <dt>CRM 已同步</dt><dd>${remote.crmRefunded ? pill('已同步', 'green') : '否'}</dd>
                    <dt>支付时间</dt><dd>${fmt(remote.payTime)}</dd>
                    <dt>退款时间</dt><dd>${fmt(remote.refundTime)}</dd>
                    <dt>支付异常</dt><dd class="small">${esc(remote.payError || '—')}</dd>
                  </dl>`
                : '<div class="empty">未取到轻疗订单快照</div>'
          }
        </div>`
      : '';

    const refundPanel =
      canRefund || (can('crm:card:edit') && isRetreatCard && !refunded)
        ? `<div class="panel">
            <div class="panel-head"><h2>退款与重试</h2><span class="help">${card.source === 'MANUAL' ? '手工发卡：CRM 只记账，资金由财务线下退回' : isRetreatCard ? '轻疗线上卡：先轻疗原路退款，成功后再落 CRM' : '该卡由售卡业务端收款，请在对应业务后台退款'}</span></div>
            ${
              canRefund
                ? `<div class="row-actions">
                    <button class="btn danger small" data-card-act="RULE"${quote && !quote.allowed ? ' disabled' : ''}>规则退款${quote && quote.allowed ? ` ${money(quote.refundableCents)}` : ''}</button>
                    <button class="btn danger small" data-card-act="NEGOTIATED">协商退款</button>
                    ${
                      isRetreatCard && remote && Number(remote.state) === 3
                        ? `<button class="btn small" data-card-act="SYNC">同步轻疗退款状态</button>`
                        : ''
                    }
                  </div>
                  ${quote && !quote.allowed ? `<div class="help" style="margin-top:8px">${esc(quote.message)}</div>` : ''}
                  <form id="negotiated-form" class="form-grid" style="margin-top:14px;display:none">
                    <div class="field"><label>退款金额（元）</label><input name="refundYuan" type="number" min="0.01" step="0.01" max="${(card.paidCents / 100).toFixed(2)}" value="${((quote && quote.allowed ? quote.refundableCents : card.paidCents) / 100).toFixed(2)}" required /></div>
                    <div class="field"><label>协商原因（至少 4 个字）</label><input name="reason" minlength="4" maxlength="200" placeholder="写清客诉与协商结果" required /></div>
                    <div class="full row-actions"><button class="btn danger small" type="submit">确认协商退款</button><button class="btn ghost small" type="button" id="negotiated-cancel">取消</button></div>
                  </form>`
                : ''
            }
            ${
              can('crm:card:edit') && isRetreatCard && !refunded
                ? `<div class="row-actions" style="margin-top:14px">
                    <button class="btn ghost small" data-card-retry="SETTLE">重试开卡</button>
                    <button class="btn ghost small" data-card-retry="CRM_REFUND">重试撤销</button>
                    <span class="help">用于支付成功但开卡未完成、或退款撤销未完成时的人工重试；每次重试都会留操作日志。</span>
                  </div>`
                : ''
            }
          </div>`
        : '';

    const voucherRows = data.vouchers.length
      ? data.vouchers
          .map(
            (voucher) => `<tr>
              <td class="mono">${esc(voucher.code)}</td>
              <td>${esc(voucher.title)}<div class="help">${esc(voucher.desc || '')}</div></td>
              <td>${money(voucher.valueCents)}</td>
              <td>${statusPill(voucher.status)}</td>
              <td class="small">${fmt(voucher.issuedAt)}</td>
              <td class="small">${voucher.redeemedAt ? `${fmt(voucher.redeemedAt)} · ${esc(voucher.redeemedStore || '')}` : '—'}</td>
            </tr>`
          )
          .join('')
      : emptyRow(6, '没有实物礼提货码');

    const benefits = Array.isArray(card.benefits) ? card.benefits : [];
    const presence = (card.perks && card.perks.presence) || null;
    const perkLines = [];
    if (benefits.length) perkLines.push(benefits.map((row) => `${esc(biz(row.business))}：${esc(row.title)}`).join('<br>'));
    if (presence) {
      perkLines.push(
        `在场：${presence.prioritySeat ? '优先排位' : '—'} · ${presence.tierPrice ? '阶梯价' : '—'} · 每月邀请 ${Number(presence.invitesPerMonth) || 0} 人`
      );
    }
    if (card.pointsSpend && Object.keys(card.pointsSpend).length) {
      perkLines.push(`积分消耗：${esc(JSON.stringify(card.pointsSpend))}`);
    }

    ctx.view.innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="label">实付</div><div class="value">${money(card.paidCents)}</div><div class="sub">${esc(SOURCE_LABEL[card.source] || card.source)}</div></div>
        <div class="stat"><div class="label">已退</div><div class="value">${money(card.refundCents)}</div><div class="sub">${refunded ? esc(REFUND_TYPE_LABEL[card.refundType] || card.refundType || '') : '未退款'}</div></div>
        <div class="stat"><div class="label">卡状态</div><div class="value" style="font-size:22px">${esc(cardStateText(card.effectiveState))}</div><div class="sub">${esc(card.validFrom)} → ${esc(card.validUntil)}</div></div>
        <div class="stat"><div class="label">愈行权益</div><div class="value" style="font-size:22px">${card.gameEnabled ? '已开通' : '未开通'}</div><div class="sub">三端登录同一 CRM 账本</div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>卡信息</h2><span class="help">操作日志可在「审计日志」按卡号检索</span></div>
        <dl class="kv">
          <dt>卡号</dt><dd class="mono">${esc(card.cardId)}</dd>
          <dt>会员</dt><dd><a href="#/members/${esc(member.id)}">${esc(member.name)}</a> · <span class="mono">${esc(member.memberNo)}</span>${member.phone ? ` · ${esc(member.phone)}` : ''}</dd>
          <dt>产品</dt><dd>${esc(card.productName)} <span class="help">v${card.version} · ${esc(card.productCode)}</span></dd>
          <dt>来源</dt><dd>${esc(SOURCE_LABEL[card.source] || card.source)}</dd>
          <dt>状态</dt><dd>${cardStatePill(card.effectiveState)}${card.state !== card.effectiveState ? ` <span class="help">库内 ${esc(cardStateText(card.state))}</span>` : ''}</dd>
          <dt>有效期</dt><dd>${esc(card.validFrom)} → ${esc(card.validUntil)}</dd>
          <dt>订单号</dt><dd class="mono">${esc(card.orderRef)}</dd>
          <dt>售出</dt><dd>${esc(card.soldByName || biz(card.soldBy))}</dd>
          <dt>发卡时间</dt><dd>${fmt(card.createdAt)}</dd>
          <dt>支付时间</dt><dd>${fmt(card.paidAt)}</dd>
          ${refunded ? `<dt>退款</dt><dd>${money(card.refundCents)} · ${esc(REFUND_TYPE_LABEL[card.refundType] || card.refundType || '')}<div class="help">${fmt(card.refundedAt)}${card.refundReason ? ` · ${esc(card.refundReason)}` : ''}</div></dd>` : ''}
          ${perkLines.length ? `<dt>权益</dt><dd class="small">${perkLines.join('<br>')}</dd>` : ''}
        </dl>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>退款试算</h2><span class="help">规则以 CRM 为准；轻疗线上卡由轻疗执行原路退款</span></div>
        ${quoteHtml}
      </div>

      ${refundPanel}
      ${retreatHtml}

      <div class="panel">
        <div class="panel-head"><h2>实物礼提货码</h2><a class="btn ghost small" href="#/vouchers">去核销</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>提货码</th><th>礼物</th><th>价值</th><th>状态</th><th>发放</th><th>核销</th></tr></thead>
          <tbody>${voucherRows}</tbody>
        </table></div>
      </div>

      ${
        can('crm:refund:force')
          ? `<div class="panel">
              <div class="panel-head"><h2>购买锁定</h2><span class="help">连续两次 7 天内退款会在轻疗锁定购买，客服核实后可解除</span></div>
              <div class="row-actions">
                <button class="btn ghost small" id="unlock-member"${member.phone ? '' : ' disabled'}>解除轻疗购买锁定</button>
                <span class="help">${member.phone ? `按手机号 ${esc(member.phone)} 在轻疗定位客户` : '会员缺少手机号，无法在轻疗定位客户'}</span>
              </div>
            </div>`
          : ''
      }`;

    const refundBody = (button, body, confirmText) => {
      if (!window.confirm(confirmText)) return;
      guard(button, async () => {
        try {
          const result = await api(`/issued-cards/${encodeURIComponent(card.cardId)}/refund`, { method: 'POST', body });
          if (result.amountMismatch) toast('退款已完成，但轻疗实退金额与试算不一致，请核对', 'error');
          else toast(result.offline ? '已记账，请财务线下退款' : '退款已完成');
          route();
        } catch (error) {
          if (error.code === 'CRM_SYNC_FAILED') window.alert(error.message);
          else reportError(error);
        }
      });
    };

    ctx.view.querySelectorAll('[data-card-act]').forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.cardAct;
        if (kind === 'RULE') {
          refundBody(
            button,
            { kind: 'RULE' },
            card.source === 'MANUAL'
              ? `按规则退款 ${money(quote ? quote.refundableCents : 0)}？CRM 将撤销会员资格并作废未核销提货码，资金由财务线下退回。`
              : `按规则退款 ${money(quote ? quote.refundableCents : 0)}？CRM 将调用轻疗原路退回，成功后撤销会员资格并作废未核销提货码。`
          );
          return;
        }
        if (kind === 'SYNC') {
          refundBody(button, { kind: 'SYNC' }, `轻疗侧已退款 ${money(remote && remote.refundCents)}，确认同步到 CRM 卡状态？`);
          return;
        }
        const form = document.getElementById('negotiated-form');
        form.style.display = form.style.display === 'none' ? 'grid' : 'none';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    const negotiatedForm = document.getElementById('negotiated-form');
    if (negotiatedForm) {
      document.getElementById('negotiated-cancel').addEventListener('click', () => {
        negotiatedForm.style.display = 'none';
      });
      negotiatedForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = formValues(negotiatedForm);
        const refundCents = Math.round(Number(values.refundYuan) * 100);
        if (!Number.isFinite(refundCents) || refundCents < 1) return toast('退款金额至少 0.01 元', 'error');
        if (refundCents > card.paidCents) return toast('退款金额不能超过实付金额', 'error');
        refundBody(
          event.submitter,
          { kind: 'NEGOTIATED', refundCents, reason: values.reason },
          card.source === 'MANUAL'
            ? `确认按 ${money(refundCents)} 协商退款？CRM 记账后资金由财务线下退回，此操作不可撤销。`
            : `确认按 ${money(refundCents)} 协商退款？将调用轻疗原路退回，此操作不可撤销。`
        );
      });
    }

    ctx.view.querySelectorAll('[data-card-retry]').forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.cardRetry;
        if (!window.confirm(kind === 'SETTLE' ? '重试轻疗开卡？' : '重试轻疗撤销退款？')) return;
        guard(button, async () => {
          try {
            await api(`/issued-cards/${encodeURIComponent(card.cardId)}/retry`, { method: 'POST', body: { kind } });
            toast('已提交重试');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });

    const unlock = document.getElementById('unlock-member');
    if (unlock) {
      unlock.addEventListener('click', () => {
        if (!window.confirm('确认解除该客户在轻疗的购买锁定？操作会写入审计日志。')) return;
        guard(unlock, async () => {
          try {
            const result = await api(`/members/${encodeURIComponent(member.id)}/unlock`, { method: 'POST', body: {} });
            toast(result.wasLocked ? '已解除购买锁定' : '客户原本未被锁定');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    }
  }

  /* ---------------------------------------------------------------- 会员码 */

  function campaignTone(display) {
    if (display === '领取中') return 'green';
    if (display === '已满' || display === '已截止' || display === 'PAUSED' || display === 'PENDING_APPROVAL') return 'amber';
    if (display === 'REJECTED') return 'red';
    return '';
  }

  const CAMPAIGN_LABEL = { PENDING_APPROVAL: '待审批', PAUSED: '已暂停', REJECTED: '已驳回' };
  const REFERRER_LABEL = { STAFF: '员工', THERAPIST: '疗愈师', PARTNER: '合作方' };

  function printGiftCard(print, campaign, qrDataUrl) {
    const win = window.open('', '_blank', 'width=720,height=520');
    if (!win) return toast('浏览器拦截了打印窗口，请允许弹窗后重试', 'error');
    win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>会员码 ${esc(print.code)}</title>
      <style>
        @page { size: 90mm 54mm; margin: 0; }
        body { margin: 0; font-family: "PingFang SC", "Noto Sans SC", sans-serif; letter-spacing: 0.05em; color: #3b2a1c; }
        .card { box-sizing: border-box; width: 90mm; height: 54mm; padding: 5mm 6mm; background: #f5f0e6; display: flex; gap: 4mm; }
        .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        .qr { width: 22mm; height: 22mm; align-self: center; flex: none; }
        .brand { font-size: 8.5pt; letter-spacing: 0.18em; color: #8a6a4a; }
        h1 { margin: 1.5mm 0 0; font-size: 12pt; letter-spacing: 0.06em; font-weight: 600; }
        .code { font-family: "SF Mono", Menlo, monospace; font-size: 16pt; letter-spacing: 0.18em; margin: 2mm 0 1mm; }
        .line { font-size: 7pt; line-height: 1.55; }
        .foot { font-size: 6.5pt; color: #8a6a4a; letter-spacing: 0.12em; display: flex; justify-content: space-between; gap: 2mm; }
        .tools { padding: 12px; font-size: 13px; }
        @media print { .tools { display: none; } }
      </style></head><body>
      <div class="tools"><button onclick="window.print()">打印</button> 名片尺寸 90×54mm；微信扫右侧小程序码，登录后自动领取。${campaign.quota ? `本码限 ${campaign.quota} 人领取` : '本码不限名额'}，可按需打印多张。</div>
      <div class="card">
        <div class="copy">
          <div><div class="brand">FULLYU · 城市微度假</div><h1>${esc(print.title)}</h1></div>
          <div class="code">${esc(print.code)}</div>
          <div class="line">微信扫右侧小程序码 · 登录后自动领取</div>
          <div class="foot"><span>${print.deadline ? `领取截止 ${esc(print.deadline)}` : '领取不设截止日'}</span><span>每人限领一次</span></div>
        </div>
        <img class="qr" src="${qrDataUrl}" alt="小程序码" />
      </div>
      </body></html>`);
    win.document.close();
  }

  async function pageGifts(ctx) {
    ctx.setTitle('会员码', '赠送品牌会员体验：渠道、推荐人、天数、名额与截止；超过 30 天需另一人审批');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const status = params.get('status') || '';
    const data = await api(`/gift-campaigns${query({ status })}`);
    const pending = data.items.filter((row) => row.status === 'PENDING_APPROVAL').length;
    ctx.view.innerHTML = `
      ${
        can('crm:gift:edit')
          ? `<div class="panel">
              <div class="panel-head"><h2>新建会员码</h2><span class="help">默认 30 天直接生效；超过 30 天提交审批，发起人不能自己审批</span></div>
              <form id="gift-form" class="form-grid">
                <div class="field"><label>活动名称</label><input name="name" required maxlength="40" placeholder="例：11 月茶会体验" /></div>
                <div class="field"><label>会员码（留空自动生成）</label><input name="code" maxlength="16" pattern="[A-Za-z0-9]{4,16}" placeholder="FYTEA30" style="text-transform:uppercase" /></div>
                <div class="field"><label>赠送天数</label><input name="days" type="number" min="1" max="365" value="30" required /></div>
                <div class="field"><label>名额（留空不限）</label><input name="quota" type="number" min="1" max="100000" placeholder="不限" /></div>
                <div class="field"><label>扫码打开</label><select name="appTarget">${options([['sx', '时叙小程序'], ['zc', '在场小程序'], ['ql', '轻疗小程序']], 'sx')}</select></div>
                <div class="field"><label>领取截止日（可空）</label><input name="claimDeadline" type="date" /></div>
                <div class="field"><label>渠道标签</label><input name="channelTag" maxlength="30" placeholder="例：茶会 / 企业团建 / 小红书" /></div>
                <div class="field"><label>推荐人类型（可空）</label><select name="referrerType">${options([['', '无'], ['STAFF', '员工'], ['THERAPIST', '疗愈师'], ['PARTNER', '合作方']], '')}</select></div>
                <div class="field"><label>推荐人</label><input name="referrerName" maxlength="30" placeholder="填了类型才记录" /></div>
                <div class="field full"><label>备注</label><input name="note" maxlength="200" /></div>
                <div class="full row-actions"><button class="btn small" type="submit">创建</button><span class="help">会员在三端「会员中心 · 会员码」输入领取，每人每码限一次，领取即开始计算有效期。</span></div>
              </form>
            </div>`
          : ''
      }
      <div class="panel">
        <div class="tabs">
          ${[['', '全部'], ['PENDING_APPROVAL', `待审批 ${pending}`], ['ACTIVE', '生效中'], ['PAUSED', '已暂停'], ['REJECTED', '已驳回']]
            .map(([key, label]) => `<button class="tab ${status === key ? 'active' : ''}" data-gift-status="${key}">${esc(label)}</button>`)
            .join('')}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>会员码</th><th>活动</th><th>天数</th><th>领取</th><th>截止</th><th>渠道 / 推荐人</th><th>状态</th><th>创建 / 审批</th><th>操作</th></tr></thead>
          <tbody>${
            data.items.length
              ? data.items
                  .map(
                    (row) => `<tr>
                      <td class="mono"><a href="#/gifts/${esc(row.id)}" data-gift-detail="${esc(row.id)}">${esc(row.code)}</a><div class="help">${esc(row.appName || '时叙')}小程序码</div></td>
                      <td>${esc(row.name)}${row.note ? `<div class="help">${esc(row.note)}</div>` : ''}</td>
                      <td>${row.days} 天${row.needsApproval ? `<div class="help">${row.status === 'PENDING_APPROVAL' ? '超 30 天 · 待审批' : '超 30 天 · 经审批'}</div>` : ''}</td>
                      <td>${row.claimed} / ${row.quota ?? '不限'}</td>
                      <td class="small">${esc(row.claimDeadline || '—')}</td>
                      <td class="small">${esc(row.channelTag || '—')}${row.referrerName ? `<div class="help">${esc(REFERRER_LABEL[row.referrerType] || '')} ${esc(row.referrerName)}</div>` : ''}</td>
                      <td>${pill(CAMPAIGN_LABEL[row.display] || row.display, campaignTone(row.display))}</td>
                      <td class="small">${esc(row.createdByName)}<div class="help">${row.approvedByName ? `审批：${esc(row.approvedByName)}` : fmt(row.createdAt)}</div></td>
                      <td><div class="row-actions">
                        <button class="btn ghost small" data-gift-qr="${esc(row.id)}" ${row.status === 'REJECTED' ? 'disabled' : ''}>二维码</button>
                        ${row.status === 'PENDING_APPROVAL' && can('crm:gift:approve') ? `<button class="btn small" data-gift-decide="approve:${esc(row.id)}">批准</button><button class="btn danger small" data-gift-decide="reject:${esc(row.id)}">驳回</button>` : ''}
                        ${row.status === 'ACTIVE' && can('crm:gift:edit') ? `<button class="btn ghost small" data-gift-toggle="pause:${esc(row.id)}">暂停</button>` : ''}
                        ${row.status === 'PAUSED' && can('crm:gift:edit') ? `<button class="btn ghost small" data-gift-toggle="resume:${esc(row.id)}">恢复</button>` : ''}
                      </div></td>
                    </tr>`
                  )
                  .join('')
              : emptyRow(9, '还没有会员码')
          }</tbody>
        </table></div>
      </div>
      <div id="gift-detail"></div>
      <div id="gift-qr"></div>`;

    const giftForm = document.getElementById('gift-form');
    if (giftForm) {
      giftForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(giftForm);
        const days = Number(values.days);
        if (days > 30 && !window.confirm(`${days} 天超过默认 30 天，将提交另一位同事审批后才能领取。继续？`)) return;
        try {
          await guard(event.submitter, async () => {
            const row = await api('/gift-campaigns', {
              method: 'POST',
              body: {
                name: values.name,
                code: (values.code || '').trim().toUpperCase() || undefined,
                days,
                quota: values.quota ? Number(values.quota) : null,
                claimDeadline: values.claimDeadline || undefined,
                channelTag: values.channelTag,
                referrerType: values.referrerType || undefined,
                referrerName: values.referrerName,
                appTarget: values.appTarget || 'sx',
                note: values.note
              }
            });
            toast(row.status === 'PENDING_APPROVAL' ? `会员码 ${row.code} 已提交审批` : `会员码 ${row.code} 已生效`);
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    }
    ctx.view.querySelectorAll('[data-gift-status]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/gifts${query({ status: button.dataset.giftStatus })}`;
      });
    });
    ctx.view.querySelectorAll('[data-gift-decide]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [action, id] = button.dataset.giftDecide.split(':');
        const note = window.prompt(action === 'approve' ? '审批意见（可留空）' : '驳回原因', '');
        if (note === null) return;
        await guard(button, async () => {
          try {
            await api(`/gift-campaigns/${id}/${action}`, { method: 'POST', body: { note } });
            toast(action === 'approve' ? '已批准，会员可以领取' : '已驳回');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
    ctx.view.querySelectorAll('[data-gift-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [action, id] = button.dataset.giftToggle.split(':');
        await guard(button, async () => {
          try {
            await api(`/gift-campaigns/${id}/${action}`, { method: 'POST', body: {} });
            toast(action === 'pause' ? '已暂停领取' : '已恢复领取');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
    const showDetail = async (id) => {
      const detail = await api(`/gift-campaigns/${id}`);
      const campaign = detail.campaign;
      const box = document.getElementById('gift-detail');
      box.innerHTML = `<div class="panel">
        <div class="panel-head"><h2>${esc(campaign.name)} · <span class="mono">${esc(campaign.code)}</span></h2><span class="help">${esc(campaign.appName || '时叙')}小程序 · 共 ${detail.claims.length} 人领取（最多显示 500）</span></div>
        ${
          can('crm:gift:edit') && campaign.status !== 'REJECTED'
            ? `<div class="row-actions">
                <label class="help" for="gift-target-select">扫码默认打开</label>
                <select id="gift-target-select">${options([['sx', '时叙小程序'], ['zc', '在场小程序'], ['ql', '轻疗小程序']], campaign.appTarget || 'sx')}</select>
                <button class="btn small" id="gift-target-save">保存目标端</button>
              </div>`
            : ''
        }
        <div class="table-wrap"><table>
          <thead><tr><th>会员</th><th>手机号</th><th>领取端</th><th>领取时间</th></tr></thead>
          <tbody>${
            detail.claims.length
              ? detail.claims
                  .map(
                    (claim) => `<tr><td><a href="#/members/${esc(claim.memberId)}">${esc(claim.name || claim.memberNo)}</a><div class="help mono">${esc(claim.memberNo)}</div></td><td class="mono small">${esc(claim.phone)}</td><td>${esc(claim.businessName || biz(claim.business))}</td><td class="small">${fmt(claim.claimedAt)}</td></tr>`
                  )
                  .join('')
              : emptyRow(4, '还没有人领取')
          }</tbody>
        </table></div>
      </div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const saveTarget = document.getElementById('gift-target-save');
      if (saveTarget) {
        saveTarget.addEventListener('click', () => {
          const appTarget = document.getElementById('gift-target-select').value;
          guard(saveTarget, async () => {
            try {
              await api(`/gift-campaigns/${id}/target`, { method: 'POST', body: { appTarget } });
              toast('扫码目标已更新；已印出的旧码不受影响');
              route();
            } catch (error) {
              reportError(error);
            }
          });
        });
      }
    };

    /** 生成/下载/打印小程序码。微信扫一扫必须是小程序码，普通链接二维码打不开小程序。 */
    const openQr = async (id) => {
      const detail = await api(`/gift-campaigns/${id}`);
      const campaign = detail.campaign;
      const box = document.getElementById('gift-qr');
      box.innerHTML = `<div class="panel">
        <div class="panel-head"><h2>会员码二维码 · <span class="mono">${esc(campaign.code)}</span></h2><span class="help">微信扫一扫直接打开${esc(campaign.appName || '时叙')}会员页，登录后自动领取 ${campaign.days} 天</span></div>
        <div class="row-actions">
          <select id="gift-qr-env">
            <option value="trial">体验版</option>
            <option value="develop">开发版</option>
            <option value="release">正式版</option>
          </select>
          <button class="btn small" id="gift-qr-refresh">生成 / 刷新</button>
          <button class="btn ghost small" id="gift-qr-download" disabled>下载 PNG</button>
          <button class="btn ghost small" id="gift-qr-print" disabled>打印卡</button>
        </div>
        <div id="gift-qr-stage" class="help">选择小程序版本后生成。二维码内容为 g=${esc(campaign.code)}，不会暴露会员手机号。</div>
        <p class="help">体验版/开发版需要对应版本可用；正式发布后请重新生成正式版并替换印刷物料。未配置该小程序密钥时，后台会明确提示而不会回退成普通链接码。</p>
      </div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });

      let currentUrl = '';
      const stage = document.getElementById('gift-qr-stage');
      const download = document.getElementById('gift-qr-download');
      const print = document.getElementById('gift-qr-print');
      const generate = async (button) => {
        const env = document.getElementById('gift-qr-env').value;
        stage.className = 'help';
        stage.textContent = '正在生成小程序码…';
        download.disabled = true;
        print.disabled = true;
        try {
          const blob = await apiBlob(`/gift-campaigns/${id}/qrcode?env=${env}`);
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = URL.createObjectURL(blob);
          stage.className = '';
          stage.innerHTML = `<img src="${currentUrl}" alt="会员码小程序码" class="gift-qr-img" />`;
          download.disabled = false;
          print.disabled = false;
        } catch (error) {
          stage.className = 'help';
          stage.textContent = error.message || '二维码生成失败，请稍后重试';
        } finally {
          if (button) button.disabled = false;
        }
      };
      download.addEventListener('click', () => {
        if (!currentUrl) return;
        const env = document.getElementById('gift-qr-env').value;
        const link = document.createElement('a');
        link.href = currentUrl;
        link.download = `gift-${campaign.code}-${campaign.appTarget || 'sx'}-${env}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
      print.addEventListener('click', () => {
        if (!currentUrl) return;
        fetch(currentUrl)
          .then((response) => response.blob())
          .then(
            (blob) =>
              new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              })
          )
          .then((dataUrl) => printGiftCard(detail.print, campaign, dataUrl))
          .catch(() => toast('读取二维码失败，请重新生成', 'error'));
      });
      document.getElementById('gift-qr-refresh').addEventListener('click', (event) => {
        event.currentTarget.disabled = true;
        generate(event.currentTarget).catch(reportError);
      });
    };
    ctx.view.querySelectorAll('[data-gift-detail]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showDetail(link.dataset.giftDetail).catch(reportError);
      });
    });
    ctx.view.querySelectorAll('[data-gift-qr]').forEach((button) => {
      button.addEventListener('click', () => guard(button, () => openQr(button.dataset.giftQr)).catch(reportError));
    });
    if (ctx.param && !ctx.param.includes('?')) showDetail(ctx.param).catch(reportError);
  }

  /* ---------------------------------------------------------------- 提货核销 */

  const STORE_KEY = 'fullyu.crm.redeemStore';

  async function pageVouchers(ctx) {
    ctx.setTitle('提货核销', '年卡实物礼：会员出示提货码，任意门店核销一次；重复核销会被拒绝');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const code = (params.get('code') || '').trim().toUpperCase();
    let result = null;
    let lookupError = '';
    if (code) {
      try {
        result = await api(`/vouchers/${encodeURIComponent(code)}`);
      } catch (error) {
        if (error.status === 401) return;
        lookupError = error.message;
      }
    }
    const store = localStorage.getItem(STORE_KEY) || '';
    const voucher = result && result.voucher;
    ctx.view.innerHTML = `
      <div class="panel">
        <form id="voucher-search" class="toolbar">
          <div class="field"><label>提货码</label><input name="code" value="${esc(code)}" maxlength="16" required placeholder="会员页显示的 8 位码" style="text-transform:uppercase;letter-spacing:0.18em" autofocus /></div>
          <button class="btn small" type="submit">查询</button>
          <span class="help">只显示脱敏手机号，核对会员本人后再交付。</span>
        </form>
      </div>
      ${lookupError ? `<div class="panel"><div class="empty">${esc(lookupError)}</div></div>` : ''}
      ${
        voucher
          ? `<div class="panel">
              <div class="panel-head"><h2>${esc(voucher.title)} ${statusPill(voucher.status)}</h2><span class="mono">${esc(voucher.code)}</span></div>
              <dl class="kv">
                <dt>说明</dt><dd>${esc(voucher.desc || '—')}</dd>
                <dt>价值</dt><dd>${money(voucher.valueCents)}<span class="help">（7 天内退卡时按此扣除）</span></dd>
                <dt>会员</dt><dd>${esc(result.member.name || '')} · <span class="mono">${esc(result.member.memberNo)}</span> · ${esc(result.member.phoneMasked)}</dd>
                <dt>会员资格</dt><dd>${result.card ? `${esc(result.card.productName)} ${cardStatePill(result.card.state)} · ${esc(result.card.validFrom)} → ${esc(result.card.validUntil)}` : '—'}</dd>
                <dt>发放</dt><dd>${fmt(voucher.issuedAt)}</dd>
                ${voucher.redeemedAt ? `<dt>核销</dt><dd>${fmt(voucher.redeemedAt)} · ${esc(voucher.redeemedStore)} · ${esc(voucher.redeemedByName || '')}</dd>` : ''}
                ${voucher.voidReason ? `<dt>作废原因</dt><dd>${esc(voucher.voidReason)}</dd>` : ''}
              </dl>
              ${
                voucher.status === 'ISSUED'
                  ? `<form id="redeem-form" class="form-grid" style="margin-top:16px">
                      <div class="field"><label>核销门店</label><input name="store" value="${esc(store)}" required maxlength="40" placeholder="例：时叙 · 静安店" /></div>
                      <div class="field" style="align-self:end"><button class="btn small" type="submit">确认已交付并核销</button></div>
                    </form>`
                  : ''
              }
            </div>`
          : ''
      }`;
    document.getElementById('voucher-search').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/vouchers${query({ code: (values.code || '').trim().toUpperCase() })}`;
    });
    const redeemForm = document.getElementById('redeem-form');
    if (redeemForm) {
      redeemForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(redeemForm);
        if (!window.confirm(`确认已把「${voucher.title}」交给会员？核销后不可撤销。`)) return;
        localStorage.setItem(STORE_KEY, values.store);
        try {
          await guard(event.submitter, async () => {
            await api(`/vouchers/${encodeURIComponent(voucher.code)}/redeem`, {
              method: 'POST',
              body: { store: values.store }
            });
            toast('已核销');
            route();
          });
        } catch (error) {
          reportError(error);
          if (error.status === 409) route();
        }
      });
    }
  }

  /* ---------------------------------------------------------------- 反馈与故事 */

  const FEEDBACK_LABEL = { NEW: '新反馈', READ: '已读', ARCHIVED: '已归档' };
  const STORY_LABEL = { DRAFT: '草稿', PUBLISHED: '已发布', ARCHIVED: '已下线' };
  const NOTICE_SCOPE_LABEL = { all: '三端会员', teahour: '时叙会员', presence: '在场会员', retreat: '轻疗会员' };

  async function pageFeedback(ctx) {
    ctx.setTitle('反馈与故事', '会员意见仅后台可见；同意摘录的反馈可由工作人员整理成会员故事；公告只对有效品牌会员展示');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const status = params.get('status') ?? 'NEW';
    const [feedback, stories, notices] = await Promise.all([
      api(`/feedback${query({ status })}`),
      api('/stories'),
      api('/notices')
    ]);
    const byId = new Map(feedback.items.map((row) => [row.id, row]));
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="tabs">
          ${[['NEW', '新反馈'], ['READ', '已读'], ['ARCHIVED', '已归档'], ['', '全部']]
            .map(([key, label]) => `<button class="tab ${status === key ? 'active' : ''}" data-fb-status="${key}">${esc(label)}</button>`)
            .join('')}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>会员</th><th>来源</th><th>内容</th><th>摘录</th><th>状态 / 备注</th><th>操作</th></tr></thead>
          <tbody>${
            feedback.items.length
              ? feedback.items
                  .map(
                    (row) => `<tr>
                      <td><a href="#/members/${esc(row.memberId)}">${esc(row.name || row.memberNo)}</a><div class="help mono">${esc(row.phone)}</div></td>
                      <td class="small">${esc(row.businessName || biz(row.business))}<div class="help">${fmt(row.createdAt)}</div></td>
                      <td style="max-width:420px;white-space:pre-wrap">${esc(row.content)}</td>
                      <td>${row.allowQuote ? pill('同意', 'green') : pill('不同意')}</td>
                      <td>${pill(FEEDBACK_LABEL[row.status] || row.status, STATUS_TONE[row.status] || '')}${row.staffNote ? `<div class="help">${esc(row.staffNote)}</div>` : ''}${row.handledByName ? `<div class="help">${esc(row.handledByName)}</div>` : ''}</td>
                      <td><div class="row-actions">
                        ${row.status === 'NEW' ? `<button class="btn ghost small" data-fb="READ:${esc(row.id)}">标为已读</button>` : ''}
                        ${row.status !== 'ARCHIVED' ? `<button class="btn ghost small" data-fb="ARCHIVED:${esc(row.id)}">归档</button>` : ''}
                        <button class="btn ghost small" data-fb-note="${esc(row.id)}">备注</button>
                        ${row.allowQuote ? `<button class="btn small" data-fb-story="${esc(row.id)}">写成故事</button>` : ''}
                      </div></td>
                    </tr>`
                  )
                  .join('')
              : emptyRow(6, status === 'NEW' ? '没有新的反馈' : '暂无记录')
          }</tbody>
        </table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>会员故事</h2><button class="btn ghost small" id="story-new">新建故事</button></div>
        <div id="story-editor" style="display:none;margin-bottom:16px"></div>
        <div class="table-wrap"><table>
          <thead><tr><th>标题</th><th>会员原话</th><th>我们做了什么</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${
            stories.items.length
              ? stories.items
                  .map(
                    (row) => `<tr>
                      <td>${esc(row.title)}<div class="help">${esc(biz(row.business) === '—' ? '' : biz(row.business))} · 排序 ${row.sort}</div></td>
                      <td class="small" style="max-width:280px">「${esc(row.quote)}」${row.quoteBy ? `<div class="help">— ${esc(row.quoteBy)}</div>` : ''}</td>
                      <td class="small" style="max-width:360px;white-space:pre-wrap">${esc(row.story)}</td>
                      <td>${pill(STORY_LABEL[row.status] || row.status, STATUS_TONE[row.status] || '')}${row.publishedAt ? `<div class="help">${fmt(row.publishedAt, false)}</div>` : ''}</td>
                      <td><div class="row-actions">
                        <button class="btn ghost small" data-story-edit="${esc(row.id)}">编辑</button>
                        ${row.status !== 'PUBLISHED' ? `<button class="btn small" data-story-status="publish:${esc(row.id)}">发布</button>` : `<button class="btn ghost small" data-story-status="archive:${esc(row.id)}">下线</button>`}
                      </div></td>
                    </tr>`
                  )
                  .join('')
              : emptyRow(5, '还没有会员故事')
          }</tbody>
        </table></div>
        <p class="help" style="margin-top:10px">只能关联会员勾选「同意摘录」的反馈；原话署名建议用昵称或「一位时叙会员」，不写全名与手机号。</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>会员公告</h2><button class="btn ghost small" id="notice-new">新建公告</button></div>
        <div id="notice-editor" style="display:none;margin-bottom:16px"></div>
        <div class="table-wrap"><table>
          <thead><tr><th>标题</th><th>内容</th><th>范围 / 门店</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${
            notices.items.length
              ? notices.items
                  .map(
                    (row) => `<tr>
                      <td>${esc(row.title)}${row.pinned ? ` ${pill('置顶', 'green')}` : ''}<div class="help">${esc(row.createdByName || '')}</div></td>
                      <td class="small" style="max-width:360px;white-space:pre-wrap">${esc(row.body)}</td>
                      <td>${esc(NOTICE_SCOPE_LABEL[row.business] || row.business)}${row.store ? `<div class="help">${esc(row.store)}</div>` : '<div class="help">全部门店</div>'}</td>
                      <td class="small">${row.expireAt ? esc(day(row.expireAt)) : '<span class="help">长期</span>'}</td>
                      <td>${pill(STORY_LABEL[row.status] || row.status, STATUS_TONE[row.status] || '')}${row.publishedAt ? `<div class="help">${fmt(row.publishedAt, false)}</div>` : ''}</td>
                      <td><div class="row-actions">
                        <button class="btn ghost small" data-notice-edit="${esc(row.id)}">编辑</button>
                        ${row.status !== 'PUBLISHED' ? `<button class="btn small" data-notice-status="publish:${esc(row.id)}">发布</button>` : `<button class="btn ghost small" data-notice-status="archive:${esc(row.id)}">下线</button>`}
                      </div></td>
                    </tr>`
                  )
                  .join('')
              : emptyRow(6, '还没有会员公告')
          }</tbody>
        </table></div>
        <p class="help" style="margin-top:10px">公告只对有效品牌会员展示；填了有效期的公告过期后自动从会员端消失，置顶公告按发布时间排在黑板报最前。</p>
      </div>`;

    ctx.view.querySelectorAll('[data-fb-status]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/feedback?status=${encodeURIComponent(button.dataset.fbStatus)}`;
      });
    });
    const updateFeedback = async (id, body, button) => {
      await guard(button, async () => {
        try {
          await api(`/feedback/${id}`, { method: 'POST', body });
          toast('已更新');
          route();
        } catch (error) {
          reportError(error);
        }
      });
    };
    ctx.view.querySelectorAll('[data-fb]').forEach((button) => {
      button.addEventListener('click', () => {
        const [next, id] = button.dataset.fb.split(':');
        updateFeedback(id, { status: next }, button);
      });
    });
    ctx.view.querySelectorAll('[data-fb-note]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = byId.get(button.dataset.fbNote);
        const note = window.prompt('处理备注（仅后台可见）', row?.staffNote || '');
        if (note === null) return;
        updateFeedback(button.dataset.fbNote, { staffNote: note, status: row?.status === 'NEW' ? 'READ' : undefined }, button);
      });
    });

    const editor = document.getElementById('story-editor');
    const openEditor = (story, feedbackRow) => {
      const value = story || {
        title: '',
        quote: feedbackRow ? feedbackRow.content.slice(0, 300) : '',
        quoteBy: feedbackRow ? `一位${feedbackRow.businessName || ''}会员` : '',
        story: '',
        business: feedbackRow ? feedbackRow.business : '',
        sort: 0,
        feedbackId: feedbackRow ? feedbackRow.id : ''
      };
      editor.style.display = 'block';
      editor.innerHTML = `<form id="story-form" class="form-grid">
        <input type="hidden" name="feedbackId" value="${esc(value.feedbackId || '')}" />
        <div class="field"><label>标题</label><input name="title" required maxlength="40" value="${esc(value.title)}" placeholder="例：茶单上多了一杯无咖啡因" /></div>
        <div class="field"><label>业态</label><select name="business">${options([['', '品牌'], ...BUSINESS_OPTIONS], value.business || '')}</select></div>
        <div class="field full"><label>会员原话摘录</label><textarea name="quote" rows="2" required maxlength="300">${esc(value.quote)}</textarea></div>
        <div class="field"><label>署名</label><input name="quoteBy" maxlength="30" value="${esc(value.quoteBy)}" /></div>
        <div class="field"><label>排序（小的在前）</label><input name="sort" type="number" value="${Number(value.sort) || 0}" /></div>
        <div class="field full"><label>我们做了什么</label><textarea name="story" rows="4" required maxlength="1500" placeholder="说清楚听到之后改了什么、什么时候上线">${esc(value.story)}</textarea></div>
        <div class="full row-actions"><button class="btn small" type="submit">${story ? '保存' : '保存为草稿'}</button><button class="btn ghost small" type="button" id="story-cancel">取消</button>${value.feedbackId ? `<span class="help">关联反馈 ${esc(value.feedbackId)}</span>` : ''}</div>
      </form>`;
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      editor.querySelector('#story-cancel').addEventListener('click', () => {
        editor.style.display = 'none';
        editor.innerHTML = '';
      });
      const form = editor.querySelector('#story-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(form);
        try {
          await guard(event.submitter, async () => {
            await api(story ? `/stories/${story.id}` : '/stories', {
              method: 'POST',
              body: {
                title: values.title,
                quote: values.quote,
                quoteBy: values.quoteBy,
                story: values.story,
                business: values.business,
                sort: Number(values.sort) || 0,
                feedbackId: values.feedbackId || undefined
              }
            });
            toast(story ? '故事已保存' : '草稿已保存，发布后会员可见');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    };
    document.getElementById('story-new').addEventListener('click', () => openEditor(null, null));
    ctx.view.querySelectorAll('[data-fb-story]').forEach((button) => {
      button.addEventListener('click', () => openEditor(null, byId.get(button.dataset.fbStory)));
    });
    ctx.view.querySelectorAll('[data-story-edit]').forEach((button) => {
      button.addEventListener('click', () => openEditor(stories.items.find((row) => row.id === button.dataset.storyEdit), null));
    });
    ctx.view.querySelectorAll('[data-story-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [action, id] = button.dataset.storyStatus.split(':');
        if (action === 'publish' && !window.confirm('发布后所有品牌会员都能在会员故事里看到，确认发布？')) return;
        await guard(button, async () => {
          try {
            await api(`/stories/${id}/${action}`, { method: 'POST', body: {} });
            toast(action === 'publish' ? '已发布' : '已下线');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });

    const noticeEditor = document.getElementById('notice-editor');
    const openNoticeEditor = (notice) => {
      const value = notice || { title: '', body: '', business: 'all', pinned: false, store: '', coverUrl: '', expireAt: null };
      noticeEditor.style.display = 'block';
      noticeEditor.innerHTML = `<form id="notice-form" class="form-grid">
        <div class="field"><label>标题</label><input name="title" required maxlength="40" value="${esc(value.title)}" placeholder="例：十二月会员礼遇" /></div>
        <div class="field"><label>展示范围</label><select name="business">${options(Object.entries(NOTICE_SCOPE_LABEL), value.business || 'all')}</select></div>
        <div class="field"><label>门店（可空）</label><input name="store" maxlength="20" value="${esc(value.store || '')}" placeholder="例：上海·徐汇店；留空 = 全部门店" /></div>
        <div class="field"><label>展示有效期（可空）</label><input name="expireAt" type="date" value="${esc(day(value.expireAt))}" /></div>
        <div class="field full"><label>封面图（可空）</label><input name="coverUrl" maxlength="300" value="${esc(value.coverUrl || '')}" placeholder="https://… 建议 16:9 横图，留空则只显示文字纸条" /></div>
        <div class="field full"><label>公告内容</label><textarea name="body" rows="3" required maxlength="300" placeholder="一句话说清会员需要知道的事">${esc(value.body)}</textarea></div>
        <div class="field full"><label><input type="checkbox" name="pinned" ${value.pinned ? 'checked' : ''} /> 置顶（排在黑板报最前）</label></div>
        <div class="full row-actions"><button class="btn small" type="submit">${notice ? '保存' : '保存为草稿'}</button><button class="btn ghost small" type="button" id="notice-cancel">取消</button></div>
      </form>`;
      noticeEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      noticeEditor.querySelector('#notice-cancel').addEventListener('click', () => {
        noticeEditor.style.display = 'none';
        noticeEditor.innerHTML = '';
      });
      const form = noticeEditor.querySelector('#notice-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = formValues(form);
        try {
          await guard(event.submitter, async () => {
            await api(notice ? `/notices/${notice.id}` : '/notices', {
              method: 'POST',
              body: {
                title: values.title,
                body: values.body,
                business: values.business,
                pinned: Boolean(values.pinned),
                store: values.store || '',
                coverUrl: values.coverUrl || '',
                expireAt: values.expireAt || null
              }
            });
            toast(notice ? '公告已保存' : '草稿已保存，发布后会员可见');
            route();
          });
        } catch (error) {
          reportError(error);
        }
      });
    };
    document.getElementById('notice-new').addEventListener('click', () => openNoticeEditor(null));
    ctx.view.querySelectorAll('[data-notice-edit]').forEach((button) => {
      button.addEventListener('click', () => openNoticeEditor(notices.items.find((row) => row.id === button.dataset.noticeEdit)));
    });
    ctx.view.querySelectorAll('[data-notice-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [action, id] = button.dataset.noticeStatus.split(':');
        if (action === 'publish' && !window.confirm('发布后有效品牌会员会在会员中心看到这条公告，确认发布？')) return;
        await guard(button, async () => {
          try {
            await api(`/notices/${id}/${action}`, { method: 'POST', body: {} });
            toast(action === 'publish' ? '已发布' : '已下线');
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 同步 */

  async function pageSync(ctx) {
    ctx.setTitle('三端同步', '业务调用会更新最近可见时间；事件投递失败进入异常队列');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const status = params.get('status') || '';
    const business = params.get('business') || '';
    const [sync, events] = await Promise.all([
      api('/sync/status'),
      api(`/sync/events${query({ status, business, limit: 100 })}`)
    ]);
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>同步状态</h2>
          <div class="row-actions">
            ${can('crm:sync:retry') ? '<button class="btn small" id="run-sync">立即投递到期事件</button>' : ''}
            <button class="btn ghost small" id="reload-sync">刷新</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>业务端</th><th>最近调用</th><th>路径</th><th>滞后</th><th>Webhook</th><th>待投递</th><th>失败</th><th>已投递</th></tr></thead>
          <tbody>
            ${sync.businesses
              .map(
                (row) => `<tr>
                  <td>${esc(biz(row.business))}</td>
                  <td class="small">${esc(fmt(row.lastSeenAt))}</td>
                  <td class="mono small">${esc(row.lastPath)}</td>
                  <td>${row.lagSeconds === null ? '—' : `${row.lagSeconds}s`}</td>
                  <td>${row.webhookConfigured ? pill('已配置', 'green') : pill('未配置', 'amber')}</td>
                  <td>${row.pending}</td>
                  <td>${row.failed ? pill(String(row.failed), 'red') : '0'}</td>
                  <td>${row.snapshotVersion}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table></div>
        <p class="help" style="margin-top:10px">总计待投递 ${sync.pending} · 失败 ${sync.failed}。未配置 Webhook 的端不会自动投递，事件保持待处理。</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>事件</h2>
          <form id="event-filter" class="toolbar">
            <div class="field"><label>状态</label><select name="status">${options([['', '全部'], ['PENDING', '待投递'], ['DELIVERED', '已投递'], ['FAILED', '失败'], ['IGNORED', '忽略']], status)}</select></div>
            <div class="field"><label>业务</label><select name="business">${options([['', '全部'], ['teahour', '时叙'], ['retreat', '轻疗'], ['presence', '在场']], business)}</select></div>
            <button class="btn small" type="submit">筛选</button>
          </form>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>事件</th><th>业务</th><th>会员</th><th>状态</th><th>尝试</th><th>下次尝试</th><th>时间</th><th>错误 / 操作</th></tr></thead>
          <tbody>
            ${
              events.events.length
                ? events.events
                    .map(
                      (row) => `<tr>
                        <td class="mono small">${esc(row.id)}<div class="help">${esc(row.topic)}</div></td>
                        <td>${esc(biz(row.business))}</td>
                        <td class="mono small">${esc(row.memberId || '')}</td>
                        <td>${statusPill(row.status)}</td>
                        <td>${row.attempts}</td>
                        <td class="small">${esc(fmt(row.nextAttemptAt))}</td>
                        <td class="small">${esc(fmt(row.createdAt))}</td>
                        <td class="small">${esc(row.lastError || '—')}
                          ${row.status !== 'DELIVERED' && can('crm:sync:retry') ? `<div><button class="btn ghost small" data-retry="${esc(row.id)}">重投</button></div>` : ''}
                        </td>
                      </tr>`
                    )
                    .join('')
                : emptyRow(8, '没有事件')
            }
          </tbody>
        </table></div>
      </div>`;
    document.getElementById('reload-sync').addEventListener('click', () => route());
    const run = document.getElementById('run-sync');
    if (run) {
      run.addEventListener('click', async () => {
        await guard(run, async () => {
          try {
            const result = await api('/sync/run', { method: 'POST', body: {} });
            toast(`扫描 ${result.scanned}，成功 ${result.delivered}，失败 ${result.failed}，跳过 ${result.skipped}`);
            refreshBadges();
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    }
    document.getElementById('event-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/sync${query({ status: values.status, business: values.business })}`;
    });
    ctx.view.querySelectorAll('[data-retry]').forEach((button) => {
      button.addEventListener('click', async () => {
        await guard(button, async () => {
          try {
            await api(`/sync/events/${button.dataset.retry}/retry`, { method: 'POST', body: {} });
            toast('已重置为待投递');
            refreshBadges();
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 异常队列 */

  async function pageQueue(ctx) {
    ctx.setTitle('异常队列', '投递失败与过期报价集中处理；重投会清零尝试次数');
    const data = await api('/queue');
    ctx.view.innerHTML = `
      <div class="grid cols-2">
        <div class="stat"><div class="label">投递失败事件</div><div class="value">${data.counts.outboxFailed}</div><div class="sub">达到最大尝试次数后进入此处</div></div>
        <div class="stat"><div class="label">过期未使用报价</div><div class="value">${data.counts.expiredQuotes}</div><div class="sub">仅统计，不影响已售卡</div></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>待处理</h2><button class="btn ghost small" id="reload-queue">刷新</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>事项</th><th>业务</th><th>尝试</th><th>错误</th><th>时间</th><th></th></tr></thead>
          <tbody>
            ${
              data.items.length
                ? data.items
                    .map(
                      (item) => `<tr>
                        <td>${esc(item.title)}<div class="help mono">${esc(item.id)} · ${esc(item.topic)}</div></td>
                        <td>${esc(biz(item.business))}</td>
                        <td>${item.attempts}</td>
                        <td class="small">${esc(item.detail || '—')}</td>
                        <td class="small">${esc(fmt(item.createdAt))}</td>
                        <td><button class="btn small" data-queue-retry="${esc(item.id)}">重投</button></td>
                      </tr>`
                    )
                    .join('')
                : emptyRow(6, '队列为空')
            }
          </tbody>
        </table></div>
      </div>`;
    document.getElementById('reload-queue').addEventListener('click', () => route());
    ctx.view.querySelectorAll('[data-queue-retry]').forEach((button) => {
      button.addEventListener('click', async () => {
        await guard(button, async () => {
          try {
            await api(`/queue/${button.dataset.queueRetry}/retry`, { method: 'POST', body: {} });
            toast('已重置为待投递，等待下次同步');
            refreshBadges();
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 月度对账 */

  async function pageReports(ctx) {
    const nowMonth = shanghaiMonth();
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const month = params.get('month') || nowMonth;
    ctx.setTitle('月度对账', '只出事实数据：年卡售卖、积分发行/消耗、骰子发放/消耗');
    const report = await api(`/reports/monthly${query({ month })}`);
    const businesses = ['teahour', 'retreat', 'presence'];
    ctx.view.innerHTML = `
      <div class="panel">
        <form id="report-filter" class="toolbar">
          <div class="field"><label>月份（上海时区）</label><input name="month" type="month" value="${esc(month)}" required /></div>
          <button class="btn small" type="submit">查看</button>
          <span class="help">${esc(fmt(report.range.from, false))} → ${esc(fmt(report.range.to, false))}</span>
        </form>
      </div>
      <div class="grid cols-3">
        <div class="stat"><div class="label">本月售卡</div><div class="value">${report.cards.total.count}</div><div class="sub">实收 ${money(report.cards.total.grossCents)}</div></div>
        <div class="stat"><div class="label">本月发行积分</div><div class="value">${businesses.reduce((sum, key) => sum + (report.points.issued[key] || 0), 0)}</div><div class="sub">按发行业务归属</div></div>
        <div class="stat"><div class="label">本月发放骰子</div><div class="value">${businesses.reduce((sum, key) => sum + (report.dice.issued[key] || 0), 0)}</div><div class="sub">已掷出 ${report.dice.rolled} · 退款收回 ${report.dice.refunded}</div></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><h2>年卡售卖</h2><span class="help">按购买时售卖端归属</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>售卖端</th><th>售出</th><th>实收</th><th>退款卡数</th></tr></thead>
          <tbody>${businesses
            .map(
              (key) => `<tr>
                <td>${esc(biz(key))}</td>
                <td>${report.cards.sold[key]?.count || 0}</td>
                <td>${money(report.cards.sold[key]?.grossCents || 0)}</td>
                <td>${report.cards.refunded[key] || 0}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>积分</h2><span class="help">消耗含核销、调整、退回与到期</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>业务端</th><th>发行</th><th>消耗</th><th>人工调整</th></tr></thead>
          <tbody>${businesses
            .map(
              (key) => `<tr>
                <td>${esc(biz(key))}</td>
                <td>${report.points.issued[key] || 0}</td>
                <td>${report.points.consumed[key] || 0}</td>
                <td>${report.points.adjusted[key] || 0}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>骰子</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>业务端</th><th>发放</th></tr></thead>
          <tbody>${businesses
            .map((key) => `<tr><td>${esc(biz(key))}</td><td>${report.dice.issued[key] || 0}</td></tr>`)
            .join('')}
            <tr><td>已掷出</td><td>${report.dice.rolled}</td></tr>
            <tr><td>退款收回</td><td>${report.dice.refunded}</td></tr>
          </tbody>
        </table></div>
        <div class="note" style="margin-top:14px">
          ${esc(report.usageNote)}<br>
          已享优惠：${money(report.savedCents)}（业务核销明细未接入）· 生成于 ${esc(fmt(report.generatedAt))}
        </div>
      </div>`;
    document.getElementById('report-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/reports${query({ month: values.month })}`;
    });
  }

  /* ---------------------------------------------------------------- 审计 */

  async function pageAudit(ctx) {
    ctx.setTitle('审计日志', '登录、查看档案、积分调整、卡与规则变更、权限调整均只追加');
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const action = params.get('action') || '';
    const actor = params.get('actor') || '';
    const q = params.get('q') || '';
    const data = await api(`/audit${query({ action, actor, q })}`);
    ctx.view.innerHTML = `
      <div class="panel">
        <form id="audit-filter" class="toolbar">
          <div class="field"><label>动作</label><input name="action" value="${esc(action)}" placeholder="例：登录后台" /></div>
          <div class="field"><label>操作人</label><input name="actor" value="${esc(actor)}" /></div>
          <div class="field"><label>关键词</label><input name="q" value="${esc(q)}" placeholder="会员号 / 详情" /></div>
          <button class="btn small" type="submit">筛选</button>
        </form>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th></tr></thead>
          <tbody>
            ${
              data.logs.length
                ? data.logs
                    .map(
                      (log) => `<tr>
                        <td class="small">${esc(fmt(log.at))}</td>
                        <td>${esc(log.actorName)}</td>
                        <td>${esc(log.action)}</td>
                        <td class="mono small">${esc(log.target)}</td>
                        <td class="small">${esc(log.detail || '')}</td>
                      </tr>`
                    )
                    .join('')
                : emptyRow(5)
            }
          </tbody>
        </table></div>
        <p class="help" style="margin-top:10px">最多显示最近 100 条。</p>
      </div>`;
    document.getElementById('audit-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(event.target);
      location.hash = `#/audit${query(values)}`;
    });
  }

  /* ---------------------------------------------------------------- 角色权限 */

  async function pageRoles(ctx) {
    ctx.setTitle('角色权限', '修改按请求即时生效；CRM 管理员固定全部权限，不能修改');
    const data = await api('/roles');
    const perms = data.permissions;
    ctx.view.innerHTML = `
      <div class="panel">
        <div class="matrix">
          <table>
            <thead><tr><th>权限</th>${data.roles.map((role) => `<th>${esc(role.name)}<div class="help">${esc(role.id)}</div></th>`).join('')}</tr></thead>
            <tbody>
              ${perms
                .map(
                  (perm) => `<tr>
                    <td>${esc(perm.name)}<div class="help mono">${esc(perm.code)}</div></td>
                    ${data.roles
                      .map((role) => {
                        const admin = role.perms.includes('*');
                        const checked = admin || role.perms.includes(perm.code);
                        return `<td><label class="check"><input type="checkbox" data-role="${esc(role.id)}" data-perm="${esc(perm.code)}" ${
                          checked ? 'checked' : ''
                        } ${admin ? 'disabled' : ''} />${admin ? '全部' : ''}</label></td>`;
                      })
                      .join('')}
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>保存角色</h2><span class="help">取消勾选并保存后，该角色下一次请求即失去权限</span></div>
        <div class="row-actions">
          ${data.roles
            .filter((role) => !role.perms.includes('*'))
            .map((role) => `<button class="btn small" data-save-role="${esc(role.id)}">保存 ${esc(role.name)}</button>`)
            .join('')}
        </div>
        <div class="note" style="margin-top:14px">内置角色除 CRM 管理员外可直接调整。若把当前账号所在角色的权限改掉，刷新后导航会按新权限收拢。</div>
      </div>`;
    ctx.view.querySelectorAll('[data-save-role]').forEach((button) => {
      button.addEventListener('click', async () => {
        const roleId = button.dataset.saveRole;
        const perms = [...ctx.view.querySelectorAll(`input[data-role="${roleId}"]:checked`)].map(
          (input) => input.dataset.perm
        );
        await guard(button, async () => {
          try {
            await api(`/roles/${roleId}`, { method: 'PATCH', body: { perms } });
            toast('角色权限已保存');
            const me = await api('/auth/me');
            saveSession({ token: session.token, staff: me.staff });
            renderShell();
            route();
          } catch (error) {
            reportError(error);
          }
        });
      });
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  const PAGES = {
    overview: pageOverview,
    members: pageMembers,
    ledger: pageLedger,
    adjustments: pageAdjustments,
    'brand-cards': pageBrandCards,
    'issued-cards': pageIssuedCards,
    'business-cards': pageBusinessCards,
    rules: pageRules,
    prizes: pagePrizes,
    gifts: pageGifts,
    vouchers: pageVouchers,
    feedback: pageFeedback,
    sync: pageSync,
    queue: pageQueue,
    reports: pageReports,
    audit: pageAudit,
    roles: pageRoles
  };

  if (!session?.token || !session.staff) renderLogin();
  else boot();
})();
