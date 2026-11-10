/* Full愈 CRM demo · 工作台、会员查询、会员 360（2026-11-08：明文资料、轨迹与消费、权益卡） */
(function () {
  const C = window.CRM;
  const E = C.esc;

  /* ---------- 计算（口径同设计文档 §5 §6） ---------- */
  const balance = (m) => m.batches.filter((b) => b.status === 'ACTIVE').reduce((s, b) => s + b.remaining, 0);
  const ledgerWithBalance = (m) => { let bal = 0; return m.ledger.map((l) => ({ ...l, bal: (bal += l.delta) })); };
  const lastBalance = (m) => m.ledger.reduce((s, l) => s + l.delta, 0);
  const expiringFirst = (m) => {
    const act = m.batches.filter((b) => b.status === 'ACTIVE' && b.remaining > 0);
    if (!act.length) return null;
    const d = act.map((b) => b.expire).sort()[0];
    return { date: d, pts: act.filter((b) => b.expire === d).reduce((s, b) => s + b.remaining, 0) };
  };
  const saved = (p) => p.usage.reduce((s, u) => s + u.saved - u.rev, 0);
  const savedYear = (m) => m.periods.filter((p) => p.status !== 'REFUNDED').reduce((s, p) => s + saved(p), 0);
  function cardState(m) {
    const st = m.periods.map((p) => p.status);
    const until = m.periods.filter((p) => !['REFUNDED', 'EXPIRED'].includes(p.status)).map((p) => p.end).sort().pop();
    if (st.includes('ACTIVE')) return { key: 'ACTIVE', until, renewed: st.includes('PENDING') };
    if (st.includes('REFUND_LOCKED')) return { key: 'REFUND_LOCKED', until };
    if (st.includes('PENDING')) return { key: 'PENDING', until };
    if (st.includes('EXPIRED')) return { key: 'EXPIRED', until: m.periods.map((p) => p.end).sort().pop() };
    return { key: 'NONE' };
  }
  function cardPill(m) {
    const c = cardState(m);
    if (c.key === 'NONE') return C.pill('未开通');
    const [t, tone] = C.CARD_STATUS[c.key];
    return C.pill(t + (c.renewed ? ' · 已续费' : ''), tone);
  }
  /* 退卡估算：支付当天算第 1 天，第 7 天内且无未冲减权益使用 → 全额；否则 实付 − 已享优惠，最低 0 */
  function refundEstimate(m, p) {
    const day = C.days(p.paidAt.slice(0, 10), C.TODAY) + 1;
    const used = saved(p);
    const within = day <= 7;
    const live = m.periods.filter((x) => x.status !== 'REFUNDED').sort((a, b) => a.start < b.start ? 1 : -1)[0];
    return { day, within, used, full: within && used === 0, suggested: within && used === 0 ? p.paid : Math.max(0, p.paid - used), isLast: live === p };
  }
  C.calc = { balance, lastBalance, expiringFirst, saved, cardState, refundEstimate };

  /* ---------- 资料、轨迹与消费（2026-11-08 补充） ---------- */
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  function spend(m) {
    const rows = Object.entries(m.stats || {}).map(([b, s]) => ({ b, ...s, f3: sum(s.monthly.slice(9)), f12: sum(s.monthly) }));
    if (!rows.length) return { rows, orders: 0, spend: 0, f3: 0, f12: 0, last: null, first: null, since: null, avg: 0, gap: null };
    const orders = sum(rows.map((r) => r.orders));
    const total = sum(rows.map((r) => r.spend));
    const first = rows.map((r) => r.first).sort()[0];
    const last = rows.map((r) => r.last).sort().pop();
    return {
      rows: rows.sort((a, b) => b.spend - a.spend), orders, spend: total, first, last,
      f3: sum(rows.map((r) => r.f3)), f12: sum(rows.map((r) => r.f12)),
      since: C.days(last, C.TODAY), avg: Math.round(total / orders),
      gap: orders > 1 ? Math.round(C.days(first, last) / (orders - 1)) : null
    };
  }
  /* 多久没来 Full愈：以三业务中最近一笔已支付订单为准 */
  const recency = (d) => d == null ? ['从未消费', ''] : d <= 30 ? ['30 天内来过', 'green'] : d <= 60 ? ['30–60 天未来', 'amber'] : ['60 天以上未来', 'red'];
  const lastLogin = (m) => Object.entries(m.logins || {}).sort((a, b) => a[1] < b[1] ? 1 : -1)[0];
  const age = (bd) => { if (!bd) return null; const [y, mo, d] = bd.split('-').map(Number); const [ty, tm, td] = C.TODAY.split('-').map(Number); return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0); };
  const birthMonth = (m) => m.birthday && m.birthday.slice(5, 7) === C.TODAY.slice(5, 7);
  const genderText = (g) => g === 1 ? '男' : g === 2 ? '女' : '未填写';
  const SEGMENTS = {
    all: ['全部人群', () => true],
    birthday: ['本月生日', birthMonth],
    r30: ['30 天内来过', (m) => spend(m).since != null && spend(m).since <= 30],
    r60: ['30–60 天未来', (m) => { const d = spend(m).since; return d != null && d > 30 && d <= 60; }],
    sleep: ['60 天以上未来', (m) => { const d = spend(m).since; return d == null || d > 60; }],
    freq: ['近 3 个月 ≥ 6 次', (m) => spend(m).f3 >= 6]
  };
  Object.assign(C.calc, { spend, recency, lastLogin, age, birthMonth });
  C.SEGMENT_NAME = (k) => SEGMENTS[k][0];

  /* CRM 内显示明文；三端后台统一 138****6620，仅单次拨打电话时取明文 */
  const phoneCell = (m) => `<span class="phone-cell"><span class="num">${m.phone}</span><span class="tiny muted" title="时叙 / 轻疗 / 在场后台显示 ${C.mask(m.phone)}，仅拨打电话时单次取明文">三端显示 ${C.mask(m.phone)}</span></span>`;

  /* ---------- 工作台 ---------- */
  C.pages.dashboard = {
    title: '工作台',
    render() {
      const S = C.SUMMARY;
      const todo = S.todo.map((t) => {
        const allowed = C.can(t.perm);
        const n = typeof t.n === 'function' ? t.n() : t.n;
        return `<div class="todo-row"><span class="n">${n}</span><div><strong>${t.label}</strong><div class="tiny muted">${t.desc}</div></div>
          ${allowed ? '' : C.pill('当前角色无权处理')}
          <button class="text-btn" data-act="nav" data-key="${t.page}">查看 ›</button></div>`;
      }).join('');
      const health = Object.entries(S.sync).map(([k, s]) => `<div class="health"><div>${C.biz(k)} <span class="tiny muted" style="margin-left:6px">最近送达 ${s.last}</span><div class="tiny ${s.ok ? 'muted' : ''}" style="${s.ok ? '' : 'color:var(--danger)'}">${s.note}</div></div>
        ${s.ok ? C.pill(s.pending ? `正常 · 待投 ${s.pending}` : '正常', 'green') : C.pill(`投递失败 · 积压 ${s.pending}`, 'red')}</div>`).join('');
      const sleepy = C.MEMBERS.filter((m) => SEGMENTS.sleep[1](m)).length;
      const bday = C.MEMBERS.filter(birthMonth).length;
      return `
        <div class="page-head"><div><h1>工作台</h1><p>总部视角：三端会员、大会员卡与积分的唯一账本。业务端只保留快照，扣减以 CRM 为准。</p></div></div>
        <div class="stats-grid">
          <div class="stat emphasis"><div class="label">会员总数</div><div class="value">${C.n(S.members)}</div><div class="sub">本月新增 ${S.newThisMonth} · 按手机号去重</div></div>
          <div class="stat"><div class="label">生效大会员卡</div><div class="value">${C.n(S.activeCards)}<small>张</small></div><div class="sub">30 天内到期 ${S.cardsExpiring30} 张，已排提醒</div></div>
          <div class="stat"><div class="label">积分负债（1 分 = ¥1）</div><div class="value">${C.n(S.pointsOutstanding)}<small>分</small></div><div class="sub">三端合计未用余额</div></div>
          <div class="stat"><div class="label">2027-01-01 将过期</div><div class="value">${C.n(S.pointsExpiringJan1)}<small>分</small></div><div class="sub">12-02 与 12-25 推送过期提醒</div></div>
        </div>
        <div class="grid-2">
          <section class="panel"><div class="section-title"><h2>待处理</h2><span class="tiny">按当前角色 ${C.me().code} 标注权限</span></div>${todo}</section>
          <div class="stack">
            <section class="panel"><div class="section-title"><h2>会员关怀</h2><span class="tiny">演示样本 ${C.MEMBERS.length} 人</span></div>
              <div class="health"><span>本月生日</span><button class="text-btn" data-act="segment" data-v="birthday">${bday} 人 ›</button></div>
              <div class="health"><span>60 天以上没来 Full愈</span><button class="text-btn" data-act="segment" data-v="sleep">${sleepy} 人 ›</button></div>
              <div class="health"><span>近 3 个月 ≥ 6 次</span><button class="text-btn" data-act="segment" data-v="freq">${C.MEMBERS.filter((m) => SEGMENTS.freq[1](m)).length} 人 ›</button></div></section>
            <section class="panel"><div class="section-title"><h2>三端同步</h2><button class="text-btn" data-act="nav" data-key="sync">详情 ›</button></div>${health}</section>
          </div>
        </div>`;
    }
  };

  /* ---------- 会员查询 ---------- */
  function filtered() {
    const { q, biz, card, seg = 'all' } = C.state.list;
    const s = q.trim().toLowerCase();
    return C.MEMBERS.filter((m) => {
      if (m.status === 'MERGED') return false;
      if (biz !== 'all' && !m.biz.includes(biz)) return false;
      if (card !== 'all' && cardState(m).key !== card) return false;
      if (!SEGMENTS[seg][1](m)) return false;
      if (!s) return true;
      /* 只做精确/后四位匹配，不做姓名之外的模糊合并 */
      return m.name.includes(s) || (m.call && m.call.includes(s)) || m.no.toLowerCase().includes(s) || (/^\d{4}$/.test(s) && m.phone.endsWith(s)) || m.phone === s;
    });
  }
  function rows() {
    const list = filtered();
    if (!list.length) return `<tr><td colspan="9"><div class="empty"><b>没有匹配的会员</b>支持会员号、手机后四位、完整手机号、姓名或称呼；CRM 不按姓名、生日模糊合并身份。</div></td></tr>`;
    return list.map((m) => {
      const st = spend(m);
      const [rt, rtone] = recency(st.since);
      const a = age(m.birthday);
      return `<tr class="click" data-act="openMember" data-no="${m.no}">
        <td><strong>${E(m.name)}</strong>${birthMonth(m) ? ' ' + C.pill('本月生日', 'amber') : ''}<div class="tiny muted">${m.call ? E(m.call) + ' · ' : ''}${genderText(m.gender)}${a != null ? ` · ${a} 岁` : ''}</div></td>
        <td class="mono">${m.no}</td><td class="num">${m.phone}</td>
        <td><div class="chips">${m.biz.map(C.biz).join('')}</div></td><td>${cardPill(m)}</td>
        <td class="r num">${C.n(balance(m))}</td><td class="r num">${C.yuan(st.spend)}<div class="tiny muted">${st.orders} 单</div></td>
        <td class="r num">${st.f3} 次</td>
        <td><span class="num">${st.since == null ? '—' : st.since + ' 天'}</span><div>${C.pill(rt, rtone)}</div></td></tr>`;
    }).join('');
  }
  C.pages.members = {
    title: '会员查询',
    refresh() { const tb = document.getElementById('memberRows'); if (tb) tb.innerHTML = rows(); const c = document.getElementById('memberCount'); if (c) c.textContent = filtered().length; },
    render() {
      const L = C.state.list;
      L.seg = L.seg || 'all';
      const chip = (v, t) => `<button class="chip ${L.biz === v ? 'active' : ''}" data-act="filterBiz" data-v="${v}">${t}</button>`;
      const opt = (v, t, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`;
      return `
        <div class="page-head"><div><h1>会员查询</h1><p>CRM 内显示明文资料，打开档案会记录查看；时叙、轻疗、在场后台统一显示 138****6620，仅单次拨打电话时取明文。</p></div><div class="head-actions"><span class="tiny muted">共 <b id="memberCount">${filtered().length}</b> 位（演示样本）</span>
            <button class="btn" data-act="exportMasked">导出（脱敏）</button><button class="btn" data-act="exportPlainReq">申请明文导出</button></div></div>
        <div class="table-tools">
          <input type="search" placeholder="会员号 / 手机号 / 姓名 / 称呼" aria-label="筛选会员" data-input="listSearch" value="${E(L.q)}">
          <div class="chips">${chip('all', '全部业务')}${chip('sx', '时叙')}${chip('ql', '轻疗')}${chip('zc', '在场')}</div>
          <select data-input="filterCard" aria-label="大会员卡状态">${opt('all', '全部卡状态', L.card)}${opt('ACTIVE', '生效中', L.card)}${opt('PENDING', '待生效', L.card)}${opt('REFUND_LOCKED', '退卡锁定', L.card)}${opt('EXPIRED', '已到期', L.card)}${opt('NONE', '未开通', L.card)}</select>
          <select data-input="filterSeg" aria-label="人群">${Object.entries(SEGMENTS).map(([k, [t]]) => opt(k, t, L.seg)).join('')}</select>
        </div>
        <div class="table-wrap"><table><thead><tr><th>会员</th><th>会员号</th><th>手机号</th><th>来过的业务</th><th>大会员卡</th><th class="r">积分</th><th class="r">累计消费</th><th class="r">近 3 个月</th><th>距上次消费</th></tr></thead><tbody id="memberRows">${rows()}</tbody></table></div>`;
    }
  };
  C.memberFiltered = filtered;
  C.act.filterBiz = (el) => { C.state.list.biz = el.dataset.v; C.render(); };
  C.act.segment = (el) => { Object.assign(C.state.list, { q: '', biz: 'all', card: 'all', seg: el.dataset.v }); C.go('#/members'); };
  C.input.filterCard = (el) => { C.state.list.card = el.value; C.pages.members.refresh(); };
  C.input.filterSeg = (el) => { C.state.list.seg = el.value; C.pages.members.refresh(); };
  C.input.listSearch = (el) => { C.state.list.q = el.value; C.pages.members.refresh(); const g = document.querySelector('[data-input="globalSearch"]'); if (g) g.value = el.value; };
  C.act.openMember = (el) => C.go(`#/member/${el.dataset.no}`);

  /* ---------- 会员 360 ---------- */
  const TABS = [['overview', '概览'], ['profile', '资料与轨迹'], ['spend', '消费分析'], ['card', '权益卡'], ['points', '积分'], ['journey', '愈行之旅'], ['identity', '身份与授权']];

  function tabOverview(m) {
    const c = cardState(m);
    const exp = expiringFirst(m);
    const st = spend(m);
    const [rt, rtone] = recency(st.since);
    const snaps = m.biz.map((b) => {
      const s = m.snap[b];
      const behind = s && (s.ver < m.ver || s.stale);
      return `<div class="health"><div>${C.biz(b)} <span class="tiny muted" style="margin-left:6px">快照 v${s ? s.ver : '—'} · 更新于 ${s ? s.at : '—'}</span></div>${behind ? C.pill(s.ver < m.ver ? `落后 ${m.ver - s.ver} 版 · 待补投` : '有未送达事件 · 待补投', 'red') : C.pill('与 CRM 一致', 'green')}</div>`;
    }).join('');
    const ll = lastLogin(m);
    return `
      <div class="stats-grid">
        <div class="stat emphasis"><div class="label">Full愈 大会员卡</div><div class="value" style="font-size:20px">${c.key === 'NONE' ? '未开通' : C.CARD_STATUS[c.key][0]}</div><div class="sub">${c.until ? `有效至 ${c.until}${c.key === 'ACTIVE' ? ` · 还有 ${C.days(C.TODAY, c.until)} 天` : ''}` : '三个小程序都可购买'}</div></div>
        <div class="stat"><div class="label">积分余额</div><div class="value">${C.n(balance(m))}<small>分</small></div><div class="sub">${exp ? `${C.n(exp.pts)} 分将于 ${exp.date} 过期` : '无可用积分'}</div></div>
        <div class="stat"><div class="label">累计消费</div><div class="value">${C.yuan(st.spend)}</div><div class="sub">${st.orders} 单 · 客单价 ${C.yuan(st.avg)}</div></div>
        <div class="stat"><div class="label">距上次来 Full愈</div><div class="value">${st.since == null ? '—' : st.since}<small>天</small></div><div class="sub">${C.pill(rt, rtone)} 近 3 个月 ${st.f3} 次</div></div>
      </div>
      <div class="grid-2">
        <section class="panel"><div class="section-title"><h2>最近消费</h2><button class="text-btn" data-act="tab" data-tab="spend">消费分析 ›</button></div>
          ${m.activity.slice(0, 4).map((a) => `<div class="health"><div>${C.biz(a.b)} <strong style="margin-left:6px">${E(a.sum)}</strong><div class="tiny muted">${a.at} · <span class="mono">${a.order}</span> · ${E(a.note)}</div></div><span class="num">${C.yuan(a.paid)}</span></div>`).join('')}
          <p class="tiny muted" style="margin-top:10px">业务端经 activity 事件上报订单摘要，不含商品成本与其他业务明细。</p></section>
        <div class="stack">
          <section class="panel"><div class="section-title"><h2>资料</h2><button class="text-btn" data-act="tab" data-tab="profile">资料与轨迹 ›</button></div>
            <dl class="kv"><dt>称呼</dt><dd>${m.call ? E(m.call) : '未设置'}</dd><dt>性别 / 生日</dt><dd>${genderText(m.gender)} · ${m.birthday || '生日未填写'}${birthMonth(m) ? ' ' + C.pill('本月生日', 'amber') : ''}</dd>
            <dt>最近登录</dt><dd>${ll ? `${ll[1]}（${C.BIZ[ll[0]].n}）` : '—'}</dd><dt>标签</dt><dd><span class="chips">${(m.tags || []).map((t) => `<span class="pill">${E(t)}</span>`).join('') || '—'}</span></dd></dl></section>
          <section class="panel"><div class="section-title"><h2>三端快照</h2><span class="tiny">CRM 资料版本 v${m.ver}</span></div>${snaps}</section>
        </div>
      </div>`;
  }

  function timeline(m) {
    const ev = [];
    Object.entries(m.logins || {}).forEach(([b, at]) => ev.push({ at, b, k: '登录', t: `登录${C.BIZ[b].n}小程序` }));
    m.activity.forEach((a) => ev.push({ at: a.at, b: a.b, k: '消费', t: `${a.sum} · ${C.yuan(a.paid)}` }));
    m.ledger.forEach((l) => ev.push({ at: l.at, b: l.b, k: '积分', t: `${C.LEDGER_TYPE[l.type]} ${l.delta > 0 ? '+' : ''}${C.n(l.delta)} 分` }));
    const prizeBiz = (z) => (Object.entries(C.BIZ).find(([k, v]) => k !== 'other' && (z.where || '').startsWith(v.n)) || ['other'])[0];
    (m.dice.prizes || []).filter((z) => z.status === 'COLLECTED').forEach((z) => ev.push({ at: z.at, b: prizeBiz(z), k: '礼物', t: `领取 ${z.name}（人工确认）` }));
    return ev.sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 12);
  }

  function tabProfile(m) {
    const a = age(m.birthday);
    const edit = C.can('member:edit');
    const bizRows = m.biz.map((b) => {
      const s = (m.stats || {})[b];
      return `<tr><td>${C.biz(b)}</td><td class="num">${((m.logins || {})[b] || '—').replace(/^\d{4}-/, '')}</td><td class="num">${s ? s.last : '—'}</td><td class="num">${s ? s.first : '—'}</td><td class="r num">${s ? s.orders : 0}</td></tr>`;
    }).join('');
    const KIND = { 登录: 'lilac', 消费: 'green', 积分: 'amber', 礼物: '' };
    return `
      <div class="grid-2">
        <section class="panel"><div class="section-title"><h2>基本资料</h2>
            <button class="btn" data-act="editProfile" data-no="${m.no}" ${edit ? '' : 'disabled title="当前角色无 member:edit 权限"'}>编辑资料</button></div>
          <dl class="kv">
            <dt>姓名</dt><dd>${E(m.name)}</dd><dt>称呼</dt><dd>${m.call ? E(m.call) : '未设置'}</dd>
            <dt>性别</dt><dd>${genderText(m.gender)}</dd>
            <dt>生日</dt><dd>${m.birthday ? `${m.birthday}（${a} 岁）` : '未填写'}${birthMonth(m) ? ' ' + C.pill('本月生日', 'amber') : ''}</dd>
            <dt>手机号</dt><dd>${phoneCell(m)}</dd><dt>城市</dt><dd>${E(m.city || '—')}</dd>
            <dt>来源渠道</dt><dd>${E(m.source || '—')}</dd><dt>建档</dt><dd>${m.created}（${C.BIZ[m.ids[0].b].n}）</dd>
            <dt>标签</dt><dd><span class="chips">${(m.tags || []).map((t) => `<span class="pill">${E(t)}</span>`).join('') || '—'}</span></dd>
            <dt>偏好备注</dt><dd>${m.note ? E(m.note) : '—'}</dd>
            <dt>资料版本</dt><dd>v${m.ver} · 修改后推送三端快照</dd>
          </dl></section>
        <div class="stack">
          <section class="panel"><div class="section-title"><h2>各业务轨迹</h2><span class="tiny">消费 = 已支付订单</span></div>
            <div class="table-wrap"><table><thead><tr><th>业务</th><th>最近登录</th><th>最近消费</th><th>首次消费</th><th class="r">订单</th></tr></thead><tbody>${bizRows}</tbody></table></div></section>
          <section class="panel"><div class="section-title"><h2>最近动态</h2><span class="tiny">登录 · 消费 · 积分 · 礼物</span></div>
            <ol class="timeline">${timeline(m).map((e) => `<li><span class="num tiny muted">${e.at}</span>${C.pill(e.k, KIND[e.k])}${C.biz(e.b)}<span class="small">${E(e.t)}</span></li>`).join('')}</ol></section>
        </div>
      </div>`;
  }

  function tabSpend(m) {
    const st = spend(m);
    if (!st.orders) return `<section class="panel"><div class="empty"><b>暂无消费</b>三业务都没有已支付订单。</div></section>`;
    const [rt, rtone] = recency(st.since);
    const totals = C.MONTHS.map((_, i) => sum(st.rows.map((r) => r.monthly[i])));
    const max = Math.max(1, ...totals);
    const chart = C.MONTHS.map((mo, i) => `<div class="mcol" title="${mo} · ${totals[i]} 次"><div class="mstack" style="height:${(totals[i] / max) * 76}%">${st.rows.filter((r) => r.monthly[i]).map((r) => `<span style="flex:${r.monthly[i]};background:${C.BIZ[r.b].c}"></span>`).join('')}</div><b class="num">${totals[i] || ''}</b><small>${+mo.slice(5)}月</small></div>`).join('');
    return `
      <div class="stats-grid" style="grid-template-columns:repeat(5,minmax(0,1fr))">
        <div class="stat emphasis"><div class="label">距上次消费</div><div class="value">${st.since}<small>天</small></div><div class="sub">${st.last} · ${rt}</div></div>
        <div class="stat"><div class="label">近 3 个月</div><div class="value">${st.f3}<small>次</small></div><div class="sub">近 12 个月 ${st.f12} 次</div></div>
        <div class="stat"><div class="label">平均间隔</div><div class="value">${st.gap == null ? '—' : st.gap}<small>${st.gap == null ? '' : '天'}</small></div><div class="sub">首次 ${st.first}</div></div>
        <div class="stat"><div class="label">累计消费</div><div class="value">${C.yuan(st.spend)}</div><div class="sub">${st.orders} 单 · 含购买大会员卡</div></div>
        <div class="stat"><div class="label">客单价</div><div class="value">${C.yuan(st.avg)}</div><div class="sub">${st.rows.length} 个业务</div></div>
      </div>
      <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <section class="panel"><div class="section-title"><h2>各业务消费</h2><span class="tiny">${C.pill(rt, rtone)}</span></div>
          <div class="bar">${st.rows.map((r) => `<span style="width:${(r.spend / st.spend) * 100}%;background:${C.BIZ[r.b].c}"></span>`).join('')}</div>
          <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>业务</th><th class="r">订单</th><th class="r">金额</th><th class="r">占比</th><th class="r">近 3 个月</th><th>最近一次</th></tr></thead><tbody>
          ${st.rows.map((r) => `<tr><td>${C.biz(r.b)}</td><td class="r num">${r.orders}</td><td class="r num">${C.yuan(r.spend)}</td><td class="r num">${Math.round((r.spend / st.spend) * 100)}%</td><td class="r num">${r.f3}</td><td class="num">${r.last}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="panel"><div class="section-title"><h2>近 12 个月到访</h2><span class="legend">${st.rows.map((r) => `<span><i style="background:${C.BIZ[r.b].c}"></i>${C.BIZ[r.b].n}</span>`).join('')}</span></div>
          <div class="mchart">${chart}</div></section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="section-title"><h2>最近订单</h2><span class="tiny">仅订单摘要；商品成本与其他业务明细不进入 CRM</span></div>
        <div class="table-wrap"><table><thead><tr><th>时间</th><th>业务</th><th>订单</th><th>摘要</th><th class="r">实付</th><th>大会员卡 / 积分</th></tr></thead><tbody>
        ${m.activity.map((a) => `<tr><td class="num">${a.at}</td><td>${C.biz(a.b)}</td><td class="mono">${a.order}</td><td>${E(a.sum)}</td><td class="r num">${C.yuan(a.paid)}</td><td class="small muted">${E(a.note)}</td></tr>`).join('')}
        </tbody></table></div></section>`;
  }

  function brandCardSection(m) {
    if (!m.periods.length) return `<section class="panel"><div class="empty"><b>未开通 Full愈 大会员卡</b>时叙、轻疗、在场三个小程序都可购买；业务端报价 → 自有商户收款 → 支付回调验签后调 CRM 开卡。</div></section>`;
    const cur = m.periods.find((p) => p.status === 'ACTIVE') || m.periods[0];
    const c = cardState(m);
    const list = m.periods.map((p) => `<tr><td class="mono">${p.card} · 第 ${p.no} 期</td><td>${C.pill(...C.CARD_STATUS[p.status])}</td><td class="num">${p.start} → ${p.end}</td><td>${C.biz(p.sold)}</td><td class="mono">${p.order}</td><td class="r num">${C.yuan(p.paid)}</td><td class="r num">${C.yuan(saved(p))}</td></tr>`).join('');
    const detail = m.periods.map((p) => {
      const r = refundEstimate(m, p);
      const usage = p.usage.length
        ? `<div class="table-wrap"><table><thead><tr><th>使用业务</th><th>订单</th><th>日期</th><th class="r">已省</th><th class="r">已冲减</th></tr></thead><tbody>${p.usage.map((u) => `<tr><td>${C.biz(u.b)}</td><td class="mono">${u.order}</td><td class="num">${u.at}</td><td class="r num">${C.yuan(u.saved)}</td><td class="r num">${u.rev ? C.yuan(u.rev) : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="note">本期尚未使用任何权益。</div>';
      let refund;
      const rf = C.refundFor && C.refundFor(m, p);
      if (rf) refund = `<div class="note ${rf.status === 'REFUNDED' ? '' : 'warn'}">退卡单 <span class="mono">${rf.id}</span> ${C.pill(...C.refundStatus(rf))}<br>${rf.full ? `7 天全额 ${C.yuan(p.paid)}，免审批` : rf.approved != null ? `批准 ${C.yuan(rf.approved)}` : `建议 ${C.yuan(r.suggested)}，待财务审批`}${rf.refunded != null ? ` · 实退 ${C.yuan(rf.refunded)}` : ''} <button class="text-btn" data-act="rfView" data-id="${rf.id}">查看 ›</button></div>`;
      else if (p.status === 'REFUNDED') refund = `<div class="note">已退卡${p.refunded != null ? ` · 实退 ${C.yuan(p.refunded)}` : ''}。</div>`;
      else if (p.status === 'EXPIRED') refund = '<div class="note">已到期卡期不可退。</div>';
      else if (p.lockNote) refund = `<div class="note warn">${E(p.lockNote)}</div>`;
      else if (!r.isLast) refund = '<div class="note">只允许退最后一期卡（避免卡期中间出现空档）。如需退卡，请先退续费的第 2 期。</div>';
      else refund = `<div class="note ${r.full ? 'ok' : ''}">支付后第 ${r.day} 天 · 已享优惠 ${C.yuan(r.used)}<br>${r.full ? `符合 7 天全额退：退 ${C.yuan(p.paid)}，无需审批` : `建议退款额 = 实付 ${C.yuan(p.paid)} − 已享 ${C.yuan(r.used)} = <b>${C.yuan(r.suggested)}</b>；需财务审批，可下调不可上调`}</div>`;
      return `<section class="panel"><div class="section-title"><h2>${p.card} · 第 ${p.no} 期</h2>${C.pill(...C.CARD_STATUS[p.status])}</div>
        <div class="grid-2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
          <div><div class="eyebrow" style="margin-bottom:8px">权益使用（${p.usage.length} 笔 · 合计 ${C.yuan(saved(p))}）</div>${usage}</div>
          <div class="stack" style="gap:12px"><div><div class="eyebrow" style="margin-bottom:8px">开卡时权益快照</div>
            ${Object.entries(C.BENEFIT_SNAPSHOT).map(([b, s]) => `<div class="health"><span>${C.biz(b)}</span><span class="small">${s.text}</span></div>`).join('')}</div>
            <div><div class="eyebrow" style="margin-bottom:8px">退卡（由售卖业务发起，CRM 审批）</div>${refund}</div></div>
        </div></section>`;
    }).join('');
    return `
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card-visual"><div class="eyebrow">FULL YU ANNUAL MEMBER</div><h3>${E(C.CARD_PRODUCT.name)}</h3>
          <p>${c.until ? `有效至 ${c.until}` : ''} · 开卡来源 ${C.BIZ[cur.sold].n} · 实付 ${C.yuan(cur.paid)}</p>
          <p style="margin-top:10px">${m.biz.length} 个业务已登录 · 三端权益均按开卡快照执行</p></div>
        <section class="panel"><div class="section-title"><h2>规则</h2></div>
          <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.9"><li>续费：新卡期从当前最晚到期日开始，先为「待生效」</li><li>7 天内且三端均未使用权益：全额退</li><li>其余：实付 − 已享优惠（最低 0），财务审批，原售卖业务退款</li><li>退卡锁定期间三端权益立即停用</li></ul></section>
      </div>
      <div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>卡期</th><th>状态</th><th>起止</th><th>售卖业务</th><th>订单</th><th class="r">实付</th><th class="r">已享优惠</th></tr></thead><tbody>${list}</tbody></table></div>
      <div class="stack">${detail}</div>`;
  }


  function tabPoints(m) {
    const bal = balance(m);
    const last = lastBalance(m);
    const exp = expiringFirst(m);
    const L = ledgerWithBalance(m).reverse();
    return `
      ${pointsBar(m)}
      <div class="check ${bal === last ? 'ok' : 'bad'}" style="margin-bottom:14px">${bal === last ? '账实一致' : '账实不一致'}：可用批次 remaining 合计 <b class="num">${C.n(bal)}</b> ${bal === last ? '=' : '≠'} 最新流水 balance_after <b class="num">${C.n(last)}</b>（每日对账校验此不变量）</div>
      ${exp ? `<div class="note warn" style="margin-bottom:16px">${C.n(exp.pts)} 分将于 ${exp.date} 00:00 过期。消耗时按到期日最早优先扣减；过期前 30 天、7 天由最近活跃业务的小程序提醒。</div>` : ''}
      <section class="panel" style="margin-bottom:16px"><div class="section-title"><h2>积分批次</h2><span class="tiny">1–10 月获得 → 次年 1/1 过期；11–12 月获得 → 后年 1/1 过期</span></div>
        <div class="table-wrap"><table><thead><tr><th>批次</th><th>发放业务</th><th>来源单号</th><th>获得</th><th>到期</th><th>状态</th><th class="r">发放</th><th class="r">剩余</th></tr></thead><tbody>
        ${m.batches.map((b) => `<tr><td class="mono">${b.id}</td><td>${C.biz(b.biz)}</td><td class="mono">${b.ref}</td><td class="num">${b.earned}</td><td class="num">${b.expire}</td><td>${C.pill(...C.BATCH_STATUS[b.status])}</td><td class="r num">${C.n(b.amount)}</td><td class="r num"><b>${C.n(b.remaining)}</b></td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="panel"><div class="section-title"><h2>积分流水</h2><span class="tiny">只追加 · 当前无预占中的积分</span></div>
        <div class="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>业务</th><th>关联单号</th><th>批次分配</th><th class="r">变动</th><th class="r">余额</th></tr></thead><tbody>
        ${L.map((l) => `<tr><td class="num">${l.at}</td><td>${C.pill(C.LEDGER_TYPE[l.type], l.delta < 0 ? 'amber' : 'green')}</td><td>${C.biz(l.b)}</td><td class="mono">${l.ref}</td><td class="tiny muted">${l.alloc || '—'}</td><td class="r num" style="color:${l.delta < 0 ? 'var(--danger)' : 'var(--success)'}">${l.delta > 0 ? '+' : ''}${C.n(l.delta)}</td><td class="r num">${C.n(l.bal)}</td></tr>`).join('')}
        </tbody></table></div></section>`;
  }

  function tabJourney(m) {
    const d = m.dice;
    if (d.guest) return `<section class="panel"><div class="empty"><b>非会员暂未开放愈行之旅</b>非会员能否游玩仍待经营决策；demo 按「开通大会员卡后消费得骰子」展示。</div></section>`;
    const month = d.log.filter((x) => x.at.startsWith('2026-11'));
    const by = {};
    month.forEach((x) => { by[x.b] = (by[x.b] || 0) + x.d; });
    const total = month.reduce((s, x) => s + x.d, 0) || 1;
    const prizeStatus = { PENDING: ['待领取', 'amber'], COLLECTED: ['已领取', 'green'], EXPIRED: ['已过期', 'red'] };
    return `
      <div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="stat emphasis"><div class="label">剩余骰子</div><div class="value">${d.left}<small>颗</small></div><div class="sub">骰子账本归 CRM，退款时收回未用骰子</div></div>
        <div class="stat"><div class="label">当前位置</div><div class="value" style="font-size:20px">${E(d.pos)}</div><div class="sub">第 ${d.lap} 圈</div></div>
        <div class="stat"><div class="label">本月获得</div><div class="value">${month.reduce((s, x) => s + x.d, 0)}<small>颗</small></div><div class="sub">月上限待经营决策</div></div>
      </div>
      <div class="grid-2">
        <section class="panel"><div class="section-title"><h2>骰子来源与流水</h2><span class="tiny">按「业务 + 订单号」去重</span></div>
          <div class="bar">${Object.entries(by).map(([b, v]) => `<span style="width:${(v / total) * 100}%;background:${C.BIZ[b].c}"></span>`).join('')}</div>
          <div class="legend" style="margin-bottom:12px">${Object.entries(by).map(([b, v]) => `<span>${C.BIZ[b].n} ${v}</span>`).join('')}</div>
          <div class="table-wrap"><table><thead><tr><th>时间</th><th>来源</th><th>关联</th><th class="r">骰子</th></tr></thead><tbody>
          ${d.log.map((x) => `<tr><td class="num">${x.at}</td><td>${C.biz(x.b)}</td><td class="mono">${E(x.ref)}</td><td class="r num">+${x.d}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="panel"><div class="section-title"><h2>旅途礼物</h2><span class="tiny">到店人工确认交付，不扫码</span></div>
          ${d.prizes.length ? d.prizes.map((z) => `<div class="prize"><span class="ico">礼</span><div style="flex:1;min-width:0"><strong>${E(z.name)}</strong><div class="tiny muted">${E(z.station)} · ${z.won} 获得 · ${E(z.where)}</div>
            <div class="tiny muted">${z.status === 'COLLECTED' ? `${z.at} 由 ${E(z.by)}` : `${z.exp} 前领取`}</div></div>${C.pill(...prizeStatus[z.status])}</div>`).join('') : '<div class="empty"><b>暂无礼物</b>走到礼物站后在这里出现。</div>'}
          <p class="tiny muted" style="margin-top:10px">门店营业台点「确认交付」后写入领取记录，同一礼物只能确认一次。</p></section>
      </div>`;
  }

  function tabIdentity(m) {
    return `
      <div class="grid-2">
        <section class="panel"><div class="section-title"><h2>身份映射</h2><span class="tiny">唯一 (business, local_user_id)</span></div>
          <div class="table-wrap"><table><thead><tr><th>业务</th><th>本地用户</th><th>小程序</th><th>openId</th><th>首次关联</th></tr></thead><tbody>
          ${m.ids.map((i) => `<tr><td>${C.biz(i.b)}</td><td class="mono">${i.local}</td><td class="tiny">${E(i.app)}</td><td class="mono">${E(i.open)}</td><td class="num">${i.at}</td></tr>`).join('')}</tbody></table></div>
          <div class="note" style="margin-top:12px">识别顺序：本地映射 → 手机号精确匹配 → unionId 精确匹配 → 新建。手机号与 unionId 指向不同会员时不自动合并，生成身份冲突工单。</div></section>
        <div class="stack">
          <section class="panel"><div class="section-title"><h2>会员码</h2></div>
            <div class="health"><span>动态码</span><span class="small">FY 会员号 + 时间戳签名 · 60 秒有效</span></div>
            ${m.alias.length ? m.alias.map((a) => `<div class="health"><span class="mono">${a}</span>${C.pill('旧码别名 · 过渡期可扫', 'amber')}</div>`).join('') : '<div class="health"><span class="muted small">无旧码</span></div>'}</section>
          ${phonePolicy(m)}
          <section class="panel"><div class="section-title"><h2>授权记录</h2><span class="tiny">当前政策 2026.11</span></div>
            ${m.consents.map((c) => `<div class="health"><div><span class="mono">v${c.v}</span> · ${C.biz(c.b)}<div class="tiny muted">${c.at}${c.rev ? ` · 撤回 ${c.rev}` : ''}</div></div>${c.old ? C.pill('旧版本 · 下次登录需重新确认', 'amber') : C.pill('有效', 'green')}</div>`).join('')}</section>
        </div>
      </div>`;
  }

  /* ---------- 权益卡：Full愈 大会员卡 + 业务会员卡（只读） ---------- */
  function bizCardsTable(m) {
    const list = m.bizCards || [];
    if (!list.length) return `<div class="empty"><b>暂无业务会员卡</b>该会员在时叙、轻疗、在场都没有持有业务线自有会员卡。</div>`;
    const tone = (s) => s === '生效中' ? 'green' : s === '即将到期' ? 'amber' : s === '已到期' ? '' : 'lilac';
    return `<div class="table-wrap"><table><thead><tr><th>业务</th><th>卡名</th><th>卡号</th><th>类型</th><th>状态</th><th>有效期</th><th>余量</th><th>同步于</th></tr></thead><tbody>
      ${list.map((k) => `<tr><td>${C.biz(k.b)}</td><td><strong>${E(k.name)}</strong></td><td class="mono">${k.no}</td><td>${E(k.type)}</td><td>${C.pill(k.status, tone(k.status))}</td><td class="num">${k.valid}</td><td class="num">${E(k.remain)}</td><td class="num tiny muted">${k.synced}${m.snap[k.b] && m.snap[k.b].stale ? ' ' + C.pill('同步延迟', 'red') : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function tabCard(m) {
    return `
      <div class="section-title block"><h2>Full愈 大会员卡</h2><button class="text-btn" data-act="nav" data-key="brandcard">产品与权益配置 ›</button></div>
      ${brandCardSection(m)}
      <div class="section-title block" style="margin-top:22px"><h2>业务会员卡</h2><span class="tiny">只读 · 开卡、核销、退卡在各业务系统完成，CRM 只同步基础信息</span></div>
      ${bizCardsTable(m)}`;
  }

  /* 积分页顶部：调整入口 + 本会员待审批的调整单 */
  function pointsBar(m) {
    const can = C.can('adjust:create');
    const pend = C.ADJUSTS.filter((a) => a.status === 'PENDING' && a.lines.some((l) => l.no === m.no));
    return `<div class="table-tools" style="justify-content:space-between">
        <span class="small muted">人工调整写 ADJUST 流水，只追加；单笔 ≤ ${C.ADJ_LIMIT} 分直接入账，超过或批量需另一人审批。</span>
        <button class="btn" data-act="adjustOne" data-no="${m.no}" ${can ? '' : 'disabled title="当前角色无 adjust:create 权限"'}>单笔调整</button></div>
      ${pend.map((a) => { const l = a.lines.find((x) => x.no === m.no); return `<div class="note warn" style="margin-bottom:12px">调整单 <span class="mono">${a.id}</span>（${a.kind === 'batch' ? `批量 ${a.lines.length} 人` : '单笔'}）待审批：本会员 ${l.delta > 0 ? '+' : ''}${C.n(l.delta)} 分 · ${E(a.reason)} · ${E(a.by.name)} 发起 <button class="text-btn" data-act="adjView" data-id="${a.id}">查看 ›</button></div>`; }).join('')}`;
  }

  /* 身份页：手机号展示规则 */
  function phonePolicy(m) {
    return `<section class="panel"><div class="section-title"><h2>手机号展示规则</h2><span class="tiny">2026-11-08 确认</span></div>
      <div class="health"><span>CRM 总部后台</span><span class="small">明文 <span class="num">${m.phone}</span> · 打开档案即记审计</span></div>
      <div class="health"><span>三端后台 列表 / 详情 / 导出</span><span class="small num">${C.mask(m.phone)}</span></div>
      <div class="health"><span>三端后台 单次拨打电话</span><span class="small">点击时向 CRM 取明文并留痕，不落页面</span></div>
      <div class="health"><span>CRM 导出</span><span class="small">默认脱敏；明文导出需审批，仅发起人下载一次</span></div>
      ${(() => { const r = C.pendingRebind && C.pendingRebind(m.no); return r ? `<div class="note warn" style="margin-top:10px">换绑单 <span class="mono">${r.id}</span> 待审批：${C.mask(r.from)} → ${C.mask(r.to)} · ${E(r.by.name)} 发起 <button class="text-btn" data-act="rbView" data-id="${r.id}">查看 ›</button></div>` : ''; })()}</section>`;
  }

  const TAB_RENDER = { overview: tabOverview, profile: tabProfile, spend: tabSpend, card: tabCard, points: tabPoints, journey: tabJourney, identity: tabIdentity };

  C.pages.member = {
    title: '会员 360',
    render([no, tab = 'overview']) {
      const m = C.member(no);
      if (!m) return `<div class="placeholder"><h1>未找到会员 ${E(no)}</h1><button class="btn" data-act="nav" data-key="members">返回会员查询</button></div>`;
      if (m.status === 'MERGED') {
        const p = C.member(m.mergedInto);
        return `<button class="crumb text-btn" data-act="nav" data-key="members">‹ 会员查询</button>
          <div class="placeholder"><span class="pill">已合并</span><h1>${E(m.name)} · <span class="mono">${m.no}</span></h1>
            <p class="muted small">${E(m.mergedAt || '')} 已并入 ${E(p.name)}（${p.no}）。身份、积分批次与权益已迁移，原会员号保留为别名，旧单据仍可按此号检索。</p>
            <div style="margin-top:18px"><button class="btn primary" data-act="openMember" data-no="${p.no}">打开主会员档案 ›</button></div></div>`;
      }
      /* CRM 内资料为明文：每个身份首次打开某会员档案记一条审计 */
      const key = `${C.state.role}|${m.no}`;
      if (!C.state.viewed[key]) { C.state.viewed[key] = true; C.audit('查看会员档案', `${m.name} · ${m.no}`, '含明文手机号与资料'); }
      const adj = C.can('adjust:create');
      const idc = C.can('identity:create');
      return `
        <button class="crumb text-btn" data-act="nav" data-key="members">‹ 会员查询</button>
        <div class="m-head"><span class="avatar">${E(m.name.slice(0, 1))}</span>
          <div><h1>${E(m.name)}${m.call ? `<span class="small muted" style="font-weight:400">称呼「${E(m.call)}」</span>` : ''} ${cardPill(m)}</h1>
            <div class="m-meta"><span class="mono">${m.no}</span>${phoneCell(m)}<span>资料 v${m.ver}</span><span class="chips">${m.biz.map(C.biz).join('')}</span></div>
            <div class="tiny muted" style="margin-top:4px">本次查看已记入审计日志（${C.me().code} · ${C.NOW}）</div></div>
          <div class="m-actions">
            <button class="btn" data-act="adjustOne" data-no="${m.no}" ${adj ? '' : 'disabled title="当前角色无 adjust:create 权限"'}>积分调整</button>
            <button class="btn" data-act="rebind" data-no="${m.no}" ${idc ? '' : 'disabled title="当前角色无 identity:create 权限"'}>换绑手机号</button>
          </div></div>
        <div class="tabs" role="tablist">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}</div>
        ${(TAB_RENDER[tab] || tabOverview)(m)}`;
    }
  };
  C.act.tab = (el) => C.go(`#/member/${C.state.params[0]}/${el.dataset.tab}`);

  /* ---------- 编辑资料：改完版本 +1，推送三端快照（故障中的业务保持落后，待补投） ---------- */
  C.act.editProfile = (el) => {
    const m = C.member(el.dataset.no);
    const g = (v, t) => `<option value="${v}" ${String(m.gender ?? '') === v ? 'selected' : ''}>${t}</option>`;
    C.dialog(`编辑资料 · ${E(m.name)}`,
      `<div class="form">
        <label>称呼<input id="pfCall" maxlength="12" value="${E(m.call || '')}" placeholder="如：小满"></label>
        <label>性别<select id="pfGender">${g('', '未填写')}${g('1', '男')}${g('2', '女')}</select></label>
        <label>生日<input id="pfBirthday" type="date" max="${C.TODAY}" value="${m.birthday || ''}"></label>
        <label>城市<input id="pfCity" maxlength="12" value="${E(m.city || '')}"></label>
        <p class="tiny muted">姓名与手机号不在此修改：手机号走换绑审批。保存后资料版本 +1，推送三端快照。</p>
        <p id="pfErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="saveProfile" data-no="${m.no}">保存</button>`);
  };
  C.act.saveProfile = (el) => {
    const m = C.member(el.dataset.no);
    const v = (id) => document.getElementById(id).value.trim();
    const err = (t) => { const e = document.getElementById('pfErr'); e.textContent = t; e.hidden = false; };
    const next = { call: v('pfCall'), gender: v('pfGender') ? +v('pfGender') : null, birthday: v('pfBirthday'), city: v('pfCity') };
    if (next.birthday && (next.birthday > C.TODAY || next.birthday < '1900-01-01')) return err('生日不能晚于今天，也不能早于 1900 年');
    const LABEL = { call: '称呼', gender: '性别', birthday: '生日', city: '城市' };
    const show = (k, x) => k === 'gender' ? genderText(x) : (x || '空');
    const diff = Object.keys(next).filter((k) => (m[k] ?? (k === 'gender' ? null : '')) !== next[k]);
    if (!diff.length) return err('没有修改');
    const detail = diff.map((k) => `${LABEL[k]}：${show(k, m[k])} → ${show(k, next[k])}`).join('；');
    Object.assign(m, next);
    m.ver += 1;
    C.emit('member.profile.changed', m, diff.map((k) => LABEL[k]).join('、') + '更新');
    C.audit('修改会员资料', `${m.name} · ${m.no}`, detail);
    C.closeDialog();
    C.render();
    const behind = Object.entries(m.snap).filter(([, s]) => s.stale).map(([b]) => C.BIZ[b].n);
    C.toast(`已保存 · 资料 v${m.ver}${behind.length ? `，${behind.join('、')}快照待补投` : ' 已推送三端'}`);
  };
})();
