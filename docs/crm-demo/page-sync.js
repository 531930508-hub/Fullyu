/* Full愈 CRM demo · 三端同步（outbox 事件、webhook 投递与重投、快照落后）
 * 设计 §3：CRM 写操作与 outbox_event 同事务提交，异步投递；业务端返回 2xx 即成功，
 *   失败按 1/5/30 分钟、2/6/12/24 小时退避；超过 24 小时转人工队列。消费端只接受比本地快照更新的版本。
 * CRM.emit(type, 会员) 供其他页面调用：按会员已有快照的业务逐一投递；接收端故障时快照标记为落后。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const sysAudit = (who, act, obj, detail) => C.AUDIT.unshift({ at: C.NOW, who, act, obj, detail: detail || '' });
  const BACKOFF = [1, 5, 30, 120, 360, 720, 1440];
  const hm = (t) => t.slice(11, 16);
  const plus = (at, min) => { const d = new Date(at.replace(' ', 'T')); d.setMinutes(d.getMinutes() + min); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  /* ---------- 接收端（合成）：密钥只存引用，后台不显示 ---------- */
  C.SYNC = {
    sx: { url: 'https://sx.crm-test.example/crm/webhook', key: 'sx-k2', ip: '203.0.113.21', last: '15:29:41', down: false },
    ql: { url: 'https://ql.crm-test.example/fully/crm/webhook', key: 'ql-k1', ip: '203.0.113.34', last: '15:29:12', down: false },
    zc: { url: 'https://zc.crm-test.example/api/crm/webhook', key: 'zc-k1', ip: '203.0.113.57', last: '14:58:03', down: true, error: 'HTTP 503 Service Unavailable' }
  };
  C.EVENT_TYPE = {
    'member.profile.changed': '资料变更', 'member.card.changed': '大会员卡变更', 'points.changed': '积分变更',
    'member.merged': '会员合并', 'notify.requested': '提醒请求'
  };
  const SNAPSHOT_TYPES = ['member.profile.changed', 'member.card.changed', 'points.changed', 'member.merged'];
  const EV_STATUS = { DELIVERED: ['已送达', 'green'], DELIVERING: ['投递中', 'lilac'], FAILED: ['失败 · 待重试', 'red'] };

  C.OUTBOX = [
    { id: 'EV-10233', type: 'member.card.changed', biz: 'ql', no: 'FY-2607-001204', ver: 4, at: '2026-11-07 15:29', attempts: 1, status: 'DELIVERING', resp: '等待响应（超时 10 秒）' },
    { id: 'EV-10232', type: 'points.changed', biz: 'ql', no: 'FY-2605-000927', ver: 2, at: '2026-11-07 15:29', attempts: 1, status: 'DELIVERING', resp: '等待响应（超时 10 秒）' },
    { id: 'EV-10231', type: 'member.profile.changed', biz: 'sx', no: 'FY-2602-008812', ver: 7, at: '2026-11-07 15:29', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-07 15:29' },
    { id: 'EV-10230', type: 'member.profile.changed', biz: 'ql', no: 'FY-2602-008812', ver: 7, at: '2026-11-07 15:29', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-07 15:29' },
    { id: 'EV-10229', type: 'notify.requested', biz: 'zc', no: 'FY-2503-000431', ver: 3, at: '2026-11-07 15:10', attempts: 2, status: 'FAILED', resp: 'HTTP 503', next: '2026-11-07 15:16', note: '大会员卡到期回访提醒' },
    { id: 'EV-10228', type: 'notify.requested', biz: 'zc', no: 'FY-2602-008812', ver: 7, at: '2026-11-07 15:02', attempts: 3, status: 'FAILED', resp: 'HTTP 503', next: '2026-11-07 15:38', note: '积分 1/1 过期前 30 天提醒' },
    { id: 'EV-10226', type: 'member.profile.changed', biz: 'zc', no: 'FY-2512-000012', ver: 5, at: '2026-11-07 14:58', attempts: 3, status: 'FAILED', resp: 'HTTP 503', next: '2026-11-07 15:34', note: '生日与城市更新' },
    { id: 'EV-10225', type: 'member.profile.changed', biz: 'sx', no: 'FY-2512-000012', ver: 5, at: '2026-11-07 14:58', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-07 14:58' },
    { id: 'EV-10221', type: 'member.profile.changed', biz: 'sx', no: 'FY-2512-000012', ver: 4, at: '2026-11-06 18:40', attempts: 2, status: 'DELIVERED', resp: '200 · 本地已是 v5，旧版本忽略', done: '2026-11-07 14:59', note: '乱序到达' },
    { id: 'EV-10219', type: 'member.card.changed', biz: 'zc', no: 'FY-2512-000012', ver: 4, at: '2026-11-06 18:44', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-06 18:44', note: '续费第 2 期待生效' },
    { id: 'EV-10218', type: 'member.card.changed', biz: 'sx', no: 'FY-2512-000012', ver: 4, at: '2026-11-06 18:44', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-06 18:44', note: '续费第 2 期待生效' },
    { id: 'EV-10204', type: 'points.changed', biz: 'zc', no: 'FY-2602-008812', ver: 7, at: '2026-11-04 09:48', attempts: 1, status: 'DELIVERED', resp: '200', done: '2026-11-04 09:48' }
  ];
  let seq = 10234;

  /* 投递一条事件：成功则推进该业务的会员快照；旧版本由消费端忽略 */
  function deliver(ev) {
    const m = C.member(ev.no);
    const s = m && m.snap[ev.biz];
    ev.attempts += 1;
    ev.status = 'DELIVERED';
    ev.done = C.NOW;
    ev.next = null;
    if (s && SNAPSHOT_TYPES.includes(ev.type) && s.ver > ev.ver) ev.resp = `200 · 本地已是 v${s.ver}，旧版本忽略`;
    else {
      ev.resp = '200';
      if (s && SNAPSHOT_TYPES.includes(ev.type)) { s.ver = Math.max(s.ver, m.ver); s.at = hm(C.NOW); }
    }
    if (s) s.stale = C.OUTBOX.some((x) => x.no === ev.no && x.biz === ev.biz && x.status === 'FAILED' && SNAPSHOT_TYPES.includes(x.type));
    C.SYNC[ev.biz].last = `${hm(C.NOW)}:00`;
  }
  function fail(ev) {
    ev.attempts += 1;
    ev.status = 'FAILED';
    ev.resp = C.SYNC[ev.biz].error.replace(' Service Unavailable', '');
    ev.next = plus(C.NOW, BACKOFF[Math.min(ev.attempts - 1, BACKOFF.length - 1)]);
  }

  /* 供其他页面调用：写 outbox 并立即尝试投递（真实系统为异步，这里同步模拟） */
  C.emit = (type, m, note) => {
    Object.keys(m.snap).forEach((b) => {
      const ev = { id: `EV-${seq++}`, type, biz: b, no: m.no, ver: m.ver, at: C.NOW, attempts: 0, note: note || '' };
      C.OUTBOX.unshift(ev);
      if (C.SYNC[b].down) { fail(ev); if (SNAPSHOT_TYPES.includes(type)) m.snap[b].stale = true; } else deliver(ev);
    });
    return Object.keys(m.snap).filter((b) => m.snap[b].stale).map((b) => C.BIZ[b].n);
  };

  const failed = (b) => C.OUTBOX.filter((e) => e.biz === b && e.status === 'FAILED');
  const inflight = (b) => C.OUTBOX.filter((e) => e.biz === b && e.status === 'DELIVERING');
  const nextOf = (b) => { const n = failed(b).map((e) => e.next).sort()[0]; return n ? hm(n) : '—'; };
  /* 工作台「三端同步」由事件实时汇总 */
  Object.defineProperty(C.SUMMARY, 'sync', {
    get() {
      return Object.fromEntries(Object.keys(C.SYNC).map((b) => {
        const f = failed(b).length;
        const d = inflight(b).length;
        return [b, { ok: !f, pending: f + d, last: C.SYNC[b].last, note: f ? `${C.SYNC[b].error.replace(' Service Unavailable', '')} · 下次重试 ${nextOf(b)}` : d ? `${d} 条投递中` : '快照平均 1 分钟内' }];
      }));
    }
  });

  /* ---------- 动作 ---------- */
  C.act.syncRetry = (el) => {
    if (!C.can('sync:retry')) return C.toast('当前角色无 sync:retry 权限');
    const b = el.dataset.biz;
    const list = (el.dataset.id ? C.OUTBOX.filter((e) => e.id === el.dataset.id) : failed(b)).filter((e) => e.status === 'FAILED').sort((x, y) => (x.ver - y.ver) || (x.at < y.at ? -1 : 1));
    if (!list.length) return C.toast('没有待重投的事件');
    const S = C.SYNC[b];
    if (S.down) {
      list.forEach(fail);
      C.audit('手动重投 webhook', `${C.BIZ[b].n} · ${list.length} 条`, `仍返回 ${S.error}；下次自动重试 ${nextOf(b)}`);
      C.render();
      return C.toast(`${C.BIZ[b].n}仍返回 ${S.error.slice(5, 8)}，${list.length} 条保持积压`);
    }
    const before = list.map((e) => { const m = C.member(e.no); return m.snap[b] ? `${m.name} v${m.snap[b].ver}` : ''; });
    list.forEach(deliver);
    const moved = list.map((e, i) => { const m = C.member(e.no); return m.snap[b] && SNAPSHOT_TYPES.includes(e.type) ? `${before[i]} → v${m.snap[b].ver}` : ''; }).filter(Boolean);
    C.audit('手动重投 webhook', `${C.BIZ[b].n} · ${list.length} 条`, `全部送达${moved.length ? '；快照 ' + moved.join('、') : ''}`);
    C.render();
    C.toast(`已送达 ${list.length} 条，${C.BIZ[b].n}快照已追平`);
  };
  /* 演示开关：模拟业务接收端故障 / 恢复（真实环境是外部状态，不在 CRM 操作） */
  C.act.syncToggle = (el) => {
    const S = C.SYNC[el.dataset.biz];
    S.down = !S.down;
    if (S.down) S.error = 'HTTP 503 Service Unavailable';
    C.render();
    C.toast(S.down ? `演示：${C.BIZ[el.dataset.biz].n}接收端故障` : `演示：${C.BIZ[el.dataset.biz].n}接收端已恢复，积压事件需重投或等待自动重试`);
  };
  /* 演示：投递中的事件收到响应 */
  C.act.syncAck = (el) => {
    const list = inflight(el.dataset.biz);
    list.forEach((e) => { e.attempts -= 1; deliver(e); });
    C.render();
    C.toast(`演示：${list.length} 条收到 200`);
  };

  /* ---------- 页面 ---------- */
  const view = { biz: 'all', status: 'all' };
  C.act.syncBiz = (el) => { view.biz = el.dataset.v; C.render(); };
  C.input.syncStatus = (el) => { view.status = el.value; C.render(); };

  function bizCard(b) {
    const S = C.SYNC[b];
    const f = failed(b);
    const d = inflight(b);
    const can = C.can('sync:retry');
    const state = f.length ? C.pill(`投递失败 · 积压 ${f.length}`, 'red') : d.length ? C.pill(`正常 · 投递中 ${d.length}`, 'green') : C.pill('正常', 'green');
    return `<section class="panel"><div class="section-title"><h2>${C.biz(b)}</h2>${state}</div>
      <dl class="kv">
        <dt>回调地址</dt><dd class="mono tiny" style="word-break:break-all">${E(S.url)}</dd>
        <dt>签名</dt><dd class="tiny">HMAC-SHA256 · key_id <span class="mono">${S.key}</span><div class="muted">密钥存于密钥管理服务，后台只显示引用</div></dd>
        <dt>出口 IP 白名单</dt><dd class="mono tiny">${S.ip}</dd>
        <dt>最近送达</dt><dd class="num">${S.last}</dd>
        <dt>接收端</dt><dd>${S.down ? `<span style="color:var(--danger)">${E(S.error)}</span>` : '<span class="muted">返回 2xx</span>'}</dd>
        ${f.length ? `<dt>下次自动重试</dt><dd class="num">${nextOf(b)}</dd>` : ''}
      </dl>
      ${f.length ? `<div class="table-tools" style="margin:12px 0 0"><button class="btn primary" data-act="syncRetry" data-biz="${b}" ${can ? '' : 'disabled title="当前角色无 sync:retry 权限"'}>立即重投 ${f.length} 条</button><span class="tiny muted">按版本从旧到新投递</span></div>` : ''}
      <div class="sim"><span class="tiny muted">演示：模拟${C.BIZ[b].n}接收端状态（外部系统，不在 CRM 操作）</span>
        <button class="btn" data-act="syncToggle" data-biz="${b}">${S.down ? '接收端恢复' : '接收端故障'}</button>
        ${d.length ? `<button class="btn" data-act="syncAck" data-biz="${b}">投递中的 ${d.length} 条返回 200</button>` : ''}</div>
    </section>`;
  }
  function staleList() {
    const rows = [];
    C.MEMBERS.filter((m) => m.status !== 'MERGED').forEach((m) => Object.entries(m.snap).forEach(([b, s]) => {
      if (s.stale || s.ver < m.ver) rows.push(`<tr class="click" data-act="openMember" data-no="${m.no}"><td><strong>${E(m.name)}</strong><div class="tiny muted mono">${m.no}</div></td><td>${C.biz(b)}</td><td class="num">v${s.ver} · ${s.at}</td><td class="num">v${m.ver}</td><td>${C.pill(s.ver < m.ver ? `落后 ${m.ver - s.ver} 版` : '有未送达事件', 'red')}</td></tr>`);
    }));
    return rows.length ? `<div class="table-wrap"><table><thead><tr><th>会员</th><th>业务</th><th>业务端快照</th><th>CRM 当前</th><th>状态</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : '<div class="check ok">三端快照均与 CRM 一致</div>';
  }
  function eventRows() {
    const list = C.OUTBOX.filter((e) => (view.biz === 'all' || e.biz === view.biz) && (view.status === 'all' || e.status === view.status));
    if (!list.length) return '<tr><td colspan="9"><div class="empty"><b>没有匹配的事件</b>换个业务或状态看看。</div></td></tr>';
    const can = C.can('sync:retry');
    return list.map((e) => {
      const m = C.member(e.no);
      return `<tr><td class="mono">${e.id}</td><td>${C.EVENT_TYPE[e.type]}<div class="tiny muted mono">${e.type}</div></td><td>${C.biz(e.biz)}</td>
        <td>${m ? E(m.name) : '—'}<div class="tiny muted mono">${e.no}</div></td><td class="num">v${e.ver}</td><td>${C.pill(...EV_STATUS[e.status])}</td>
        <td class="num">${e.attempts} 次<div class="tiny muted">${e.status === 'FAILED' ? `下次 ${hm(e.next)}` : e.done ? `送达 ${e.done.slice(5)}` : '—'}</div></td>
        <td class="wrap tiny">${E(e.resp)}${e.note ? `<div class="muted">${E(e.note)}</div>` : ''}</td>
        <td>${e.status === 'FAILED' ? `<button class="text-btn" data-act="syncRetry" data-biz="${e.biz}" data-id="${e.id}" ${can ? '' : 'disabled title="当前角色无 sync:retry 权限"'}>重投</button>` : ''}</td></tr>`;
    }).join('');
  }

  C.pages.sync = {
    title: '三端同步',
    render() {
      if (!C.can('sync:view')) return `<div class="page-head"><div><h1>三端同步</h1></div></div><section class="panel"><div class="empty"><b>当前角色无查看权限</b>需要 sync:view（会员运营 / 财务 / 管理员）。</div></section>`;
      const chip = (v, t) => `<button class="chip ${view.biz === v ? 'active' : ''}" data-act="syncBiz" data-v="${v}">${t}</button>`;
      const opt = (v, t) => `<option value="${v}" ${view.status === v ? 'selected' : ''}>${t}</option>`;
      return `
        <div class="page-head"><div><h1>三端同步</h1><p>CRM 是唯一账本，时叙、轻疗、在场只保留只读快照。每次写操作同事务写入 outbox，经签名 webhook 推送；业务端返回 2xx 即视为送达。</p></div>
          <span class="tiny muted">${C.can('sync:retry') ? '当前身份可手动重投' : '当前身份只读（重投需 sync:retry）'}</span></div>
        <div class="grid-3" style="margin-bottom:16px">${['sx', 'ql', 'zc'].map(bizCard).join('')}</div>
        <section class="panel" style="margin-bottom:16px"><div class="section-title"><h2>快照落后的会员</h2><span class="tiny">落后期间：展示带「更新于」时间；年卡折扣快照 10 分钟内照常使用，超过则提示稍后再试；积分抵扣一律实时调 CRM</span></div>${staleList()}</section>
        <section class="panel"><div class="section-title"><h2>outbox 事件</h2><span class="tiny">失败按 1 / 5 / 30 分钟、2 / 6 / 12 / 24 小时退避；超过 24 小时转人工队列；消费端只接受比本地更新的版本</span></div>
          <div class="table-tools"><div class="chips">${chip('all', '全部业务')}${chip('sx', '时叙')}${chip('ql', '轻疗')}${chip('zc', '在场')}</div>
            <select data-input="syncStatus" aria-label="投递状态">${opt('all', '全部状态')}${opt('FAILED', '失败 · 待重试')}${opt('DELIVERING', '投递中')}${opt('DELIVERED', '已送达')}</select></div>
          <div class="table-wrap"><table><thead><tr><th>事件</th><th>类型</th><th>目标</th><th>会员</th><th>版本</th><th>状态</th><th>尝试</th><th>响应</th><th></th></tr></thead><tbody>${eventRows()}</tbody></table></div></section>`;
    }
  };

  C.sysAudit = sysAudit;
  C.NAV.forEach((n) => (n.items || []).forEach((i) => { if (i.key === 'sync') i.badge = () => ['sx', 'ql', 'zc'].reduce((s, b) => s + failed(b).length, 0); }));
})();
