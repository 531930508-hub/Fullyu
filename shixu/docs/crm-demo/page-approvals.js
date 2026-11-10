/* Full愈 CRM demo · 审批中心（退卡 / 换绑 / 积分调整 / 明文导出）+ 审计日志
 * 退卡（设计 §5.5）：业务端 refund-quote → 非全额生成审批单 → 财务审批（可下调不可上调、审批人 ≠ 发起人）
 *   → 业务端 refund/lock（权益立即停用）→ 渠道退款 → confirm（≤ 批准额）或 abort（解锁）；结果未知先查渠道，不盲调 confirm。
 * 换绑（§4.4）：只能客服在 CRM 发起，另一人审批，审批时重新校验新号未被占用；完成后广播 member.profile.changed。
 * 明文导出（§16.1，待经营决策）：默认脱敏；明文需审批，批准后仅发起人可下载一次。
 * 审计日志：只追加，没有编辑与删除入口。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const { refundEstimate, saved, cardState } = C.calc;
  const me = () => ({ code: C.me().code, name: C.me().name });
  const whoText = (w) => `${w.name}（${w.code}）`;
  const API = { sx: '时叙后端（签名 API）', ql: '轻疗后端（签名 API）', zc: '在场后端（签名 API）' };
  const sysAudit = (who, act, obj, detail) => C.AUDIT.unshift({ at: C.NOW, who, act, obj, detail: detail || '' });
  const yuanIn = (c) => (c / 100).toFixed(c % 100 ? 2 : 0);
  const err = (id, t) => { const e = document.getElementById(id); e.textContent = t; e.hidden = false; };
  const wide = (w) => { document.getElementById('dlg').style.width = `min(${w}px, calc(100vw - 28px))`; };

  /* ---------- 种子：与 data.js 已埋数据对应 ---------- */
  C.REFUNDS = [
    { id: 'RF-20261107-0002', no: 'FY-2608-002871', card: 'FYC-26-000204', pno: 1, at: '2026-11-07 13:40', quoted: 69300,
      by: { code: 'CRM_FINANCE', name: '王宁' }, channel: '总部代发起（客服电话受理，退款仍走时叙原渠道）', reason: '顾客工作调动离开本市', status: 'PENDING', log: [] },
    { id: 'RF-20261107-0001', no: 'FY-2607-001204', card: 'FYC-26-000117', pno: 1, at: '2026-11-07 10:12', quoted: 57100,
      by: { code: 'ZC_STORE', name: '在场 · 吴迪（门店）' }, channel: '在场后台发起', reason: '课程时间与工作冲突，顾客申请退卡', status: 'PENDING', log: [] },
    { id: 'RF-20261103-0001', no: 'FY-2609-003317', card: 'FYC-26-000361', pno: 1, at: '2026-11-03 09:20', quoted: 69900, full: true, approved: 69900, prev: 'ACTIVE',
      by: { code: 'SX_STORE', name: '时叙 · 静安店' }, channel: '时叙后台发起', reason: '开卡后改变主意', status: 'LOCKED', approver: '免审批（7 天内且未使用权益）',
      log: [{ at: '2026-11-03 09:20', t: '业务端 refund-quote：第 1 天，未使用权益 → 全额 ¥699，无需审批' }, { at: '2026-11-03 09:21', t: '业务端 refund/lock：卡期锁定，三端权益停用' }] }
  ];
  C.REBINDS = [
    { id: 'RB-20261107-0001', no: 'FY-2503-000431', from: '13755125512', to: '13755125588', at: '2026-11-07 14:05',
      by: { code: 'CRM_CS', name: '赵一' }, reason: '旧号已停机；已核验身份证并回拨新号确认', status: 'PENDING' }
  ];
  C.EXPORTS = [
    { id: 'EX-20261107-0001', at: '2026-11-07 12:30', by: { code: 'CRM_OPS', name: '李沐' }, scope: '人群：本月生日', nos: ['FY-2605-000927'],
      purpose: '11 月生日关怀短信，导入短信平台后 48 小时内删除', status: 'PENDING' }
  ];
  C.AUDIT.push(
    { at: '2026-11-07 14:05', who: '赵一（CRM_CS）', act: '发起换绑手机号', obj: '周以安 · FY-2503-000431', detail: 'RB-20261107-0001 137****5512 → 137****5588' },
    { at: '2026-11-07 13:40', who: '王宁（CRM_FINANCE）', act: '发起退卡', obj: '何知夏 · FY-2608-002871', detail: 'RF-20261107-0002 建议 ¥693 · 总部代发起' },
    { at: '2026-11-07 12:30', who: '李沐（CRM_OPS）', act: '申请明文导出', obj: '人群：本月生日 · 1 人', detail: 'EX-20261107-0001' },
    { at: '2026-11-07 11:20', who: '李沐（CRM_OPS）', act: '发起批量积分调整', obj: '3 人', detail: 'ADJ-20261107-0002 合计 +600 分 · 活动补发' },
    { at: '2026-11-07 10:12', who: API.zc, act: '发起退卡', obj: '苏晚 · FY-2607-001204', detail: 'RF-20261107-0001 建议 ¥571 · 门店 吴迪' },
    { at: '2026-11-07 10:05', who: '赵一（CRM_CS）', act: '发起积分调整', obj: '钟未 · FY-2512-000012', detail: 'ADJ-20261107-0001 +800 分 · 超过 500 分待审批' },
    { at: '2026-11-03 09:21', who: API.sx, act: '退卡锁定', obj: '陈一禾 · FY-2609-003317', detail: 'RF-20261103-0001 7 天全额，免审批' }
  );
  C.AUDIT.sort((a, b) => (a.at < b.at ? 1 : -1));

  /* ---------- 退卡 ---------- */
  const RF_STATUS = { PENDING: ['待审批', 'amber'], APPROVED: ['已批准 · 待锁卡', 'lilac'], LOCKED: ['已锁卡 · 待渠道退款', 'amber'], REFUNDED: ['已退款', 'green'], ABORTED: ['退款失败 · 已解锁', 'red'], REJECTED: ['已驳回', 'red'] };
  const rfPeriod = (r) => C.member(r.no).periods.find((p) => p.card === r.card && p.no === r.pno);
  C.refundFor = (m, p) => C.REFUNDS.find((r) => r.no === m.no && r.card === p.card && r.pno === p.no && !['REJECTED', 'ABORTED'].includes(r.status));
  C.refundStatus = (r) => RF_STATUS[r.status];
  function rfBlock(r) {
    if (r.status !== 'PENDING') return '该退卡单已处理';
    if (!C.can('approve:money')) return '当前角色无审批权限（approve:money）';
    if (r.by.code === C.me().code) return '审批人不能是发起人';
    const m = C.member(r.no);
    const p = rfPeriod(r);
    if (!['ACTIVE', 'PENDING'].includes(p.status)) return `卡期当前为「${C.CARD_STATUS[p.status][0]}」，不能退卡`;
    if (!refundEstimate(m, p).isLast) return '该卡期已不是最后一期，只能先退最后一期';
    return '';
  }
  C.act.rfView = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    const m = C.member(r.no);
    const p = rfPeriod(r);
    const est = refundEstimate(m, p);
    const block = rfBlock(r);
    const sold = C.BIZ[p.sold].n;
    let action = '';
    if (r.status === 'PENDING') {
      action = block ? `<div class="note warn" style="margin-top:12px">${block}</div>` : `
        <div class="form" style="margin-top:14px">
          ${r.quoted !== est.suggested ? `<div class="note warn">申请时建议 ${C.yuan(r.quoted)}，期间有新的权益使用，当前建议 ${C.yuan(est.suggested)}，以当前为准。</div>` : ''}
          <label>批准退款额（元，0 – ${yuanIn(est.suggested)}）<input id="rfAmt" inputmode="decimal" value="${yuanIn(est.suggested)}"></label>
          <label>审批意见（下调或驳回必填）<input id="rfOp" maxlength="60"></label>
          <p id="rfErr" class="tiny err" hidden></p></div>`;
    } else if (r.status === 'APPROVED') {
      action = `<div class="note" style="margin-top:12px">已批准 ${C.yuan(r.approved)}。等待${sold}调用 <span class="mono">refund/lock</span> 锁卡，锁卡后才发起渠道退款。</div>
        <div class="sim"><span class="tiny muted">演示：模拟${sold}后端回调</span><button class="btn" data-act="rfLock" data-id="${r.id}">业务端锁卡</button></div>`;
    } else if (r.status === 'LOCKED') {
      action = `${r.unknown ? `<div class="note bad" style="margin-top:12px">渠道结果未知：${sold}须先向支付渠道查询，再决定 confirm 或 abort；CRM 不自动确认，卡期保持锁定。</div>` : `<div class="note" style="margin-top:12px">卡期已锁定，三端权益停用。等待${sold}渠道退款结果。</div>`}
        <div class="sim"><span class="tiny muted">演示：模拟${sold}后端回调</span>
          <label class="tiny muted">实退（元，≤ ${yuanIn(r.approved)}）<input id="rfDone" inputmode="decimal" value="${yuanIn(r.approved)}" style="width:96px"></label>
          <button class="btn primary" data-act="rfConfirm" data-id="${r.id}">${r.unknown ? '查询为已退款 → confirm' : '退款成功 → confirm'}</button>
          <button class="btn danger" data-act="rfAbort" data-id="${r.id}">${r.unknown ? '查询为未退款 → abort' : '明确失败 → abort'}</button>
          ${r.unknown ? '' : `<button class="btn" data-act="rfUnknown" data-id="${r.id}">结果未知</button>`}</div>
        <p id="rfErr" class="tiny err" hidden></p>`;
    }
    C.dialog(`退卡单 ${r.id}`,
      `<dl class="kv"><dt>会员</dt><dd>${E(m.name)} · <button class="text-btn mono" data-act="rfGoMember" data-no="${m.no}">${m.no} ›</button></dd>
        <dt>卡期</dt><dd><span class="mono">${p.card} · 第 ${p.no} 期</span> ${C.pill(...C.CARD_STATUS[p.status])}</dd>
        <dt>售卖业务</dt><dd>${C.biz(p.sold)} <span class="mono tiny">${p.order}</span> · 实付 ${C.yuan(p.paid)}</dd>
        <dt>测算</dt><dd>支付后第 ${est.day} 天 · 已享优惠 ${C.yuan(est.used)} · ${r.full ? '7 天全额退' : `建议 = ${C.yuan(p.paid)} − ${C.yuan(est.used)} = <b>${C.yuan(est.suggested)}</b>`}</dd>
        <dt>发起</dt><dd>${E(r.by.name)} · ${r.at}<div class="tiny muted">${E(r.channel)} · ${E(r.reason)}</div></dd>
        <dt>状态</dt><dd>${C.pill(...RF_STATUS[r.status])}${r.approver ? `<div class="tiny muted">${E(r.approver)}${r.approved != null ? ` · 批准 ${C.yuan(r.approved)}` : ''}${r.opinion ? ' · ' + E(r.opinion) : ''}${r.refunded != null ? ` · 实退 ${C.yuan(r.refunded)}` : ''}</div>` : ''}</dd></dl>
       ${r.log.length ? `<div class="eyebrow" style="margin:14px 0 6px">过程</div><ul class="steps">${r.log.map((x) => `<li><span class="num tiny muted">${x.at}</span>${E(x.t)}</li>`).join('')}</ul>` : ''}
       ${action}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${r.status === 'PENDING' ? `<button class="btn danger" data-act="rfReject" data-id="${r.id}" ${block ? 'disabled' : ''}>驳回</button><button class="btn primary" data-act="rfApprove" data-id="${r.id}" ${block ? 'disabled' : ''}>批准</button>` : ''}`);
    wide(600);
  };
  C.act.rfGoMember = (el) => { C.closeDialog(); C.go(`#/member/${el.dataset.no}/card`); };
  const rfDone = (r, msg) => { C.closeDialog(); C.render(); C.toast(msg); };
  C.act.rfApprove = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    const block = rfBlock(r);
    if (block) return C.toast(block);
    const est = refundEstimate(C.member(r.no), rfPeriod(r));
    const raw = document.getElementById('rfAmt').value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return err('rfErr', '金额格式：最多两位小数的非负数');
    const cents = Math.round(Number(raw) * 100);
    if (cents > est.suggested) return err('rfErr', `不能超过建议额 ${C.yuan(est.suggested)}（审批只能下调）`);
    const op = document.getElementById('rfOp').value.trim();
    if (cents < est.suggested && !op) return err('rfErr', '下调金额需填写审批意见');
    Object.assign(r, { status: 'APPROVED', approved: cents, approver: whoText(me()), opinion: op, doneAt: C.NOW });
    r.log.push({ at: C.NOW, t: `${whoText(me())} 批准 ${C.yuan(cents)}${cents < est.suggested ? `（建议 ${C.yuan(est.suggested)}，下调）` : ''}` });
    const m = C.member(r.no);
    C.audit('审批通过退卡', `${m.name} · ${m.no}`, `${r.id} 批准 ${C.yuan(cents)} / 建议 ${C.yuan(est.suggested)}${op ? ' · ' + op : ''}`);
    rfDone(r, `${r.id} 已批准 ${C.yuan(cents)}，等待业务端锁卡`);
  };
  C.act.rfReject = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    const block = rfBlock(r);
    if (block) return C.toast(block);
    const op = document.getElementById('rfOp').value.trim();
    if (!op) return err('rfErr', '驳回需填写审批意见');
    Object.assign(r, { status: 'REJECTED', approver: whoText(me()), opinion: op, doneAt: C.NOW });
    r.log.push({ at: C.NOW, t: `${whoText(me())} 驳回：${op}` });
    const m = C.member(r.no);
    C.audit('驳回退卡', `${m.name} · ${m.no}`, `${r.id} · ${op}`);
    rfDone(r, `已驳回 ${r.id}，卡期不变`);
  };
  /* 以下为模拟业务端回调：真实环境由售卖业务后端经签名 API 调用 */
  C.act.rfLock = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    if (r.status !== 'APPROVED') return C.toast('只有已批准的退卡单可以锁卡');
    const p = rfPeriod(r);
    const m = C.member(r.no);
    Object.assign(r, { status: 'LOCKED', prev: p.status });
    p.status = 'REFUND_LOCKED';
    r.log.push({ at: C.NOW, t: '业务端 refund/lock：卡期锁定，三端权益立即停用' });
    sysAudit(API[p.sold], '退卡锁定', `${m.name} · ${m.no}`, `${r.id} · 推送 member.card.changed`);
    m.ver += 1;
    C.emit('member.card.changed', m, `${r.id} 退卡锁定`);
    rfDone(r, '已锁卡 · 三端权益停用');
  };
  C.act.rfUnknown = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    if (r.status !== 'LOCKED') return;
    r.unknown = true;
    r.log.push({ at: C.NOW, t: '渠道退款超时，结果未知：保持锁定，等待业务端查询渠道' });
    sysAudit(API[rfPeriod(r).sold], '退款结果未知', `${C.member(r.no).name} · ${r.no}`, `${r.id} · 未调用 confirm`);
    C.act.rfView(el);
  };
  C.act.rfConfirm = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    if (r.status !== 'LOCKED') return C.toast('只有已锁卡的退卡单可以确认');
    const raw = document.getElementById('rfDone').value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return err('rfErr', '金额格式：最多两位小数的非负数');
    const cents = Math.round(Number(raw) * 100);
    if (cents > r.approved) return err('rfErr', `confirm 被拒：实退不得超过批准额 ${C.yuan(r.approved)}`);
    const p = rfPeriod(r);
    const m = C.member(r.no);
    Object.assign(r, { status: 'REFUNDED', refunded: cents, unknown: false });
    Object.assign(p, { status: 'REFUNDED', refunded: cents });
    r.log.push({ at: C.NOW, t: `业务端 refund/confirm：实退 ${C.yuan(cents)}，卡期已退` });
    const dice = m.dice && !m.dice.guest && cardState(m).key === 'NONE' ? '；未用骰子收回' : '';
    sysAudit(API[p.sold], '退卡完成', `${m.name} · ${m.no}`, `${r.id} 实退 ${C.yuan(cents)}${dice}`);
    m.ver += 1;
    C.emit('member.card.changed', m, `${r.id} 已退款`);
    rfDone(r, `${r.id} 已退款 ${C.yuan(cents)}`);
  };
  C.act.rfAbort = (el) => {
    const r = C.REFUNDS.find((x) => x.id === el.dataset.id);
    if (r.status !== 'LOCKED') return;
    const p = rfPeriod(r);
    const m = C.member(r.no);
    p.status = r.prev || 'ACTIVE';
    Object.assign(r, { status: 'ABORTED', unknown: false });
    r.log.push({ at: C.NOW, t: `业务端 refund/abort：渠道明确未退款，卡期恢复「${C.CARD_STATUS[p.status][0]}」` });
    sysAudit(API[p.sold], '退卡中止', `${m.name} · ${m.no}`, `${r.id} · 解锁`);
    m.ver += 1;
    C.emit('member.card.changed', m, `${r.id} 解锁`);
    rfDone(r, '已解锁，卡期恢复');
  };

  /* ---------- 换绑手机号 ---------- */
  const RB_STATUS = { PENDING: ['待审批', 'amber'], DONE: ['已换绑', 'green'], REJECTED: ['已驳回', 'red'], VOID: ['已失效', ''] };
  const phoneOwner = (ph, self) => C.MEMBERS.find((x) => x.phone === ph && x.no !== self);
  C.pendingRebind = (no) => C.REBINDS.find((x) => x.no === no && x.status === 'PENDING');
  C.act.rebind = (el) => {
    const m = C.member(el.dataset.no);
    if (!C.can('identity:create')) return C.toast('当前角色无 identity:create 权限');
    const pend = C.pendingRebind(m.no);
    if (pend) return C.toast(`已有待审批的换绑单 ${pend.id}`);
    C.dialog(`换绑手机号 · ${E(m.name)}`,
      `<div class="form">
        <div class="note">当前手机号 <b class="num">${m.phone}</b>。换绑需另一位有 approve:identity 权限的同事审批；完成后三端快照随 member.profile.changed 更新。</div>
        <label>新手机号<input id="rbTo" inputmode="numeric" maxlength="11" placeholder="11 位手机号"></label>
        <label>核验方式与原因<textarea id="rbWhy" rows="2" maxlength="80" placeholder="必填：如已核验身份证、回拨新号确认"></textarea></label>
        <p id="rbErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="rebindSubmit" data-no="${m.no}">提交审批</button>`);
  };
  C.act.rebindSubmit = (el) => {
    const m = C.member(el.dataset.no);
    const to = document.getElementById('rbTo').value.trim();
    const why = document.getElementById('rbWhy').value.trim();
    if (!/^1\d{10}$/.test(to)) return err('rbErr', '请输入 11 位手机号');
    if (to === m.phone) return err('rbErr', '新号与当前号相同');
    const owner = phoneOwner(to, m.no);
    if (owner) return err('rbErr', `该号码已属于会员 ${owner.no}，不能直接换绑；如为同一人请走合并流程`);
    if (C.pendingRebind(m.no)) return err('rbErr', '已有待审批的换绑单');
    if (why.length < 4) return err('rbErr', '请填写核验方式与原因（至少 4 个字）');
    const rec = { id: `RB-${C.TODAY.replace(/-/g, '')}-${String(C.REBINDS.length + 1).padStart(4, '0')}`, no: m.no, from: m.phone, to, at: C.NOW, by: me(), reason: why, status: 'PENDING' };
    C.REBINDS.unshift(rec);
    C.audit('发起换绑手机号', `${m.name} · ${m.no}`, `${rec.id} ${C.mask(m.phone)} → ${C.mask(to)}`);
    C.closeDialog();
    C.render();
    C.toast(`已提交 ${rec.id}，待另一人审批`);
  };
  function rbBlock(r) {
    if (r.status !== 'PENDING') return '该换绑单已处理';
    if (!C.can('approve:identity')) return '当前角色无审批权限（approve:identity）';
    if (r.by.code === C.me().code) return '审批人不能是发起人';
    return '';
  }
  C.act.rbView = (el) => {
    const r = C.REBINDS.find((x) => x.id === el.dataset.id);
    const m = C.member(r.no);
    const block = rbBlock(r);
    const owner = phoneOwner(r.to, r.no);
    C.dialog(`换绑单 ${r.id}`,
      `<dl class="kv"><dt>会员</dt><dd>${E(m.name)} · <span class="mono">${m.no}</span></dd>
        <dt>手机号</dt><dd class="num">${r.from} → <b>${r.to}</b></dd>
        <dt>发起</dt><dd>${E(r.by.name)}（${r.by.code}）· ${r.at}<div class="tiny muted">${E(r.reason)}</div></dd>
        <dt>状态</dt><dd>${C.pill(...RB_STATUS[r.status])}${r.approver ? `<div class="tiny muted">${E(r.approver)} · ${r.doneAt}${r.opinion ? ' · ' + E(r.opinion) : ''}</div>` : ''}</dd></dl>
       ${r.status === 'PENDING' ? `${owner ? `<div class="note bad" style="margin-top:12px">新号已被会员 ${owner.no} 占用，整单不执行；请驳回后走合并流程。</div>` : ''}
         ${block ? `<div class="note warn" style="margin-top:12px">${block}</div>` : `<label class="small muted" style="display:block;margin-top:12px">审批意见（驳回必填）<input id="rbOp" maxlength="60" style="display:block;width:100%;margin-top:6px"></label><p id="rbErr" class="tiny err" hidden></p>`}` : ''}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${r.status === 'PENDING' ? `<button class="btn danger" data-act="rbReject" data-id="${r.id}" ${block ? 'disabled' : ''}>驳回</button><button class="btn primary" data-act="rbApprove" data-id="${r.id}" ${block || owner ? 'disabled' : ''}>通过并换绑</button>` : ''}`);
    wide(540);
  };
  C.act.rbApprove = (el) => {
    const r = C.REBINDS.find((x) => x.id === el.dataset.id);
    const block = rbBlock(r);
    if (block) return C.toast(block);
    const m = C.member(r.no);
    if (phoneOwner(r.to, r.no)) return err('rbErr', '新号已被占用，整单不执行');
    if (m.phone !== r.from) return err('rbErr', '会员手机号已变化，本单失效，请重新发起');
    m.phone = r.to;
    m.ver += 1;
    C.emit('member.profile.changed', m, `${r.id} 换绑手机号`);
    Object.assign(r, { status: 'DONE', approver: whoText(me()), doneAt: C.NOW, opinion: (document.getElementById('rbOp') || {}).value || '' });
    C.audit('审批通过换绑', `${m.name} · ${m.no}`, `${r.id} ${C.mask(r.from)} → ${C.mask(r.to)} · 资料 v${m.ver}`);
    C.closeDialog();
    C.render();
    const behind = Object.entries(m.snap).filter(([, s]) => s.stale).map(([b]) => C.BIZ[b].n);
    C.toast(`已换绑 · 广播 member.profile.changed${behind.length ? `，${behind.join('、')}待补投` : ''}`);
  };
  C.act.rbReject = (el) => {
    const r = C.REBINDS.find((x) => x.id === el.dataset.id);
    const block = rbBlock(r);
    if (block) return C.toast(block);
    const op = document.getElementById('rbOp').value.trim();
    if (!op) return err('rbErr', '驳回需填写审批意见');
    Object.assign(r, { status: 'REJECTED', approver: whoText(me()), doneAt: C.NOW, opinion: op });
    C.audit('驳回换绑', `${C.member(r.no).name} · ${r.no}`, `${r.id} · ${op}`);
    C.closeDialog();
    C.render();
    C.toast(`已驳回 ${r.id}`);
  };

  /* ---------- 导出：默认脱敏；明文需审批，仅发起人下载一次 ---------- */
  const EX_STATUS = { PENDING: ['待审批', 'amber'], APPROVED: ['已批准 · 待下载', 'lilac'], USED: ['已下载', 'green'], REJECTED: ['已驳回', 'red'] };
  function csv(list, plain) {
    const head = ['会员号', '姓名', '称呼', '手机号', '来过的业务', '大会员卡', '积分'];
    const card = (m) => { const k = cardState(m).key; return k === 'NONE' ? '未开通' : C.CARD_STATUS[k][0]; };
    const rows = list.map((m) => [m.no, m.name, m.call || '', plain ? m.phone : C.mask(m.phone), m.biz.map((b) => C.BIZ[b].n).join('/'), card(m), C.calc.balance(m)]);
    return '\ufeff' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  C.lastExport = null;
  const scopeText = () => {
    const L = C.state.list;
    const parts = [];
    if (L.q) parts.push(`关键词「${L.q}」`);
    if (L.biz !== 'all') parts.push(C.BIZ[L.biz].n);
    if (L.card !== 'all') parts.push(L.card === 'NONE' ? '未开通' : C.CARD_STATUS[L.card][0]);
    if (L.seg && L.seg !== 'all') parts.push(`人群：${C.SEGMENT_NAME(L.seg)}`);
    return parts.length ? parts.join(' · ') : '全部会员';
  };
  C.act.exportMasked = () => {
    const list = C.memberFiltered();
    if (!list.length) return C.toast('当前筛选没有会员，无需导出');
    const text = csv(list, false);
    C.lastExport = text;
    download(`crm-members-masked-${C.TODAY.replace(/-/g, '')}.csv`, text);
    C.audit('导出会员（脱敏）', `${scopeText()} · ${list.length} 人`, '手机号 前 3 后 4');
    C.toast(`已导出 ${list.length} 人 · 手机号脱敏`);
  };
  C.act.exportPlainReq = () => {
    const list = C.memberFiltered();
    if (!list.length) return C.toast('当前筛选没有会员');
    C.dialog('申请明文导出',
      `<div class="form"><div class="note warn">明文导出是否允许仍待经营决策；demo 按「需审批、仅发起人下载一次」演示。</div>
        <dl class="kv"><dt>范围</dt><dd>${E(scopeText())} · <b>${list.length}</b> 人</dd><dt>字段</dt><dd>会员号、姓名、称呼、完整手机号、业务、卡状态、积分</dd></dl>
        <label>用途与保管期限<textarea id="exWhy" rows="2" maxlength="80" placeholder="必填：如短信平台导入，48 小时内删除"></textarea></label>
        <p id="exErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="exportPlainSubmit">提交审批</button>`);
  };
  C.act.exportPlainSubmit = () => {
    const why = document.getElementById('exWhy').value.trim();
    if (why.length < 4) return err('exErr', '请填写用途与保管期限（至少 4 个字）');
    const list = C.memberFiltered();
    const rec = { id: `EX-${C.TODAY.replace(/-/g, '')}-${String(C.EXPORTS.length + 1).padStart(4, '0')}`, at: C.NOW, by: me(), scope: scopeText(), nos: list.map((m) => m.no), purpose: why, status: 'PENDING' };
    C.EXPORTS.unshift(rec);
    C.audit('申请明文导出', `${rec.scope} · ${rec.nos.length} 人`, rec.id);
    C.closeDialog();
    C.render();
    C.toast(`已提交 ${rec.id}，待另一人审批`);
  };
  function exBlock(r) {
    if (r.status !== 'PENDING') return '该导出单已处理';
    if (!C.can('approve:identity')) return '当前角色无审批权限（approve:identity）';
    if (r.by.code === C.me().code) return '审批人不能是发起人';
    return '';
  }
  C.act.exView = (el) => {
    const r = C.EXPORTS.find((x) => x.id === el.dataset.id);
    const block = exBlock(r);
    const mine = r.by.code === C.me().code;
    C.dialog(`明文导出 ${r.id}`,
      `<dl class="kv"><dt>范围</dt><dd>${E(r.scope)} · ${r.nos.length} 人</dd><dt>用途</dt><dd>${E(r.purpose)}</dd>
        <dt>发起</dt><dd>${E(r.by.name)}（${r.by.code}）· ${r.at}</dd>
        <dt>状态</dt><dd>${C.pill(...EX_STATUS[r.status])}${r.approver ? `<div class="tiny muted">${E(r.approver)} · ${r.doneAt}${r.opinion ? ' · ' + E(r.opinion) : ''}</div>` : ''}${r.usedAt ? `<div class="tiny muted">下载于 ${r.usedAt}</div>` : ''}</dd></dl>
       ${r.status === 'PENDING' ? (block ? `<div class="note warn" style="margin-top:12px">${block}</div>` : `<label class="small muted" style="display:block;margin-top:12px">审批意见（驳回必填）<input id="exOp" maxlength="60" style="display:block;width:100%;margin-top:6px"></label><p id="exErr" class="tiny err" hidden></p>`) : ''}
       ${r.status === 'APPROVED' ? `<div class="note ${mine ? 'ok' : ''}" style="margin-top:12px">${mine ? '批准后仅可下载一次，下载即记审计。' : `仅发起人 ${E(r.by.name)} 可下载。`}</div>` : ''}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${r.status === 'PENDING' ? `<button class="btn danger" data-act="exReject" data-id="${r.id}" ${block ? 'disabled' : ''}>驳回</button><button class="btn primary" data-act="exApprove" data-id="${r.id}" ${block ? 'disabled' : ''}>批准</button>` : ''}${r.status === 'APPROVED' && mine ? `<button class="btn primary" data-act="exDownload" data-id="${r.id}">下载明文 CSV</button>` : ''}`);
    wide(540);
  };
  C.act.exApprove = (el) => {
    const r = C.EXPORTS.find((x) => x.id === el.dataset.id);
    const block = exBlock(r);
    if (block) return C.toast(block);
    Object.assign(r, { status: 'APPROVED', approver: whoText(me()), doneAt: C.NOW, opinion: document.getElementById('exOp').value.trim() });
    C.audit('审批通过明文导出', `${r.scope} · ${r.nos.length} 人`, `${r.id} · 发起人 ${r.by.name}`);
    C.closeDialog();
    C.render();
    C.toast(`${r.id} 已批准，发起人可下载一次`);
  };
  C.act.exReject = (el) => {
    const r = C.EXPORTS.find((x) => x.id === el.dataset.id);
    const block = exBlock(r);
    if (block) return C.toast(block);
    const op = document.getElementById('exOp').value.trim();
    if (!op) return err('exErr', '驳回需填写审批意见');
    Object.assign(r, { status: 'REJECTED', approver: whoText(me()), doneAt: C.NOW, opinion: op });
    C.audit('驳回明文导出', r.scope, `${r.id} · ${op}`);
    C.closeDialog();
    C.render();
    C.toast(`已驳回 ${r.id}`);
  };
  C.act.exDownload = (el) => {
    const r = C.EXPORTS.find((x) => x.id === el.dataset.id);
    if (r.status !== 'APPROVED') return C.toast('该导出单不可下载');
    if (r.by.code !== C.me().code) return C.toast('仅发起人可下载');
    const text = csv(r.nos.map(C.member), true);
    C.lastExport = text;
    download(`crm-members-plain-${r.id}.csv`, text);
    Object.assign(r, { status: 'USED', usedAt: C.NOW });
    C.audit('下载明文导出', `${r.scope} · ${r.nos.length} 人`, `${r.id} · 含完整手机号`);
    C.closeDialog();
    C.render();
    C.toast('已下载 · 该单不可再次下载');
  };

  /* ---------- 审批中心 ---------- */
  const ADJ_STATUS = { PENDING: ['待审批', 'amber'], DONE: ['已入账', 'green'], REJECTED: ['已驳回', 'red'] };
  const mName = (no) => { const m = C.member(no); return `${E(m.name)}<div class="mono tiny muted">${m.no}</div>`; };
  function items() {
    const rf = C.REFUNDS.map((r) => { const p = rfPeriod(r); return {
      id: r.id, type: 'refund', label: '退卡', who: r.by, at: r.at, st: RF_STATUS[r.status], act: 'rfView', block: r.status === 'PENDING' ? rfBlock(r) : 'x',
      phase: r.status === 'PENDING' ? 'pending' : ['APPROVED', 'LOCKED'].includes(r.status) ? 'open' : 'done',
      member: mName(r.no), sum: `${C.biz(p.sold)} ${r.full ? `7 天全额 ${C.yuan(p.paid)}` : r.approved != null ? `批准 ${C.yuan(r.approved)}` : `建议 ${C.yuan(refundEstimate(C.member(r.no), p).suggested)}`}` }; });
    const rb = C.REBINDS.map((r) => ({
      id: r.id, type: 'rebind', label: '换绑手机号', who: r.by, at: r.at, st: RB_STATUS[r.status], act: 'rbView', block: r.status === 'PENDING' ? rbBlock(r) : 'x',
      phase: r.status === 'PENDING' ? 'pending' : 'done', member: mName(r.no), sum: `<span class="num">${C.mask(r.from)} → ${C.mask(r.to)}</span>` }));
    const adj = C.ADJUSTS.map((a) => ({
      id: a.id, type: 'adjust', label: '积分调整', who: a.by, at: a.at, st: ADJ_STATUS[a.status], act: 'adjView',
      block: a.status !== 'PENDING' ? 'x' : !C.can('approve:money') ? 'p' : a.by.code === C.me().code ? 's' : '',
      phase: a.status === 'PENDING' ? 'pending' : 'done',
      member: a.lines.length === 1 ? mName(a.lines[0].no) : `${E(C.member(a.lines[0].no).name)} 等 ${a.lines.length} 人`,
      sum: `${a.kind === 'batch' ? '批量' : '单笔'} ${a.lines.reduce((s, l) => s + l.delta, 0) > 0 ? '+' : ''}${C.n(a.lines.reduce((s, l) => s + l.delta, 0))} 分 · ${E(a.reason)}` }));
    const ex = C.EXPORTS.map((r) => ({
      id: r.id, type: 'export', label: '明文导出', who: r.by, at: r.at, st: EX_STATUS[r.status], act: 'exView', block: r.status === 'PENDING' ? exBlock(r) : 'x',
      phase: r.status === 'PENDING' ? 'pending' : r.status === 'APPROVED' ? 'open' : 'done', member: `${r.nos.length} 人`, sum: E(r.scope) }));
    return [...rf, ...rb, ...adj, ...ex].sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  C.pendingApprovals = () => items().filter((i) => i.phase === 'pending').length;
  C.pendingOf = (type) => items().filter((i) => i.phase === 'pending' && i.type === type).length;
  const TYPES = [['all', '全部'], ['refund', '退卡'], ['rebind', '换绑手机号'], ['adjust', '积分调整'], ['export', '明文导出']];
  const view = { phase: 'pending' };
  C.act.apPhase = (el) => { view.phase = el.dataset.v; C.render(); };
  C.pages.approvals = {
    title: '审批中心',
    render([type = 'all']) {
      const all = items();
      const ofType = all.filter((i) => type === 'all' || i.type === type);
      const list = ofType.filter((i) => view.phase === 'all' || i.phase === view.phase);
      const count = (ph) => ofType.filter((i) => i.phase === ph).length;
      const chip = (v, t) => `<button class="chip ${view.phase === v ? 'active' : ''}" data-act="apPhase" data-v="${v}">${t}</button>`;
      const tab = ([k, t]) => { const n = all.filter((i) => i.phase === 'pending' && (k === 'all' || i.type === k)).length; return `<button class="tab ${type === k ? 'active' : ''}" role="tab" aria-selected="${type === k}" data-act="nav" data-key="approvals${k === 'all' ? '' : '/' + k}">${t}${n ? ` <span class="badge">${n}</span>` : ''}</button>`; };
      const actText = (i) => i.phase === 'pending' && !i.block ? '审批 ›' : '查看 ›';
      return `
        <div class="page-head"><div><h1>审批中心</h1><p>退卡、换绑手机号、积分调整、明文导出的审批汇总。审批人不能是发起人；审批时按当时数据重新校验，不满足则整单不执行。</p></div>
          <span class="tiny muted">当前身份 ${C.me().code}：${[C.can('approve:money') ? '可审批退卡与积分调整' : '', C.can('approve:identity') ? '可审批换绑与明文导出' : ''].filter(Boolean).join('、') || '无审批权限，仅查看'}</span></div>
        <div class="tabs" role="tablist">${TYPES.map(tab).join('')}</div>
        <div class="table-tools"><div class="chips">${chip('pending', `待审批 ${count('pending')}`)}${chip('open', `进行中 ${count('open')}`)}${chip('done', '已完结')}${chip('all', '全部')}</div>
          <span class="tiny muted" style="margin-left:auto">「进行中」= 已批准、等待业务端锁卡退款或发起人下载</span></div>
        <div class="table-wrap"><table><thead><tr><th>单号</th><th>类型</th><th>会员</th><th>摘要</th><th>发起人</th><th>发起时间</th><th>状态</th><th></th></tr></thead><tbody>
        ${list.length ? list.map((i) => `<tr class="click" data-act="${i.act}" data-id="${i.id}"><td class="mono">${i.id}</td><td>${i.label}</td><td>${i.member}</td><td class="wrap">${i.sum}</td>
          <td>${E(i.who.name)}<div class="tiny muted">${i.who.code}</div></td><td class="num">${i.at}</td><td>${C.pill(...i.st)}</td><td><button class="text-btn">${actText(i)}</button></td></tr>`).join('')
          : `<tr><td colspan="8"><div class="empty"><b>${view.phase === 'pending' ? '没有待审批的单据' : '没有单据'}</b>换个类型或状态看看。</div></td></tr>`}
        </tbody></table></div>
        <p class="tiny muted" style="margin-top:10px">退卡单由售卖业务经 refund-quote 发起（7 天内且未使用权益的全额退无需审批）；换绑只能由客服在会员档案发起；明文导出从会员查询申请。</p>`;
    }
  };

  /* ---------- 审计日志 ---------- */
  const af = { act: 'all', who: 'all', q: '' };
  function auditRows() {
    const q = af.q.trim();
    const list = C.AUDIT.filter((a) => (af.act === 'all' || a.act === af.act) && (af.who === 'all' || a.who === af.who) && (!q || (a.obj + a.detail).includes(q)));
    if (!list.length) return '<tr><td colspan="5"><div class="empty"><b>没有匹配的记录</b>换个筛选条件。</div></td></tr>';
    return list.map((a) => `<tr><td class="num">${a.at}</td><td>${E(a.who)}</td><td>${C.pill(a.act, /驳回|中止|未知/.test(a.act) ? 'red' : /明文|查看/.test(a.act) ? 'amber' : '')}</td><td>${E(a.obj)}</td><td class="wrap small muted">${E(a.detail) || '—'}</td></tr>`).join('');
  }
  C.input.auditAct = (el) => { af.act = el.value; C.pages.audit.refresh(); };
  C.input.auditWho = (el) => { af.who = el.value; C.pages.audit.refresh(); };
  C.input.auditQ = (el) => { af.q = el.value; C.pages.audit.refresh(); };
  C.pages.audit = {
    title: '审计日志',
    refresh() { const tb = document.getElementById('auditRows'); if (tb) tb.innerHTML = auditRows(); },
    render() {
      if (!C.can('audit:view')) return `<div class="page-head"><div><h1>审计日志</h1></div></div><section class="panel"><div class="empty"><b>当前角色无查看权限</b>需要 audit:view（会员运营 / 财务 / 管理员）。你的操作仍会被完整记录。</div></section>`;
      const opt = (v, t, cur) => `<option value="${E(v)}" ${cur === v ? 'selected' : ''}>${E(t)}</option>`;
      const acts = [...new Set(C.AUDIT.map((a) => a.act))];
      const whos = [...new Set(C.AUDIT.map((a) => a.who))];
      return `
        <div class="page-head"><div><h1>审计日志</h1><p>只追加，不提供编辑与删除。覆盖查看会员档案、资料修改、积分调整、退卡、换绑、导出、配置变更与审批；业务端回调记录调用方。</p></div><span class="tiny muted">共 ${C.AUDIT.length} 条（演示内存数据，刷新页面重置）</span></div>
        <div class="table-tools">
          <select data-input="auditAct" aria-label="动作">${opt('all', '全部动作', af.act)}${acts.map((a) => opt(a, a, af.act)).join('')}</select>
          <select data-input="auditWho" aria-label="操作人">${opt('all', '全部操作人', af.who)}${whos.map((w) => opt(w, w, af.who)).join('')}</select>
          <input type="search" placeholder="对象或详情关键词，如会员号、单号" aria-label="审计关键词" data-input="auditQ" value="${E(af.q)}">
        </div>
        <div class="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th></tr></thead><tbody id="auditRows">${auditRows()}</tbody></table></div>`;
    }
  };

  /* 侧栏徽标 */
  C.NAV.forEach((n) => (n.items || []).forEach((i) => { if (i.key === 'approvals') i.badge = C.pendingApprovals; }));
})();
