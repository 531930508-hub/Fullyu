/* Full愈 CRM demo · 积分调整：单笔 / 批量统一在 CRM 发起与审批
 * 规则：单笔 |分数| ≤ ADJ_LIMIT 直接入账；单笔超过或批量 → 待审批，审批人需 approve:money 且 ≠ 发起人。
 * 执行：加分 = 新建总部批次（按获得月份算过期）；扣分 = 按到期日最早优先分配。只追加 ADJUST 流水。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const { balance } = C.calc;
  const STATUS = { PENDING: ['待审批', 'amber'], DONE: ['已入账', 'green'], REJECTED: ['已驳回', 'red'] };
  const seq = () => String(C.ADJUSTS.length + 1).padStart(4, '0');
  const newId = () => `ADJ-${C.TODAY.replace(/-/g, '')}-${seq()}`;
  const total = (a) => a.lines.reduce((s, l) => s + l.delta, 0);
  const signed = (v) => `${v > 0 ? '+' : ''}${C.n(v)}`;
  const findMember = (s) => { s = String(s || '').trim(); return C.MEMBERS.find((m) => m.no === s.toUpperCase() || m.phone === s); };

  /* ---------- 执行：写批次与流水（只在单笔免审或审批通过时调用） ---------- */
  function applyAdjust(m, delta, ref) {
    adjustLedger(m, delta, ref);
    m.ver += 1;
    if (C.emit) C.emit('points.changed', m, `${ref} 积分调整 ${signed(delta)}`);
  }
  function adjustLedger(m, delta, ref) {
    if (delta > 0) {
      /* 批次号由调整单号派生：同一调整单对同一会员只有一行，故不会重号 */
      m.batches.unshift({ id: `PB-A${ref.slice(-4)}`, biz: 'hq', ref, earned: C.TODAY, amount: delta, remaining: delta, expire: C.expireAt(C.TODAY), status: 'ACTIVE' });
      m.ledger.push({ at: C.NOW, type: 'ADJUST', b: 'hq', ref, delta });
      return;
    }
    let need = -delta;
    const parts = [];
    m.batches.filter((b) => b.status === 'ACTIVE' && b.remaining > 0).sort((a, b) => (a.expire + a.earned < b.expire + b.earned ? -1 : 1)).forEach((b) => {
      if (!need) return;
      const take = Math.min(need, b.remaining);
      b.remaining -= take;
      need -= take;
      if (!b.remaining) b.status = 'DEPLETED';
      parts.push(`${b.id}:${take}`);
    });
    m.ledger.push({ at: C.NOW, type: 'ADJUST', b: 'hq', ref, delta, alloc: parts.join(' · ') });
  }
  /* 逐行校验（提交时与审批时各做一次：余额可能已变化） */
  function lineError(l) {
    const m = C.member(l.no);
    if (!m) return '找不到会员';
    if (!Number.isInteger(l.delta) || l.delta === 0) return '分数须为非零整数';
    if (Math.abs(l.delta) > 100000) return '单行不超过 100,000 分';
    if (l.delta < 0 && -l.delta > balance(m)) return `扣减超过余额`;
    return '';
  }

  /* ---------- 单笔调整 ---------- */
  C.act.adjustOne = (el) => {
    const m = el.dataset.no ? C.member(el.dataset.no) : null;
    C.dialog('单笔积分调整',
      `<div class="form">
        ${m ? `<div class="note">会员 <b>${E(m.name)}</b> · <span class="mono">${m.no}</span> · 当前余额 <b class="num">${C.n(balance(m))}</b> 分</div><input type="hidden" id="adjNo" value="${m.no}">`
          : `<label>会员号或手机号<input id="adjNo" placeholder="FY-2602-008812 或 13812346620"></label>`}
        <label>方向<span class="chips"><label class="radio"><input type="radio" name="adjDir" value="1" checked>增加</label><label class="radio"><input type="radio" name="adjDir" value="-1">扣减</label></span></label>
        <label>分数<input id="adjPts" type="number" min="1" step="1" inputmode="numeric" placeholder="正整数，1 分 = ¥1"></label>
        <label>原因<select id="adjReason"><option value="">请选择</option>${C.ADJ_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></label>
        <label>说明<textarea id="adjNote" rows="2" maxlength="80" placeholder="必填：关联单号或客诉记录"></textarea></label>
        <p class="tiny muted">≤ ${C.ADJ_LIMIT} 分提交后直接入账；超过 ${C.ADJ_LIMIT} 分进入待审批，需另一位有审批权限的同事通过。</p>
        <p id="adjErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="adjustOneSubmit">提交</button>`);
  };
  C.act.adjustOneSubmit = () => {
    const err = (t) => { const e = document.getElementById('adjErr'); e.textContent = t; e.hidden = false; };
    const m = findMember(document.getElementById('adjNo').value);
    if (!m) return err('找不到会员：请输入完整会员号或 11 位手机号');
    const pts = Number(document.getElementById('adjPts').value);
    if (!Number.isInteger(pts) || pts <= 0) return err('分数须为正整数');
    const delta = pts * Number(document.querySelector('input[name="adjDir"]:checked').value);
    const reason = document.getElementById('adjReason').value;
    const note = document.getElementById('adjNote').value.trim();
    if (!reason) return err('请选择原因');
    if (note.length < 2) return err('请填写说明');
    const line = { no: m.no, delta };
    const le = lineError(line);
    if (le) return err(le);
    const rec = { id: newId(), kind: 'single', reason, note, at: C.NOW, by: { code: C.me().code, name: C.me().name }, status: 'PENDING', lines: [line] };
    C.ADJUSTS.unshift(rec);
    if (Math.abs(delta) <= C.ADJ_LIMIT) {
      applyAdjust(m, delta, rec.id);
      Object.assign(rec, { status: 'DONE', doneAt: C.NOW, approver: `免审批（≤ ${C.ADJ_LIMIT} 分）` });
      C.audit('积分调整入账', `${m.name} · ${m.no}`, `${rec.id} ${signed(delta)} 分 · ${reason}`);
      C.toast(`已入账 ${signed(delta)} 分 · 余额 ${C.n(balance(m))}`);
    } else {
      C.audit('发起积分调整', `${m.name} · ${m.no}`, `${rec.id} ${signed(delta)} 分 · 超过 ${C.ADJ_LIMIT} 分待审批`);
      C.toast(`超过 ${C.ADJ_LIMIT} 分，已提交审批 ${rec.id}`);
    }
    C.closeDialog();
    C.render();
  };

  /* ---------- 批量：粘贴 → 预览校验 → 提交待审批 ---------- */
  const draft = { text: '', reason: '', note: '', rows: null };
  function parse(text) {
    const seen = {};
    return text.split(/\n/).map((s) => s.trim()).filter(Boolean).map((raw, i) => {
      const parts = raw.split(/[,，\t ]+/);
      const row = { i: i + 1, raw, m: null, delta: NaN, err: '' };
      if (parts.length !== 2) { row.err = '格式应为「会员号或手机号,±分数」'; return row; }
      row.m = findMember(parts[0]);
      row.delta = /^[+-]?\d+$/.test(parts[1]) ? Number(parts[1]) : NaN;
      if (!row.m) { row.err = '找不到会员'; return row; }
      if (seen[row.m.no]) { row.err = `与第 ${seen[row.m.no]} 行重复`; return row; }
      seen[row.m.no] = row.i;
      row.err = lineError({ no: row.m.no, delta: row.delta });
      return row;
    });
  }
  function preview() {
    const rows = draft.rows;
    if (!rows) return '<div class="empty"><b>粘贴名单后点「校验预览」</b>每行一位：会员号或手机号，逗号，±分数。最多 500 行。</div>';
    const bad = rows.filter((r) => r.err).length;
    const ok = rows.filter((r) => !r.err);
    return `<div class="check ${bad ? 'bad' : 'ok'}" style="margin-bottom:10px">${rows.length} 行 · 有效 ${ok.length} · 错误 ${bad}${bad ? ' · 请修正标红行后再提交' : ` · 合计 ${signed(ok.reduce((s, r) => s + r.delta, 0))} 分`}</div>
      <div class="table-wrap"><table><thead><tr><th>行</th><th>输入</th><th>会员</th><th class="r">当前余额</th><th class="r">调整</th><th>校验</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="num">${r.i}</td><td class="mono">${E(r.raw)}</td><td>${r.m ? `${E(r.m.name)}<div class="mono tiny muted">${r.m.no}</div>` : '—'}</td><td class="r num">${r.m ? C.n(balance(r.m)) : '—'}</td><td class="r num">${Number.isNaN(r.delta) ? '—' : signed(r.delta)}</td><td>${r.err ? `<span class="err tiny">${E(r.err)}</span>` : C.pill('通过', 'green')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const SAMPLE = 'FY-2605-000927,+150\n13911801180,+150\n18800452210,-100\nFY-2605-000927,+20\nFY-9999-000000,+50';

  C.act.batchFill = () => { draft.text = SAMPLE; draft.rows = null; C.render(); };
  C.act.batchCheck = () => {
    draft.text = document.getElementById('batchText').value;
    draft.reason = document.getElementById('batchReason').value;
    draft.note = document.getElementById('batchNote').value;
    const lines = draft.text.split(/\n/).filter((s) => s.trim());
    if (lines.length > 500) { C.toast('单次最多 500 行，请拆分'); return; }
    draft.rows = parse(draft.text);
    C.render();
  };
  C.act.batchSubmit = () => {
    draft.reason = document.getElementById('batchReason').value;
    draft.note = document.getElementById('batchNote').value.trim();
    const rows = draft.rows;
    if (!rows || !rows.length) return C.toast('请先校验预览');
    if (draft.text !== document.getElementById('batchText').value) return C.toast('名单已修改，请重新校验预览');
    if (rows.some((r) => r.err)) return C.toast('有错误行，修正后再提交');
    if (!draft.reason) return C.toast('请选择原因');
    if (draft.note.length < 2) return C.toast('请填写说明');
    const rec = { id: newId(), kind: 'batch', reason: draft.reason, note: draft.note, at: C.NOW, by: { code: C.me().code, name: C.me().name }, status: 'PENDING', lines: rows.map((r) => ({ no: r.m.no, delta: r.delta })) };
    C.ADJUSTS.unshift(rec);
    C.audit('发起批量积分调整', `${rec.lines.length} 人`, `${rec.id} 合计 ${signed(total(rec))} 分 · ${rec.reason}`);
    Object.assign(draft, { text: '', reason: '', note: '', rows: null });
    C.go('#/adjust');
    C.toast(`已提交 ${rec.id}，待另一人审批`);
  };

  /* ---------- 审批：approve:money 且审批人 ≠ 发起人；审批时重新校验，状态守卫防重复执行 ---------- */
  function approveBlock(a) {
    if (a.status !== 'PENDING') return '该调整单已处理';
    if (!C.can('approve:money')) return '当前角色无审批权限（approve:money）';
    if (a.by.code === C.me().code) return '审批人不能是发起人';
    return '';
  }
  C.act.adjView = (el) => {
    const a = C.ADJUSTS.find((x) => x.id === el.dataset.id);
    const block = approveBlock(a);
    const lines = a.lines.map((l) => { const m = C.member(l.no); const e = a.status === 'PENDING' ? lineError(l) : ''; return `<tr><td>${E(m.name)} <span class="mono tiny muted">${m.no}</span></td><td class="r num">${C.n(balance(m))}</td><td class="r num">${signed(l.delta)}</td><td>${e ? `<span class="err tiny">${E(e)}</span>` : a.status === 'PENDING' ? C.pill('可执行', 'green') : '—'}</td></tr>`; }).join('');
    C.dialog(`调整单 ${a.id}`,
      `<dl class="kv" style="margin-bottom:12px"><dt>类型</dt><dd>${a.kind === 'batch' ? `批量 · ${a.lines.length} 人` : '单笔'}</dd><dt>合计</dt><dd class="num">${signed(total(a))} 分</dd>
        <dt>原因</dt><dd>${E(a.reason)} · ${E(a.note)}</dd><dt>发起</dt><dd>${E(a.by.name)}（${a.by.code}）· ${a.at}</dd>
        <dt>状态</dt><dd>${C.pill(...STATUS[a.status])}${a.approver ? ` <span class="tiny muted">${E(a.approver)} · ${a.doneAt}${a.opinion ? ' · ' + E(a.opinion) : ''}</span>` : ''}</dd></dl>
       <div class="table-wrap"><table><thead><tr><th>会员</th><th class="r">当前余额</th><th class="r">调整</th><th>校验</th></tr></thead><tbody>${lines}</tbody></table></div>
       ${a.status === 'PENDING' ? (block ? `<div class="note warn" style="margin-top:12px">${block}</div>` : `<label class="small muted" style="display:block;margin-top:12px">审批意见（驳回必填）<input id="adjOpinion" maxlength="60" style="display:block;width:100%;margin-top:6px"></label><p id="apErr" class="tiny err" hidden></p>`) : ''}`,
      `<button class="btn" data-act="closeDlg">关闭</button>${a.status === 'PENDING' ? `<button class="btn danger" data-act="adjReject" data-id="${a.id}" ${block ? 'disabled' : ''}>驳回</button><button class="btn primary" data-act="adjApprove" data-id="${a.id}" ${block ? 'disabled' : ''}>通过并入账</button>` : ''}`);
    document.getElementById('dlg').style.width = 'min(620px, calc(100vw - 28px))';
  };
  const resetWidth = () => { document.getElementById('dlg').style.width = ''; };
  document.getElementById('dlg').addEventListener('close', resetWidth);
  C.act.adjApprove = (el) => {
    const a = C.ADJUSTS.find((x) => x.id === el.dataset.id);
    const block = approveBlock(a);
    if (block) return C.toast(block);
    const bad = a.lines.map((l) => [l, lineError(l)]).filter(([, e]) => e);
    if (bad.length) { const p = document.getElementById('apErr'); p.textContent = `${bad.length} 行已不满足执行条件（余额变化），整单不执行；请驳回后重新发起`; p.hidden = false; return; }
    a.lines.forEach((l) => applyAdjust(C.member(l.no), l.delta, a.id));
    Object.assign(a, { status: 'DONE', approver: `${C.me().name}（${C.me().code}）`, doneAt: C.NOW, opinion: (document.getElementById('adjOpinion') || {}).value || '' });
    C.audit('审批通过积分调整', a.id, `${a.lines.length} 人 · 合计 ${signed(total(a))} 分 · 发起人 ${a.by.name}`);
    C.closeDialog();
    C.render();
    C.toast(`${a.id} 已入账，${a.lines.length} 人`);
  };
  C.act.adjReject = (el) => {
    const a = C.ADJUSTS.find((x) => x.id === el.dataset.id);
    const block = approveBlock(a);
    if (block) return C.toast(block);
    const op = document.getElementById('adjOpinion').value.trim();
    if (!op) { const p = document.getElementById('apErr'); p.textContent = '驳回需填写审批意见'; p.hidden = false; return; }
    Object.assign(a, { status: 'REJECTED', approver: `${C.me().name}（${C.me().code}）`, doneAt: C.NOW, opinion: op });
    C.audit('驳回积分调整', a.id, op);
    C.closeDialog();
    C.render();
    C.toast(`已驳回 ${a.id}`);
  };

  /* ---------- 页面 ---------- */
  const filter = { status: 'all' };
  C.act.adjFilter = (el) => { filter.status = el.dataset.v; C.render(); };
  C.pages.adjust = {
    title: '积分调整',
    render([sub = 'list']) {
      const canOne = C.can('adjust:create');
      const canBatch = C.can('adjust:batch');
      const subTab = (k, t) => `<button class="tab ${sub === k ? 'active' : ''}" role="tab" aria-selected="${sub === k}" data-act="nav" data-key="adjust${k === 'list' ? '' : '/' + k}">${t}</button>`;
      const head = `
        <div class="page-head"><div><h1>积分调整</h1><p>单笔与批量调整统一在 CRM 发起；单笔 ≤ ${C.ADJ_LIMIT} 分直接入账，超过或批量需另一人（财务 / 管理员）审批，审批人不能是发起人。全部写 ADJUST 流水、只追加。</p></div>
          <button class="btn primary" data-act="adjustOne" ${canOne ? '' : 'disabled title="当前角色无 adjust:create 权限"'}>单笔调整</button></div>
        <div class="tabs" role="tablist">${subTab('list', '调整单')}${subTab('batch', '批量调整')}</div>`;
      if (sub === 'batch') {
        if (!canBatch) return head + `<section class="panel"><div class="empty"><b>当前角色无批量调整权限</b>需要 adjust:batch（会员运营 / 管理员）。单笔调整仍可在会员档案或本页右上角发起。</div></section>`;
        return head + `
          <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)">
            <section class="panel"><div class="section-title"><h2>名单</h2><button class="text-btn" data-act="batchFill">填入示例（含错误行）</button></div>
              <div class="form">
                <label>每行：会员号或手机号,±分数<textarea id="batchText" rows="8" class="mono" placeholder="FY-2602-008812,+200&#10;13620932093,-50">${E(draft.text)}</textarea></label>
                <label>原因<select id="batchReason"><option value="">请选择</option>${C.ADJ_REASONS.map((r) => `<option ${draft.reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
                <label>说明<input id="batchNote" maxlength="80" value="${E(draft.note)}" placeholder="必填：活动名或差错单号"></label>
                <div style="display:flex;gap:8px"><button class="btn" data-act="batchCheck">校验预览</button><button class="btn primary" data-act="batchSubmit" ${draft.rows && draft.rows.length && !draft.rows.some((r) => r.err) ? '' : 'disabled'}>提交审批</button></div>
                <p class="tiny muted">批量一律待审批；审批时按当时余额重新校验，任一行不满足则整单不执行。</p></div></section>
            <section class="panel"><div class="section-title"><h2>校验预览</h2><span class="tiny">找不到会员 / 格式 / 重复 / 扣减超余额</span></div>${preview()}</section>
          </div>`;
      }
      const list = C.ADJUSTS.filter((a) => filter.status === 'all' || a.status === filter.status);
      const chip = (v, t) => `<button class="chip ${filter.status === v ? 'active' : ''}" data-act="adjFilter" data-v="${v}">${t}</button>`;
      return head + `
        <div class="table-tools"><div class="chips">${chip('all', '全部')}${chip('PENDING', `待审批 ${C.ADJUSTS.filter((a) => a.status === 'PENDING').length}`)}${chip('DONE', '已入账')}${chip('REJECTED', '已驳回')}</div>
          <span class="tiny muted" style="margin-left:auto">当前身份 ${C.me().code}${C.can('approve:money') ? ' · 可审批他人发起的调整单' : ' · 无审批权限'}</span></div>
        <div class="table-wrap"><table><thead><tr><th>调整单</th><th>类型</th><th>会员</th><th class="r">合计</th><th>原因</th><th>发起人</th><th>发起时间</th><th>状态</th><th></th></tr></thead><tbody>
        ${list.length ? list.map((a) => `<tr class="click" data-act="adjView" data-id="${a.id}"><td class="mono">${a.id}</td><td>${a.kind === 'batch' ? '批量' : '单笔'}</td>
          <td>${a.lines.length === 1 ? E(C.member(a.lines[0].no).name) : `${E(C.member(a.lines[0].no).name)} 等 ${a.lines.length} 人`}</td><td class="r num">${signed(total(a))}</td>
          <td>${E(a.reason)}<div class="tiny muted">${E(a.note)}</div></td><td>${E(a.by.name)}<div class="tiny muted">${a.by.code}</div></td><td class="num">${a.at}</td><td>${C.pill(...STATUS[a.status])}</td>
          <td><button class="text-btn">${a.status === 'PENDING' && !approveBlock(a) ? '审批 ›' : '查看 ›'}</button></td></tr>`).join('')
          : '<tr><td colspan="9"><div class="empty"><b>没有调整单</b>换个状态看看。</div></td></tr>'}
        </tbody></table></div>`;
    }
  };
  C.pendingAdjusts = () => C.ADJUSTS.filter((a) => a.status === 'PENDING').length;
})();
