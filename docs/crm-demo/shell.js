/* Full愈 CRM demo · 外壳：路由、侧栏、角色切换、对话框、提示
 * 页面注册：CRM.pages[key] = { title, render(params) }；未注册的路由显示「页面不存在」。
 * 交互：元素加 data-act="名字"，在 CRM.act[名字] 里处理（事件委托）。
 */
(function () {
  const C = window.CRM;
  C.pages = {};
  C.act = {};
  C.state = { role: 'ADMIN', page: 'dashboard', params: [], viewed: {}, list: { q: '', biz: 'all', card: 'all', seg: 'all' } };

  /* 导航：pinned 置顶，其余按分组手风琴展开 */
  C.NAV = [
    { key: 'dashboard', label: '工作台', pinned: true },
    { group: '会员', items: [{ key: 'members', label: '会员查询' }, { key: 'adjust', label: '积分调整', badge: () => C.pendingAdjusts && C.pendingAdjusts() }] },
    { group: '权益', items: [{ key: 'brandcard', label: '大会员卡' }, { key: 'bizcards', label: '业务会员卡' }] },
    { group: '审批与审计', items: [{ key: 'approvals', label: '审批中心' }, { key: 'audit', label: '审计日志' }] },
    { group: '同步与异常', items: [{ key: 'sync', label: '三端同步' }, { key: 'queue', label: '异常队列' }] },
    { group: '配置与报表', items: [{ key: 'config', label: '规则配置' }, { key: 'report', label: '月度对账' }, { key: 'roles', label: '角色权限' }] }
  ];

  /* ---------- 工具 ---------- */
  C.esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  C.yuan = (c) => '¥' + (c / 100).toLocaleString('zh-CN', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  C.n = (v) => Number(v).toLocaleString('zh-CN');
  C.biz = (k) => { const b = C.BIZ[k]; return `<span class="biz" style="--c:${b.c};--b:${b.b}">${b.n}</span>`; };
  C.pill = (text, tone) => `<span class="pill ${tone || ''}">${C.esc(text)}</span>`;
  C.mask = (p) => p.slice(0, 3) + '****' + p.slice(7);
  C.can = (p) => C.ROLES[C.state.role].perms.includes(p);
  C.me = () => C.ROLES[C.state.role];
  C.member = (no) => C.MEMBERS.find((m) => m.no === no);
  C.days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  C.audit = (act, obj, detail) => C.AUDIT.unshift({ at: C.NOW, who: `${C.me().name}（${C.me().code}）`, act, obj, detail: detail || '' });

  /* ---------- 路由 ---------- */
  C.go = (hash) => { location.hash = hash; };
  function parse() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
    C.state.page = parts[0];
    C.state.params = parts.slice(1);
  }
  function navKey() { return C.state.page === 'member' ? 'members' : C.state.page; }

  /* ---------- 渲染 ---------- */
  // 首页不属于任何分组时，默认展开最常用的「会员」组，避免侧栏全折叠。
  let openGroup = '会员';
  function groupOf(key) { const g = C.NAV.find((x) => x.items && x.items.some((i) => i.key === key)); return g ? g.group : null; }

  function link(item) {
    const active = navKey() === item.key;
    const badge = item.badge ? item.badge() : 0;
    return `<button type="button" class="side-link ${active ? 'active' : ''}" data-act="nav" data-key="${item.key}" ${active ? 'aria-current="page"' : ''}>
      <span>${item.label}</span>${badge ? `<span class="badge" aria-label="待处理 ${badge}">${badge}</span>` : ''}</button>`;
  }

  function renderSidebar() {
    const r = C.me();
    let html = `<div class="sidebar-brand"><b>Full愈 CRM</b><small>MEMBER LEDGER · HQ</small></div><nav>`;
    C.NAV.forEach((n, i) => {
      if (n.pinned) { html += link(n) + '<div class="nav-divider"></div>'; return; }
      const expanded = openGroup === n.group;
      html += `<section><button type="button" class="nav-group-toggle" data-act="group" data-group="${n.group}" aria-expanded="${expanded}" aria-controls="ng-${i}">${n.group}<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div id="ng-${i}" class="nav-group-items ${expanded ? '' : 'collapsed'}">${n.items.map(link).join('')}</div></section>`;
    });
    html += `</nav><div class="sidebar-user"><span>${r.name.slice(0, 1)}</span><div><strong>${r.name}</strong><small>${r.code} · ${r.title}</small></div></div>`;
    document.getElementById('sidebar').innerHTML = html;
  }

  function renderTopbar() {
    const opts = Object.entries(C.ROLES).map(([k, r]) => `<option value="${k}" ${k === C.state.role ? 'selected' : ''}>${r.code} · ${r.name}</option>`).join('');
    document.getElementById('topbar').innerHTML = `
      <span class="env-tag">crm-test · 合成数据 · 不连接任何真实系统</span>
      <span class="tiny muted">数据时间 ${C.NOW}</span>
      <input class="search" type="search" placeholder="会员号 / 手机后四位 / 姓名" aria-label="搜索会员" data-input="globalSearch" value="${C.esc(C.state.list.q)}">
      <label class="role-switch">当前身份<select data-input="role" aria-label="切换角色">${opts}</select></label>`;
  }

  function notFound() {
    return `<div class="placeholder"><h1>页面不存在</h1><p class="muted small">链接可能已失效，或该页面不在当前导航中。</p><div style="margin-top:18px"><button class="btn" data-act="nav" data-key="dashboard">回到工作台</button></div></div>`;
  }

  C.render = function () {
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.input : null;
    parse();
    const g = groupOf(navKey());
    if (g) openGroup = g;
    renderSidebar();
    renderTopbar();
    const page = C.pages[C.state.page];
    const el = document.getElementById('page');
    el.innerHTML = page ? page.render(C.state.params) : notFound();
    document.title = `${page ? page.title : '页面不存在'} · Full愈 CRM demo`;
    /* 重绘后把焦点还给正在输入的搜索框，避免打字中断 */
    if (focused === 'globalSearch' || focused === 'listSearch') {
      const box = document.querySelector(`[data-input="${focused}"]`);
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }
  };

  /* ---------- 对话框与提示 ---------- */
  const dlg = () => document.getElementById('dlg');
  C.dialog = (title, body, foot) => {
    dlg().innerHTML = `<div class="dlg-head">${title}</div><div class="dlg-body">${body}</div><div class="dlg-foot">${foot || '<button class="btn" data-act="closeDlg">关闭</button>'}</div>`;
    dlg().showModal();
  };
  C.closeDialog = () => dlg().open && dlg().close();
  let toastTimer;
  C.toast = (msg) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  /* ---------- 通用动作 ---------- */
  C.act.nav = (el) => C.go('#/' + el.dataset.key);
  C.act.group = (el) => { openGroup = openGroup === el.dataset.group ? null : el.dataset.group; renderSidebar(); };
  C.act.closeDlg = () => C.closeDialog();

  C.input = {
    role(el) {
      C.state.role = el.value;
      C.render();
      C.toast(`已切换为 ${C.me().code} · ${C.me().name}`);
    },
    globalSearch(el) {
      C.state.list.q = el.value;
      if (C.state.page !== 'members') { C.go('#/members'); return; }
      C.pages.members && C.pages.members.refresh && C.pages.members.refresh();
    }
  };

  C.start = function () {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const fn = C.act[el.dataset.act];
      if (fn) fn(el, e);
    });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('[data-input]');
      if (el && C.input[el.dataset.input] && el.tagName !== 'SELECT') C.input[el.dataset.input](el, e);
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-input]');
      if (el && C.input[el.dataset.input] && el.tagName === 'SELECT') C.input[el.dataset.input](el, e);
    });
    window.addEventListener('hashchange', () => { C.render(); window.scrollTo(0, 0); });
    C.render();
  };
})();
