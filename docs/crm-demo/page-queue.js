/* Full愈 CRM demo · 异常队列（人工队列、每日对账差异、身份冲突）
 * 设计 §3/§5：实付 ≠ 报价拒绝开卡、预占超时且重占不足、出站超 24 小时 → 人工队列；
 *   每日 GET /crm/recon?date= 比对，差异写 recon_diff；同一 unionId 指向不同会员只开工单，不自动合并。
 * 处理规则：处理前按当时数据重新校验；处理说明必填（≥ 4 字）；每次处理写审计。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const { balance, cardState } = C.calc;
  const API = (b) => `${C.BIZ[b].n}后端（签名 API）`;
  const hm = (t) => t.slice(11, 16);
  const err = (t) => { const e = document.getElementById('qErr'); if (e) { e.textContent = t; e.hidden = false; } };
  const wide = (w) => { document.getElementById('dlg').style.width = `min(${w}px, calc(100vw - 28px))`; };
  /* 会员已被合并时，后续处理落到主会员 */
  const target = (no) => { let m = C.member(no); while (m && m.status === 'MERGED') m = C.member(m.mergedInto); return m; };
  const Q_STATUS = { OPEN: ['待处理', 'amber'], WAIT_BIZ: ['待业务端回执', 'lilac'], RESOLVED: ['已处理', 'green'] };

  /* ---------- 种子：与 data.js 已埋数据对应 ---------- */
  C.QUEUE = [
    { id: 'MQ-20261107-0003', kind: 'AMOUNT_MISMATCH', no: 'FY-2608-002210', biz: 'sx', order: 'TH-20261107-0193', at: '2026-11-07 11:40', status: 'OPEN',
      sum: '实付 ¥599 ≠ 报价 ¥699，未开卡', quote: { id: 'CQ-20261107-0058', at: '2026-11-07 11:31', cents: 69900 }, paid: 59900,
      log: [
        { at: '2026-11-07 11:31', t: '时叙 card-quote：年度会员 ¥699（报价单 CQ-20261107-0058，24 小时内有效）' },
        { at: '2026-11-07 11:38', t: '顾客实付 ¥599（前端仍显示已过期的开卡券价）' },
        { at: '2026-11-07 11:40', t: '时叙 card/open：paidCents 59900 ≠ 报价 69900 → CRM 拒绝开卡，转人工队列' }
      ],
      opts: [['refund', '原路退回 ¥599', '通知时叙按原支付渠道全额退款，不开卡'], ['topup', '补收差额 ¥100 后开卡', '顾客另付补差单，CRM 按原报价开卡；报价须在 24 小时内']] },
    { id: 'MQ-20261107-0002', kind: 'HOLD_EXPIRED', no: 'FY-2605-000927', biz: 'ql', order: 'QL-20261107-0301', at: '2026-11-07 11:02', status: 'OPEN',
      sum: '确认时重新预占不足，90 分未扣', pts: 90,
      log: [
        { at: '2026-11-07 10:41', t: '轻疗 points/hold：订单 ¥180 抵扣 90 分，实付 ¥90，预占 15 分钟' },
        { at: '2026-11-07 10:56', t: '预占到期未确认，自动释放 90 分' },
        { at: '2026-11-07 11:02', t: '轻疗 points/confirm 到达；重新预占只余 60 分（QL-20261107-0305 预占了 150 分）→ POINTS_HOLD_EXPIRED，不允许负余额' },
        { at: '2026-11-07 11:20', t: 'QL-20261107-0305 取消，释放 150 分；当前可用 210 分' }
      ],
      opts: [['deduct', '现在扣减 90 分', '按当前余额重新校验，按到期日最早优先扣减；不足则不执行'], ['collect', '通知轻疗补收 ¥90', '积分不扣，由轻疗向顾客补收差额']] },
    { id: 'MQ-20261107-0001', kind: 'OUTBOUND_24H', no: 'FY-2607-001204', biz: 'sx', order: 'TH-20261106-0011', at: '2026-11-07 09:20', status: 'OPEN',
      sum: '积分发放 36 分 · 401 签名失败超 24 小时', pts: 36, idem: 'sx:TH-20261106-0011:earn', earned: '2026-11-06',
      log: [
        { at: '2026-11-06 09:20', t: '时叙出站任务：TH-20261106-0011 消费 ¥36 → 发放 36 分（幂等键 sx:TH-20261106-0011:earn）' },
        { at: '2026-11-06 09:20', t: 'CRM 返回 401 签名校验失败（key_id sx-k1 已轮换停用），时叙按退避重试' },
        { at: '2026-11-07 09:20', t: '连续失败超过 24 小时，转人工队列；时叙当前已改用 sx-k2' }
      ],
      opts: [['reissue', '按原幂等键补发 36 分', '以 sx:TH-20261106-0011:earn 入账；时叙之后再投同一键只会命中幂等，不会重复发放'], ['void', '作废该出站任务', '确认订单已退款或不应发放时使用，不发放积分']] }
  ];
  const KIND = { AMOUNT_MISMATCH: '开卡金额不符', HOLD_EXPIRED: '积分预占超时', OUTBOUND_24H: '出站超 24 小时' };

  C.RECON = {
    date: '2026-11-06', ran: '2026-11-07 02:00',
    totals: { sx: [41, 40], ql: [27, 26], zc: [18, 18] },
    diffs: [
      { id: 'RD-20261106-0002', biz: 'ql', no: 'FY-2602-008812', order: 'QL-R-20261106-0011', kind: '部分退款未撤回积分', status: 'OPEN',
        bizSide: '部分退款 ¥120（原单 QL-20261102-0117），应撤回 120 分', crmSide: '批次 PB-0398 仍为 380 分', fix: '撤回 120 分（PB-0398：380 → 260）' },
      { id: 'RD-20261106-0001', biz: 'sx', no: 'FY-2512-000012', order: 'TH-20261106-0030', kind: '年卡权益使用缺记', status: 'OPEN',
        bizSide: '松 · 桂花冷萃 年卡优惠 ¥2', crmSide: '卡期 FYC-25-000041 第 1 期无此笔', fix: '补记权益使用 ¥2（影响退卡建议额与月度对账）' }
    ]
  };
  const RD_OPTS = [['biz', '以业务端为准补记', ''], ['crm', '以 CRM 为准', '通知业务端更正本地记录，CRM 不调账'], ['explain', '已解释，不调账', '如跨日订单、对账时点差异']];

  C.CONFLICTS = [
    { id: 'IC-20261107-0001', a: 'FY-2503-000431', b: 'FY-2608-002210', union: 'oU_3c…e90', at: '2026-11-07 11:36', status: 'OPEN',
      how: '许清在时叙登录时取得的 unionId 与在场会员周以安相同；手机号不同，系统未合并，开工单' }
  ];

  C.queueOpen = (k) => k === 'manual' ? C.QUEUE.filter((q) => q.status === 'OPEN').length
    : k === 'recon' ? C.RECON.diffs.filter((d) => d.status === 'OPEN').length
      : C.CONFLICTS.filter((c) => c.status === 'OPEN').length;

  /* ---------- 处理前通用校验 ---------- */
  function readNote() {
    const n = (document.getElementById('qNote') || {}).value || '';
    return n.trim();
  }
  function picked() { const r = document.querySelector('input[name="qOpt"]:checked'); return r ? r.value : ''; }
  const noteField = (ph) => `<label>处理说明（必填，至少 4 个字）<input id="qNote" maxlength="80" placeholder="${E(ph)}"></label>`;
  const optField = (opts) => `<div class="chips" role="radiogroup" aria-label="处理方式">${opts.map(([k, t], i) => `<label class="radio"><input type="radio" name="qOpt" value="${k}" ${i ? '' : 'checked'}>${E(t)}</label>`).join('')}</div>
    <ul class="tiny muted" style="margin:6px 0 0;padding-left:18px">${opts.filter((o) => o[2]).map(([, t, d]) => `<li>${E(t)}：${E(d)}</li>`).join('')}</ul>`;
  const steps = (log) => `<div class="eyebrow" style="margin:14px 0 6px">过程</div><ul class="steps">${log.map((x) => `<li><span class="num tiny muted">${x.at}</span>${E(x.t)}</li>`).join('')}</ul>`;
  const done = (msg) => { C.closeDialog(); C.render(); C.toast(msg); };

  /* FIFO：到期日最早、获得最早优先 */
  function consume(m, pts) {
    let need = pts;
    const parts = [];
    m.batches.filter((b) => b.status === 'ACTIVE' && b.remaining > 0).sort((a, b) => (a.expire + a.earned < b.expire + b.earned ? -1 : 1)).forEach((b) => {
      if (!need) return;
      const take = Math.min(need, b.remaining);
      b.remaining -= take;
      need -= take;
      if (!b.remaining) b.status = 'DEPLETED';
      parts.push(`${b.id}:${take}`);
    });
    return parts.join(' · ');
  }

  /* ---------- 人工队列 ---------- */
  C.act.qView = (el) => {
    const q = C.QUEUE.find((x) => x.id === el.dataset.id);
    const m = target(q.no);
    const can = C.can('queue:handle');
    let action = '';
    if (q.status === 'OPEN') {
      action = can ? `<div class="form" style="margin-top:14px">${optField(q.opts)}
          ${q.kind === 'AMOUNT_MISMATCH' ? `<label>补差订单号（选择补收时必填，时叙另开的 ¥100 订单）<input id="qTopup" class="mono" maxlength="20" placeholder="TH-20261107-0000"></label>` : ''}
          ${noteField('如：已电话联系顾客，同意补差')}<p id="qErr" class="tiny err" hidden></p></div>`
        : '<div class="note warn" style="margin-top:12px">当前角色无处理权限（queue:handle：财务 / 管理员）。</div>';
    } else if (q.status === 'WAIT_BIZ') {
      action = `<div class="note" style="margin-top:12px">已通知${C.BIZ[q.biz].n}：${E(q.wait)}。收到业务端回执后自动结单。</div>
        <div class="sim"><span class="tiny muted">演示：模拟${C.BIZ[q.biz].n}后端回执</span><button class="btn" data-act="qAck" data-id="${q.id}">${C.BIZ[q.biz].n}回执：${q.kind === 'AMOUNT_MISMATCH' ? '退款成功' : '已补收'}</button></div>`;
    } else if (q.kind === 'OUTBOUND_24H' && q.result === 'reissue') {
      action = `<div class="sim"><span class="tiny muted">演示：时叙出站任务恢复后，用同一幂等键再投一次</span><button class="btn" data-act="qReplay" data-id="${q.id}">时叙再投 ${q.idem}</button></div>`;
    }
    C.dialog(`${KIND[q.kind]} · ${q.id}`,
      `<dl class="kv"><dt>会员</dt><dd>${E(m.name)} · <button class="text-btn mono" data-act="qGoMember" data-no="${m.no}">${m.no} ›</button>${m.no !== q.no ? `<div class="tiny muted">原会员 ${q.no} 已并入</div>` : ''}</dd>
        <dt>业务订单</dt><dd>${C.biz(q.biz)} <span class="mono">${q.order}</span></dd>
        ${q.kind === 'AMOUNT_MISMATCH' ? `<dt>报价</dt><dd><span class="mono tiny">${q.quote.id}</span> · ${C.yuan(q.quote.cents)} · ${q.quote.at} 生成</dd><dt>实付</dt><dd>${C.yuan(q.paid)}，差额 ${C.yuan(q.quote.cents - q.paid)}</dd>` : ''}
        ${q.kind === 'HOLD_EXPIRED' ? `<dt>积分</dt><dd>应扣 ${q.pts} 分 · 当前可用 <b>${C.n(balance(m))}</b> 分</dd>` : ''}
        ${q.kind === 'OUTBOUND_24H' ? `<dt>幂等键</dt><dd class="mono tiny">${q.idem}</dd><dt>积分</dt><dd>应发 ${q.pts} 分（按订单日 ${q.earned} 计过期）</dd>` : ''}
        <dt>状态</dt><dd>${C.pill(...Q_STATUS[q.status])}${q.by ? `<div class="tiny muted">${E(q.by)} · ${q.doneAt}${q.note ? ' · ' + E(q.note) : ''}</div>` : ''}</dd></dl>
       ${steps(q.log)}${action}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${q.status === 'OPEN' && can ? `<button class="btn primary" data-act="qResolve" data-id="${q.id}">确认处理</button>` : ''}`);
    wide(620);
  };
  C.act.qGoMember = (el) => { C.closeDialog(); C.go(`#/member/${el.dataset.no}`); };

  C.act.qResolve = (el) => {
    const q = C.QUEUE.find((x) => x.id === el.dataset.id);
    if (q.status !== 'OPEN') return C.toast('该工单已处理');
    if (!C.can('queue:handle')) return C.toast('当前角色无 queue:handle 权限');
    const opt = picked();
    const note = readNote();
    if (note.length < 4) return err('处理说明至少 4 个字');
    const m = target(q.no);
    const who = `${C.me().name}（${C.me().code}）`;
    const label = q.opts.find((o) => o[0] === opt)[1];
    const finish = (status, t, extra) => {
      Object.assign(q, { status, result: opt, by: who, doneAt: C.NOW, note }, extra || {});
      q.log.push({ at: C.NOW, t });
      C.audit('处理人工队列', `${m.name} · ${m.no}`, `${q.id} ${KIND[q.kind]} · ${label} · ${note}`);
    };

    if (opt === 'topup') {
      const no = ((document.getElementById('qTopup') || {}).value || '').trim().toUpperCase();
      if (!/^TH-\d{8}-\d{4}$/.test(no)) return err('补差订单号格式：TH-日期-4 位序号');
      if (no === q.order) return err('补差订单不能是原订单');
      if (C.days(q.quote.at.slice(0, 10), C.TODAY) > 1 || (new Date(C.NOW.replace(' ', 'T')) - new Date(q.quote.at.replace(' ', 'T'))) > 864e5) return err('报价已超过 24 小时，只能原路退款');
      if (['ACTIVE', 'PENDING', 'REFUND_LOCKED'].includes(cardState(m).key)) return err('会员已有生效或待生效的年卡，不能再开卡，请改选原路退款');
      m.periods.unshift({ card: 'FYC-26-000412', no: 1, start: C.TODAY, end: '2027-11-07', status: 'ACTIVE', sold: 'sx', order: q.order, paid: q.quote.cents, paidAt: C.NOW, usage: [], note: `原单 ${C.yuan(q.paid)} + 补差 ${no} ${C.yuan(q.quote.cents - q.paid)}` });
      m.activity.unshift({ at: C.NOW, b: 'sx', order: no, sum: 'Full愈 年度会员 · 补差', paid: q.quote.cents - q.paid, note: `人工队列 ${q.id} 补差后开卡 FYC-26-000412` });
      m.ver += 1;
      const behind = C.emit('member.card.changed', m, `${q.id} 补差开卡`);
      finish('RESOLVED', `${who} 补差 ${no} ${C.yuan(q.quote.cents - q.paid)} 已核对 → 按报价 ${q.quote.id} 开卡 FYC-26-000412`, { topup: no });
      return done(`已开卡 FYC-26-000412 · 推送 member.card.changed${behind.length ? `，${behind.join('、')}待补投` : ''}`);
    }
    if (opt === 'refund') {
      finish('WAIT_BIZ', `${who} 选择原路退回 ${C.yuan(q.paid)}，已下发退款指令给时叙`, { wait: `按原渠道退回 ${C.yuan(q.paid)}` });
      return done(`已通知时叙原路退款 ${C.yuan(q.paid)}，等待回执`);
    }
    if (opt === 'deduct') {
      if (balance(m) < q.pts) return err(`当前可用 ${balance(m)} 分，不足 ${q.pts} 分，请改选通知补收`);
      const alloc = consume(m, q.pts);
      m.ledger.push({ at: C.NOW, type: 'CONSUME', b: 'ql', ref: q.order, delta: -q.pts, alloc });
      m.ver += 1;
      C.emit('points.changed', m, `${q.id} 补扣 ${q.pts} 分`);
      finish('RESOLVED', `${who} 重新校验可用 ${balance(m) + q.pts} 分 → 扣减 ${q.pts} 分（${alloc}）`);
      return done(`已扣减 ${q.pts} 分 · 余额 ${C.n(balance(m))}`);
    }
    if (opt === 'collect') {
      finish('WAIT_BIZ', `${who} 选择不扣积分，通知轻疗向顾客补收 ¥90`, { wait: '向顾客补收 ¥90' });
      return done('已通知轻疗补收 ¥90，等待回执');
    }
    if (opt === 'reissue') {
      if (m.batches.some((b) => b.ref === q.order && b.biz === 'sx')) {
        finish('RESOLVED', `${q.idem} 已入账过，幂等命中，未新增批次`, { result: 'reissue' });
        return done('幂等命中：该订单已发放过，未重复入账');
      }
      m.batches.unshift({ id: 'PB-0421', biz: 'sx', ref: q.order, earned: q.earned, amount: q.pts, remaining: q.pts, expire: C.expireAt(q.earned), status: 'ACTIVE' });
      m.ledger.push({ at: C.NOW, type: 'EARN', b: 'sx', ref: q.order, delta: q.pts, idem: q.idem });
      m.ver += 1;
      C.emit('points.changed', m, `${q.id} 补发 ${q.pts} 分`);
      finish('RESOLVED', `${who} 按幂等键 ${q.idem} 补发 ${q.pts} 分，新批次 PB-0421（${C.expireAt(q.earned)} 过期）`);
      return done(`已补发 ${q.pts} 分 · 批次 PB-0421`);
    }
    finish('RESOLVED', `${who} 作废出站任务，不发放积分`);
    done('已作废，不发放积分');
  };
  C.act.qAck = (el) => {
    const q = C.QUEUE.find((x) => x.id === el.dataset.id);
    if (q.status !== 'WAIT_BIZ') return;
    const m = target(q.no);
    q.status = 'RESOLVED';
    q.log.push({ at: C.NOW, t: `${C.BIZ[q.biz].n}回执：${q.kind === 'AMOUNT_MISMATCH' ? `原路退款 ${C.yuan(q.paid)} 成功` : '已向顾客补收 ¥90'}，工单关闭` });
    if (q.kind === 'AMOUNT_MISMATCH') m.activity.unshift({ at: C.NOW, b: 'sx', order: q.order, sum: 'Full愈 年度会员 · 退款', paid: -q.paid, note: `人工队列 ${q.id} 原路退款` });
    C.sysAudit(API(q.biz), '回执人工队列', `${m.name} · ${m.no}`, `${q.id} · ${q.wait} 已完成`);
    C.act.qView(el);
    C.render();
    C.toast('业务端回执已收到，工单关闭');
  };
  C.act.qReplay = (el) => {
    const q = C.QUEUE.find((x) => x.id === el.dataset.id);
    const m = target(q.no);
    q.log.push({ at: C.NOW, t: `时叙再投 ${q.idem} → 200 幂等命中，返回原入账结果，未新增批次（余额仍 ${C.n(balance(m))} 分）` });
    C.sysAudit(API('sx'), '积分发放（幂等命中）', `${m.name} · ${m.no}`, `${q.idem} 已存在，未重复入账`);
    C.act.qView(el);
    C.toast('幂等命中：未重复发放');
  };

  /* ---------- 对账差异 ---------- */
  C.act.rdView = (el) => {
    const d = C.RECON.diffs.find((x) => x.id === el.dataset.id);
    const m = target(d.no);
    const can = C.can('queue:handle');
    const opts = RD_OPTS.map((o) => (o[0] === 'biz' ? [o[0], o[1], d.fix] : o));
    C.dialog(`对账差异 · ${d.id}`,
      `<dl class="kv"><dt>对账日</dt><dd>${C.RECON.date} · ${C.RECON.ran} 运行 <span class="mono tiny">GET /crm/recon?date=${C.RECON.date}</span></dd>
        <dt>会员</dt><dd>${E(m.name)} · <button class="text-btn mono" data-act="qGoMember" data-no="${m.no}">${m.no} ›</button></dd>
        <dt>业务订单</dt><dd>${C.biz(d.biz)} <span class="mono">${d.order}</span> · ${E(d.kind)}</dd>
        <dt>业务端</dt><dd>${E(d.bizSide)}</dd><dt>CRM</dt><dd>${E(d.crmSide)}</dd>
        <dt>状态</dt><dd>${C.pill(...Q_STATUS[d.status])}${d.by ? `<div class="tiny muted">${E(d.by)} · ${d.doneAt} · ${E(d.label)} · ${E(d.note)}</div>` : ''}</dd></dl>
       ${d.status === 'OPEN' ? (can ? `<div class="form" style="margin-top:14px">${optField(opts)}${noteField('如：已与轻疗核对退款单')}<p id="qErr" class="tiny err" hidden></p></div>` : '<div class="note warn" style="margin-top:12px">当前角色无处理权限（queue:handle：财务 / 管理员）。</div>') : ''}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${d.status === 'OPEN' && can ? `<button class="btn primary" data-act="rdResolve" data-id="${d.id}">确认处理</button>` : ''}`);
    wide(600);
  };
  C.act.rdResolve = (el) => {
    const d = C.RECON.diffs.find((x) => x.id === el.dataset.id);
    if (d.status !== 'OPEN' || !C.can('queue:handle')) return;
    const opt = picked();
    const note = readNote();
    if (note.length < 4) return err('处理说明至少 4 个字');
    const m = target(d.no);
    const label = RD_OPTS.find((o) => o[0] === opt)[1];
    if (opt === 'biz') {
      if (d.biz === 'ql') {
        const b = m.batches.find((x) => x.id === 'PB-0398');
        if (!b || b.remaining < 120) return err('批次 PB-0398 剩余不足 120 分（已被使用），需转人工调整');
        b.remaining -= 120;
        if (!b.remaining) b.status = 'DEPLETED';
        m.ledger.push({ at: C.NOW, type: 'REVOKE', b: 'ql', ref: d.order, delta: -120, alloc: 'PB-0398:120' });
        m.ver += 1;
        C.emit('points.changed', m, `${d.id} 撤回 120 分`);
      } else {
        const p = m.periods.find((x) => x.status === 'ACTIVE');
        if (!p) return err('该会员已无生效卡期，不能补记权益使用');
        p.usage.unshift({ b: 'sx', order: d.order, saved: 200, rev: 0, at: '2026-11-06' });
        m.ver += 1;
        C.emit('member.card.changed', m, `${d.id} 补记权益使用`);
      }
    }
    Object.assign(d, { status: 'RESOLVED', by: `${C.me().name}（${C.me().code}）`, doneAt: C.NOW, label, note });
    C.audit('处理对账差异', `${m.name} · ${m.no}`, `${d.id} ${d.order} · ${label}${opt === 'biz' ? '：' + d.fix : ''} · ${note}`);
    done(`${d.id} 已处理 · ${label}`);
  };

  /* ---------- 身份冲突 ---------- */
  const holdsCard = (m) => m.periods.some((p) => ['ACTIVE', 'PENDING', 'REFUND_LOCKED'].includes(p.status));
  function compareRows(a, b) {
    const g = (x) => x === 1 ? '男' : x === 2 ? '女' : '未填写';
    const rows = [
      ['会员号', a.no, b.no, true], ['姓名', a.name, b.name], ['性别', g(a.gender), g(b.gender)], ['生日', a.birthday || '未填写', b.birthday || '未填写'],
      ['手机号', a.phone, b.phone], ['注册', a.created, b.created], ['来过的业务', a.biz.map((x) => C.BIZ[x].n).join('、'), b.biz.map((x) => C.BIZ[x].n).join('、')],
      ['大会员卡', C.CARD_STATUS[cardState(a).key] ? C.CARD_STATUS[cardState(a).key][0] : '未开通', C.CARD_STATUS[cardState(b).key] ? C.CARD_STATUS[cardState(b).key][0] : '未开通'],
      ['积分余额', `${balance(a)} 分`, `${balance(b)} 分`], ['最近消费', a.last, b.last]
    ];
    return rows.map(([k, x, y, mono]) => `<tr><td class="muted">${k}</td><td class="${mono ? 'mono' : ''}">${E(x)}</td><td class="${mono ? 'mono' : ''}">${E(y)}</td><td>${k === '会员号' || k === '注册' || k === '最近消费' || k === '积分余额' ? '' : x === y ? C.pill('相同', 'amber') : C.pill('不同')}</td></tr>`).join('');
  }
  C.act.icView = (el) => {
    const c = C.CONFLICTS.find((x) => x.id === el.dataset.id);
    const a = C.member(c.a);
    const b = C.member(c.b);
    const canSplit = C.can('identity:create');
    const canMerge = C.can('approve:identity');
    const bothCards = holdsCard(a) && holdsCard(b);
    let action = '';
    if (c.status === 'OPEN') {
      action = `<div class="note warn" style="margin-top:12px">性别、手机号不同，更可能是家人共用一个微信：建议判定为不同人。合并不可撤销，只在本人确认两个号都是自己时使用。</div>
        ${canSplit || canMerge ? `<div class="form" style="margin-top:12px">
          <div class="chips" role="radiogroup" aria-label="处理方式">
            <label class="radio"><input type="radio" name="qOpt" value="split" checked ${canSplit ? '' : 'disabled'}>判定为不同人</label>
            <label class="radio"><input type="radio" name="qOpt" value="merge" ${canMerge && !bothCards ? '' : 'disabled'}>合并为一个会员</label></div>
          <div class="tiny muted">${canMerge ? (bothCards ? '两边都有生效 / 待生效 / 锁定中的年卡，不能合并，需先处理其中一张' : '合并：选择主会员，副会员的身份、积分批次、年卡与消费记录迁入主会员，副会员号保留为别名') : '合并需要 approve:identity（管理员）；当前身份只能判定为不同人'}</div>
          ${canMerge && !bothCards ? `<label>主会员<select id="icPrimary"><option value="${a.no}">${E(a.name)} · ${a.no}（注册更早）</option><option value="${b.no}">${E(b.name)} · ${b.no}</option></select></label>` : ''}
          ${noteField('如：已电话联系，两人为母女，共用微信')}<p id="qErr" class="tiny err" hidden></p></div>` : '<div class="note warn" style="margin-top:12px">当前角色无处理权限（identity:create 或 approve:identity）。</div>'}`;
    }
    C.dialog(`身份冲突 · ${c.id}`,
      `<dl class="kv"><dt>冲突依据</dt><dd>同一 unionId <span class="mono">${c.union}</span> · ${c.at} 发现</dd><dt>来源</dt><dd class="small">${E(c.how)}</dd>
        <dt>状态</dt><dd>${C.pill(...(c.status === 'OPEN' ? Q_STATUS.OPEN : ['已处理', 'green']))}${c.by ? `<div class="tiny muted">${E(c.by)} · ${c.doneAt} · ${E(c.label)} · ${E(c.note)}</div>` : ''}</dd></dl>
       <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th></th><th>会员 A</th><th>会员 B</th><th></th></tr></thead><tbody>${compareRows(a, b)}</tbody></table></div>${action}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${c.status === 'OPEN' && (canSplit || canMerge) ? `<button class="btn primary" data-act="icResolve" data-id="${c.id}">确认处理</button>` : ''}`);
    wide(680);
  };
  C.act.icResolve = (el) => {
    const c = C.CONFLICTS.find((x) => x.id === el.dataset.id);
    if (c.status !== 'OPEN') return;
    const opt = picked();
    const note = readNote();
    if (note.length < 4) return err('处理说明至少 4 个字');
    const who = `${C.me().name}（${C.me().code}）`;
    if (opt === 'split') {
      if (!C.can('identity:create')) return err('当前角色无 identity:create 权限');
      Object.assign(c, { status: 'SPLIT', by: who, doneAt: C.NOW, label: '判定为不同人', note });
      C.audit('处理身份冲突', `${c.a} / ${c.b}`, `${c.id} 判定为不同人；unionId ${c.union} 标记为共享，不再提示 · ${note}`);
      return done('已判定为不同人，两条会员保持独立');
    }
    if (!C.can('approve:identity')) return err('合并需要 approve:identity 权限');
    const pNo = document.getElementById('icPrimary').value;
    const P = C.member(pNo);
    const S = C.member(pNo === c.a ? c.b : c.a);
    if (holdsCard(P) && holdsCard(S)) return err('两边都有生效 / 待生效 / 锁定中的年卡，不能合并');
    const pts = S.batches.filter((b) => b.status === 'ACTIVE' && b.remaining > 0);
    const moved = pts.reduce((s, b) => s + b.remaining, 0);
    pts.forEach((b) => { P.batches.push({ ...b, ref: `${b.ref}（自 ${S.no}）` }); b.remaining = 0; b.status = 'DEPLETED'; });
    if (moved) {
      S.ledger.push({ at: C.NOW, type: 'MIGRATE', b: 'hq', ref: `${S.no} → ${P.no}`, delta: -moved, alloc: pts.map((b) => `${b.id}:${b.amount}`).join(' · ') });
      P.ledger.push({ at: C.NOW, type: 'MIGRATE', b: 'hq', ref: `${S.no} → ${P.no}`, delta: moved });
    }
    P.ids.push(...S.ids);
    P.alias.push(S.no, ...S.alias);
    S.biz.forEach((b) => { if (!P.biz.includes(b)) P.biz.push(b); });
    P.periods.push(...S.periods);
    S.periods = [];
    P.activity = [...P.activity, ...S.activity].sort((x, y) => (x.at < y.at ? 1 : -1));
    P.consents.push(...S.consents);
    if (S.last > P.last) P.last = S.last;
    P.ver += 1;
    S.ver += 1;
    Object.keys(S.snap).forEach((b) => { if (!P.snap[b]) P.snap[b] = { ver: 0, at: '—' }; });
    Object.assign(S, { status: 'MERGED', mergedInto: P.no, mergedAt: C.NOW });
    const rb = C.REBINDS.find((r) => r.no === S.no && r.status === 'PENDING');
    if (rb) Object.assign(rb, { status: 'VOID', doneAt: C.NOW, opinion: `会员已并入 ${P.no}，换绑单失效` });
    const behind = C.emit('member.merged', P, `${S.no} 并入 ${P.no}`);
    Object.assign(c, { status: 'MERGED', by: who, doneAt: C.NOW, label: `合并：${S.no} → ${P.no}`, note });
    C.audit('合并会员', `${P.name} · ${P.no}`, `${c.id} ${S.name}（${S.no}）并入；迁移积分 ${moved} 分、身份 ${S.ids.length} 个${rb ? `；换绑单 ${rb.id} 失效` : ''} · ${note}`);
    done(`已合并到 ${P.name} · 广播 member.merged${behind.length ? `，${behind.join('、')}待补投` : ''}`);
  };

  /* ---------- 页面 ---------- */
  const TABS = [['manual', '人工队列'], ['recon', '对账差异'], ['identity', '身份冲突']];
  const memberCell = (no) => { const m = C.member(no); const t = target(no); return `${E(m.name)}<div class="tiny muted mono">${no}${t !== m ? ` → ${t.no}` : ''}</div>`; };
  function manual() {
    return `<div class="table-wrap"><table><thead><tr><th>工单</th><th>类型</th><th>会员</th><th>业务订单</th><th>摘要</th><th>进入队列</th><th>状态</th><th></th></tr></thead><tbody>
      ${C.QUEUE.map((q) => `<tr class="click" data-act="qView" data-id="${q.id}"><td class="mono">${q.id}</td><td>${KIND[q.kind]}</td><td>${memberCell(q.no)}</td><td>${C.biz(q.biz)}<div class="tiny mono">${q.order}</div></td>
        <td class="wrap">${E(q.sum)}</td><td class="num">${q.at.slice(5)}</td><td>${C.pill(...Q_STATUS[q.status])}</td><td><button class="text-btn">${q.status === 'OPEN' ? '处理 ›' : '查看 ›'}</button></td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted" style="margin-top:10px">进入人工队列的三种情况：开卡实付与报价不符（绝不按其他金额开卡）、积分预占超时且重新预占不足（不允许负余额）、业务端出站任务失败超 24 小时。</p>`;
  }
  function recon() {
    const R = C.RECON;
    const sum = Object.entries(R.totals).map(([b, [t, ok]]) => {
      const open = R.diffs.filter((d) => d.biz === b && d.status === 'OPEN').length;
      const fixed = R.diffs.filter((d) => d.biz === b && d.status !== 'OPEN').length;
      return `<div class="health"><div>${C.biz(b)} <span class="tiny muted" style="margin-left:6px">${t} 单 · 一致 ${ok + fixed}</span></div>${open ? C.pill(`差异 ${open}`, 'red') : C.pill('已对平', 'green')}</div>`;
    }).join('');
    return `<div class="grid-2" style="margin-bottom:16px"><section class="panel"><div class="section-title"><h2>${R.date} 日对账</h2><span class="tiny">${R.ran} 自动运行</span></div>${sum}</section>
      <section class="panel"><div class="section-title"><h2>口径</h2></div><p class="small muted" style="margin:0">CRM 每日调用各业务 <span class="mono">GET /crm/recon?date=</span>，逐单比对积分发放 / 消耗 / 撤回与年卡权益使用；差异写入 recon_diff。这里只记录与修正事实，不做业务间结算。</p></section></div>
      <div class="table-wrap"><table><thead><tr><th>差异</th><th>业务</th><th>会员</th><th>订单</th><th>差异类型</th><th>业务端</th><th>CRM</th><th>状态</th><th></th></tr></thead><tbody>
      ${R.diffs.map((d) => `<tr class="click" data-act="rdView" data-id="${d.id}"><td class="mono">${d.id}</td><td>${C.biz(d.biz)}</td><td>${memberCell(d.no)}</td><td class="mono tiny">${d.order}</td><td>${E(d.kind)}</td>
        <td class="wrap small">${E(d.bizSide)}</td><td class="wrap small">${E(d.crmSide)}</td><td>${C.pill(...Q_STATUS[d.status])}</td><td><button class="text-btn">${d.status === 'OPEN' ? '处理 ›' : '查看 ›'}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function identity() {
    const st = (c) => c.status === 'OPEN' ? C.pill('待处理', 'amber') : C.pill(c.status === 'SPLIT' ? '判定为不同人' : '已合并', 'green');
    return `<div class="table-wrap"><table><thead><tr><th>工单</th><th>冲突依据</th><th>会员 A</th><th>会员 B</th><th>发现时间</th><th>状态</th><th></th></tr></thead><tbody>
      ${C.CONFLICTS.map((c) => `<tr class="click" data-act="icView" data-id="${c.id}"><td class="mono">${c.id}</td><td>同一 unionId<div class="tiny mono">${c.union}</div></td><td>${memberCell(c.a)}</td><td>${memberCell(c.b)}</td>
        <td class="num">${c.at.slice(5)}</td><td>${st(c)}</td><td><button class="text-btn">${c.status === 'OPEN' ? '处理 ›' : '查看 ›'}</button></td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted" style="margin-top:10px">身份以手机号归属为准；unionId、姓名、生日相同都不自动合并。判定为不同人需 identity:create（客服 / 管理员），合并需 approve:identity（管理员）。</p>`;
  }
  C.pages.queue = {
    title: '异常队列',
    render([tab = 'manual']) {
      if (!TABS.some((t) => t[0] === tab)) tab = 'manual';
      const t = ([k, label]) => { const n = C.queueOpen(k); return `<button class="tab ${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}" data-act="nav" data-key="queue/${k}">${label}${n ? ` <span class="badge">${n}</span>` : ''}</button>`; };
      const perm = tab === 'identity' ? (C.can('identity:create') || C.can('approve:identity') ? '当前身份可处理' : '当前身份只读') : C.can('queue:handle') ? '当前身份可处理' : '当前身份只读（处理需 queue:handle）';
      return `
        <div class="page-head"><div><h1>异常队列</h1><p>系统不能自动判定的情况都停在这里，由人确认后再执行；处理前按当时数据重新校验，处理说明必填并写审计。</p></div><span class="tiny muted">${perm}</span></div>
        <div class="tabs" role="tablist">${TABS.map(t).join('')}</div>
        ${tab === 'manual' ? manual() : tab === 'recon' ? recon() : identity()}`;
    }
  };

  C.NAV.forEach((n) => (n.items || []).forEach((i) => { if (i.key === 'queue') i.badge = () => ['manual', 'recon', 'identity'].reduce((s, k) => s + C.queueOpen(k), 0); }));
})();
