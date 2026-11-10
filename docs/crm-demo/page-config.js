/* Full愈 CRM demo · 规则配置（积分 / 骰子，版本化）、月度对账（事实数据，非结算）、角色权限矩阵
 * 设计 §6.1：point_rule 按业务、带版本与生效时间；holdTtlMinutes 必须大于该业务订单支付超时；配置变更进入审计。
 * 设计 §7.2：年卡按售卖业务统计销量与实收、按使用业务统计已享优惠；积分为发行业务 × 消耗业务矩阵（1 分 = 1 元负债）。
 *   系统只出事实数据，分摊比例由财务另定，CRM 不生成结算凭证；报表中的预估不等于已结算。
 * 设计 §7.6：四个内置角色；审批人与发起人必须不同（单据层强制，与角色无关）。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const VSTATUS = { CURRENT: ['现行', 'green'], SCHEDULED: ['待生效', 'lilac'], RETIRED: ['已停用', ''], CANCELED: ['已撤销', 'red'] };
  const BIZ3 = ['sx', 'ql', 'zc'];
  /* 各业务订单支付超时（分钟，来自业务端订单配置，示例） */
  C.PAY_TIMEOUT = { sx: 15, ql: 30, zc: 15 };

  /* ============ 规则配置 ============ */
  const POINT_FIELDS = [
    { k: 'centsPerPoint', label: '每消费多少元得 1 分', unit: '元', scale: 100, int: true, min: 1, max: 1000 },
    { k: 'rounding', label: '不足 1 分时', opts: { floor: '舍去', round: '四舍五入' } },
    { k: 'cardMultiplier', label: '大会员卡倍数', unit: '倍', step: 0.5, min: 1, max: 3 },
    { k: 'newMember', label: '新会员首单奖励', unit: '分', int: true, min: 0, max: 500 },
    { k: 'holdTtlMinutes', label: '抵扣预占有效期', unit: '分钟', int: true, min: 1, max: 240 },
    { k: 'earnCoolingDays', label: '发放冷静期', unit: '天', int: true, min: 0, max: 30 }
  ];
  const DICE_FIELDS = [
    { k: 'centsPerDie', label: '每消费多少元得 1 颗', unit: '元', scale: 100, int: true, min: 1, max: 1000 },
    { k: 'perOrderCap', label: '单笔最多', unit: '颗', int: true, min: 1, max: 20 },
    { k: 'checkinDaily', label: '每日签到', unit: '颗', int: true, min: 0, max: 3 },
    { k: 'monthCap', label: '每人每月上限', unit: '颗', int: true, min: 1, max: 200 },
    { k: 'chestBudget', label: '宝箱格月预算', unit: '元', scale: 100, int: true, min: 0, max: 100000 },
    { k: 'guestPlay', label: '非会员可玩', opts: { no: '否（开通大会员卡后可玩）', yes: '是' } }
  ];
  const PR = (centsPerPoint, rounding, cardMultiplier, newMember, holdTtlMinutes, earnCoolingDays) => ({ centsPerPoint, rounding, cardMultiplier, newMember, holdTtlMinutes, earnCoolingDays });

  C.RULESETS = {
    points: {
      title: '积分规则', fields: POINT_FIELDS, scopes: BIZ3,
      json: (r) => JSON.stringify({ earn: { centsPerPoint: r.centsPerPoint, rounding: r.rounding, cardMultiplier: r.cardMultiplier }, bonus: { newMember: r.newMember }, holdTtlMinutes: r.holdTtlMinutes, earnCoolingDays: r.earnCoolingDays }),
      check: (r, s) => (r.holdTtlMinutes <= C.PAY_TIMEOUT[s] ? `抵扣预占有效期须大于${C.BIZ[s].n}订单支付超时 ${C.PAY_TIMEOUT[s]} 分钟` : ''),
      versions: {
        sx: [
          { v: 2, from: '2026-09-01 00:00', by: '李沐', at: '2026-08-25 16:20', change: '大会员卡倍数 1 → 2；新会员首单奖励 0 → 20 分', reason: '配合年卡上线', status: 'CURRENT', rule: PR(1000, 'floor', 2, 20, 30, 0) },
          { v: 1, from: '2026-02-01 00:00', by: '周岚', at: '2026-01-28 10:00', change: '初始版本', reason: '', status: 'RETIRED', rule: PR(1000, 'floor', 1, 0, 30, 0) }
        ],
        ql: [
          { v: 3, from: '2026-11-08 00:00', by: '李沐', at: '2026-11-07 11:03', change: '大会员卡倍数 1.5 → 2；新会员首单奖励 0 → 50 分', reason: '冬季拉新', status: 'SCHEDULED', rule: PR(1000, 'floor', 2, 50, 45, 0) },
          { v: 2, from: '2026-08-01 00:00', by: '李沐', at: '2026-07-28 14:30', change: '大会员卡倍数 1 → 1.5', reason: '年卡试运行', status: 'CURRENT', rule: PR(1000, 'floor', 1.5, 0, 45, 0) },
          { v: 1, from: '2026-03-01 00:00', by: '周岚', at: '2026-02-26 09:40', change: '初始版本（沿用轻疗原积分规则）', reason: '', status: 'RETIRED', rule: PR(1000, 'floor', 1, 0, 45, 0) }
        ],
        zc: [
          { v: 1, from: '2025-12-01 00:00', by: '周岚', at: '2025-11-26 15:10', change: '初始版本', reason: '', status: 'CURRENT', rule: PR(1000, 'round', 1, 0, 20, 0) }
        ]
      }
    },
    dice: {
      title: '骰子规则', fields: DICE_FIELDS, scopes: ['all'],
      json: (r) => JSON.stringify(r),
      check: () => '',
      versions: {
        all: [
          { v: 1, from: '2026-10-01 00:00', by: '周岚', at: '2026-09-26 11:00', change: '初始版本（数值待经营确认）', reason: '', status: 'CURRENT', rule: { centsPerDie: 5000, perOrderCap: 6, checkinDaily: 1, monthCap: 60, chestBudget: 300000, guestPlay: 'no' } }
        ]
      }
    }
  };
  const RS = C.RULESETS;
  const scopeName = (s) => (s === 'all' ? '全业务通用' : C.BIZ[s].n);
  const fmt = (f, v) => (f.opts ? f.opts[v] : `${C.n(f.scale ? v / f.scale : v)} ${f.unit}`);
  const curOf = (set, s) => set.versions[s].find((v) => v.status === 'CURRENT');
  const schedOf = (set, s) => set.versions[s].find((v) => v.status === 'SCHEDULED');

  /* 积分试算：R(实付 / 每分金额 × 倍数) + 首单奖励 */
  C.earnPoints = (r, paidCents, card, first) => {
    const raw = (paidCents / r.centsPerPoint) * (card ? r.cardMultiplier : 1);
    return (r.rounding === 'round' ? Math.round(raw) : Math.floor(raw)) + (first ? r.newMember : 0);
  };
  const view = { tab: 'points', trial: { b: 'ql', paid: '236', card: true, first: false }, month: '2026-11', draft: null };

  function trialOut() {
    const t = view.trial;
    const paid = Number(t.paid);
    if (!t.paid || !Number.isFinite(paid) || paid <= 0 || Math.round(paid * 100) !== paid * 100) return '<span class="muted">输入实付金额（元，最多两位小数）</span>';
    const set = RS.points;
    const cur = curOf(set, t.b);
    const sched = schedOf(set, t.b);
    const one = (v) => `按 v${v.v}${v.status === 'SCHEDULED' ? `（${v.from.slice(5, 10)} 起）` : '（现行）'}：<b class="num">${C.n(C.earnPoints(v.rule, Math.round(paid * 100), t.card, t.first))}</b> 分`;
    return [cur, sched].filter(Boolean).map(one).join('<span class="muted"> · </span>');
  }
  C.input.cfgTrial = (el) => {
    const k = el.dataset.k;
    view.trial[k] = el.type === 'checkbox' ? el.checked : el.value;
    const o = document.getElementById('cfgTrialOut');
    if (o) o.innerHTML = trialOut();
  };

  function scopePanel(key, s) {
    const set = RS[key];
    const cur = curOf(set, s);
    const sched = schedOf(set, s);
    const edit = C.can('config:edit');
    const rows = set.fields.map((f) => {
      const chg = sched && sched.rule[f.k] !== cur.rule[f.k];
      return `<tr><td>${f.label}</td><td class="num">${E(fmt(f, cur.rule[f.k]))}</td>${sched ? `<td class="num ${chg ? 'chg' : ''}">${E(fmt(f, sched.rule[f.k]))}${chg ? ' <span class="pill lilac">变更</span>' : ''}</td>` : ''}</tr>`;
    }).join('');
    const why = !edit ? '当前角色无 config:edit 权限' : sched ? '已有待生效版本，先撤销或等待生效' : '';
    return `<section class="panel" data-scope="${s}"><div class="section-title"><h2>${s === 'all' ? scopeName(s) : C.biz(s)}</h2>
        <div class="head-actions">${C.pill(`现行 v${cur.v}`, 'green')}${sched ? C.pill(`待生效 v${sched.v} · ${sched.from}`, 'lilac') : ''}
          <button class="btn" data-act="cfgNew" data-set="${key}" data-scope="${s}" ${why ? `disabled title="${why}"` : ''}>新建版本</button></div></div>
      <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)">
        <div><div class="table-wrap"><table><thead><tr><th>参数</th><th>现行 v${cur.v}</th>${sched ? `<th>v${sched.v} · ${sched.from.slice(5)} 起</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>
          <span class="mono tiny rule-json">${E(set.json((sched || cur).rule))}</span>
          ${key === 'points' ? `<p class="tiny muted" style="margin-top:6px">${C.BIZ[s].n}订单支付超时 ${C.PAY_TIMEOUT[s]} 分钟（业务端配置），预占有效期须更长。</p>` : ''}</div>
        <div class="table-wrap"><table><thead><tr><th>版本</th><th>生效时间</th><th>变更</th><th>修改人</th><th>状态</th><th></th></tr></thead><tbody>
          ${set.versions[s].map((v) => `<tr><td class="mono">v${v.v}</td><td class="num">${v.from}</td><td class="wrap">${E(v.change)}${v.reason ? `<div class="tiny muted">${E(v.reason)}</div>` : ''}</td><td>${E(v.by)}<div class="tiny muted num">${v.at.slice(5)}</div></td><td>${C.pill(...VSTATUS[v.status])}</td>
            <td>${v.status === 'SCHEDULED' && edit ? `<button class="text-btn" data-act="cfgCancel" data-set="${key}" data-scope="${s}" data-v="${v.v}">撤销</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div></section>`;
  }

  C.act.cfgNew = (el) => {
    const set = RS[el.dataset.set];
    const s = el.dataset.scope;
    if (!C.can('config:edit')) return C.toast('当前角色无 config:edit 权限');
    if (schedOf(set, s)) return C.toast('已有待生效版本，先撤销或等待生效');
    const cur = curOf(set, s);
    const input = (f) => (f.opts
      ? `<label>${f.label}<select id="cf_${f.k}">${Object.entries(f.opts).map(([v, t]) => `<option value="${v}" ${cur.rule[f.k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
      : `<label>${f.label}（${f.unit}）<input id="cf_${f.k}" inputmode="decimal" value="${f.scale ? cur.rule[f.k] / f.scale : cur.rule[f.k]}"></label>`);
    C.dialog(`新建版本 · ${set.title} · ${scopeName(s)}`,
      `<div class="form">
        <div class="note">新版本只对生效时间之后的${el.dataset.set === 'points' ? '订单（按支付时间匹配）' : '订单与签到'}生效；已发放的${el.dataset.set === 'points' ? '积分' : '骰子'}不追溯。历史版本只读。</div>
        <div class="grid-2" style="grid-template-columns:1fr 1fr;gap:10px">${set.fields.map(input).join('')}</div>
        <label>生效时间<input id="cfFrom" type="datetime-local" value="2026-11-08T00:00"></label>
        <label>调整原因<input id="cfNote" maxlength="60" placeholder="必填：如「冬季拉新」"></label>
        <p id="cfErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="cfgSave" data-set="${el.dataset.set}" data-scope="${s}">保存为待生效版本</button>`);
    document.getElementById('dlg').style.width = 'min(560px, calc(100vw - 28px))';
  };
  C.act.cfgSave = (el) => {
    const key = el.dataset.set;
    const set = RS[key];
    const s = el.dataset.scope;
    const err = (t) => { const e = document.getElementById('cfErr'); e.textContent = t; e.hidden = false; };
    if (!C.can('config:edit')) return err('当前角色无 config:edit 权限');
    const cur = curOf(set, s);
    const rule = {};
    for (const f of set.fields) {
      const raw = document.getElementById(`cf_${f.k}`).value.trim();
      if (f.opts) { rule[f.k] = raw; continue; }
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n)) return err(`${f.label}须为数字`);
      if (f.int && !Number.isInteger(n)) return err(`${f.label}须为整数`);
      if (f.step && Math.abs(Math.round(n / f.step) * f.step - n) > 1e-9) return err(`${f.label}须为 ${f.step} 的倍数`);
      if (n < f.min || n > f.max) return err(`${f.label}须在 ${f.min}–${f.max} ${f.unit}之间`);
      rule[f.k] = f.scale ? Math.round(n * f.scale) : n;
    }
    const cross = set.check(rule, s);
    if (cross) return err(cross);
    const from = document.getElementById('cfFrom').value.replace('T', ' ');
    if (!from) return err('请选择生效时间');
    if (from <= C.NOW) return err('生效时间须晚于当前（不追溯、不即时覆盖）');
    const diffs = set.fields.filter((f) => rule[f.k] !== cur.rule[f.k]).map((f) => `${f.label} ${fmt(f, cur.rule[f.k])} → ${fmt(f, rule[f.k])}`);
    if (!diffs.length) return err('与现行版本相同，无需新建');
    const note = document.getElementById('cfNote').value.trim();
    if (note.length < 2) return err('请填写调整原因');
    const v = Math.max(...set.versions[s].map((x) => x.v)) + 1;
    set.versions[s].unshift({ v, from, by: C.me().name, at: C.NOW, change: diffs.join('；'), reason: note, status: 'SCHEDULED', rule });
    C.audit('修改配置', `${set.title} · ${scopeName(s)} v${cur.v}→v${v}`, `生效 ${from} · ${diffs.join('；')} · ${note}`);
    C.closeDialog();
    C.render();
    C.toast(`已保存 v${v}，${from} 起生效`);
  };
  C.act.cfgCancel = (el) => {
    const set = RS[el.dataset.set];
    const v = set.versions[el.dataset.scope].find((x) => x.v === +el.dataset.v);
    if (!C.can('config:edit') || !v || v.status !== 'SCHEDULED') return;
    v.status = 'CANCELED';
    C.audit('撤销配置版本', `${set.title} · ${scopeName(el.dataset.scope)} v${v.v}`, '生效前撤销');
    C.render();
    C.toast(`已撤销 v${v.v}`);
  };

  const noPerm = (title, need) => `<div class="page-head"><div><h1>${title}</h1></div></div><section class="panel"><div class="empty"><b>当前角色无查看权限</b>${need}</div></section>`;

  C.pages.config = {
    title: '规则配置',
    render(params) {
      if (!C.can('config:edit') && !C.can('audit:view')) return noPerm('规则配置', '需要 config:edit 或 audit:view（会员运营 / 财务 / 管理员）。');
      const tab = params[0] === 'dice' ? 'dice' : 'points';
      const t = (k, label) => `<button class="tab ${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}" data-act="nav" data-key="config/${k}">${label}</button>`;
      const tr = view.trial;
      const body = tab === 'points' ? `
        <section class="panel" style="margin-bottom:16px"><div class="section-title"><h2>积分试算</h2><span class="tiny">R(实付 ÷ 每分金额 × 卡倍数) + 首单奖励；R 按「不足 1 分时」取整</span></div>
          <div class="trial">
            <label>业务<select data-input="cfgTrial" data-k="b" aria-label="试算业务">${BIZ3.map((b) => `<option value="${b}" ${tr.b === b ? 'selected' : ''}>${C.BIZ[b].n}</option>`).join('')}</select></label>
            <label>实付（元）<input data-input="cfgTrial" data-k="paid" inputmode="decimal" value="${E(tr.paid)}" style="width:120px"></label>
            <label class="inline"><input type="checkbox" data-input="cfgTrial" data-k="card" ${tr.card ? 'checked' : ''}>持大会员卡</label>
            <label class="inline"><input type="checkbox" data-input="cfgTrial" data-k="first" ${tr.first ? 'checked' : ''}>新会员首单</label>
            <div id="cfgTrialOut" class="trial-out">${trialOut()}</div>
          </div></section>
        <div class="stack">${BIZ3.map((b) => scopePanel('points', b)).join('')}</div>
        <p class="tiny muted" style="margin-top:12px">表中数值为结构示例，实际值由各业务运营确认。过期规则全业务统一：1–10 月获得 → 次年 1 月 1 日，11–12 月 → 后年 1 月 1 日，不在此配置。</p>`
        : `
        <div class="note warn" style="margin-bottom:16px">待经营决策：非会员能否游玩、骰子费率与月上限、宝箱格月预算。下表为 demo 示例值，确认后以新版本发布。</div>
        <div class="stack">${scopePanel('dice', 'all')}
          <section class="panel"><div class="section-title"><h2>发放口径</h2></div>
            <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.9">
              <li>骰子账本归 CRM：按「业务 + 订单号」幂等发放，签到按「会员 + 日期」幂等。</li>
              <li>订单退款时收回该订单发放且未使用的骰子；已掷出的不追回，流水写明原因。</li>
              <li>每人每月上限按自然月计算，超出部分不发放并在流水中记录「已达上限」。</li>
              <li>宝箱格月预算用尽后，当月剩余宝箱格改为普通格；实物礼物到店人工确认领取。</li></ul></section></div>`;
      return `
        <div class="page-head"><div><h1>规则配置</h1><p>规则分业务、分版本；新版本须指定晚于当前的生效时间，到点由 CRM 切换，业务端调用发放 / 预占时按订单支付时间匹配版本。每次修改写审计，历史版本只读。</p></div>
          <span class="tiny muted">${C.can('config:edit') ? '当前身份可新建版本' : '当前身份只读（修改需 config:edit）'}</span></div>
        <div class="tabs" role="tablist">${t('points', '积分规则')}${t('dice', '骰子规则')}</div>${body}`;
    }
  };

  /* ============ 月度对账（合成汇总，按日对账后的流水口径） ============ */
  const M = (sx, ql, zc) => ({ sx, ql, zc });
  C.MONTHLY = {
    '2026-10': {
      label: '2026 年 10 月', status: '已定稿', note: '2026-11-01 03:00 关账出数',
      cards: {
        sold: M({ n: 38, c: 2656200 }, { n: 52, c: 3634800 }, { n: 27, c: 1887300 }),
        refund: M({ n: 2, c: 127000 }, { n: 1, c: 61300 }, { n: 0, c: 0 }),
        usage: { sx: M(41200, 88400, 12600), ql: M(30200, 198600, 21000), zc: M(9800, 45600, 96400) }
      },
      points: {
        open: { sx: 21400, ql: 38600, zc: 15200, hq: 1200 },
        issue: { sx: 6200, ql: 9800, zc: 4100, hq: 300 },
        use: { sx: M(2100, 900, 300), ql: M(700, 4600, 500), zc: M(200, 600, 1500), hq: M(100, 100, 0) },
        revoke: { sx: 120, ql: 300, zc: 80, hq: 0 },
        expire: { sx: 0, ql: 0, zc: 0, hq: 0 }
      }
    },
    '2026-11': {
      label: '2026 年 11 月', status: '本月至今 · 预估', note: '截至 2026-11-06 日对账；每日 02:00 更新，今天的操作次日计入；月末关账后定稿', mtd: true,
      cards: {
        sold: M({ n: 9, c: 629100 }, { n: 11, c: 768900 }, { n: 6, c: 419400 }),
        refund: M({ n: 0, c: 0 }, { n: 0, c: 0 }, { n: 0, c: 0 }),
        usage: { sx: M(8200, 15400, 2800), ql: M(6400, 42600, 5600), zc: M(2000, 9800, 21400) }
      },
      points: {
        issue: { sx: 1500, ql: 2400, zc: 900, hq: 1100 },
        use: { sx: M(900, 400, 100), ql: M(300, 3900, 400), zc: M(100, 200, 1000), hq: M(100, 300, 0) },
        revoke: { sx: 100, ql: 380, zc: 120, hq: 0 },
        expire: { sx: 0, ql: 0, zc: 0, hq: 0 }
      }
    }
  };
  const ISSUERS = ['sx', 'ql', 'zc', 'hq'];
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  /* 期初取上月期末；期末 = 期初 + 发行 − 消耗 − 撤回 − 过期 */
  function balances(key) {
    const R = C.MONTHLY[key];
    const P = R.points;
    const prev = key === '2026-11' ? balances('2026-10') : null;
    const open = P.open || Object.fromEntries(ISSUERS.map((i) => [i, prev[i].close]));
    return Object.fromEntries(ISSUERS.map((i) => {
      const use = sum(P.use[i]);
      return [i, { open: open[i], issue: P.issue[i], use, revoke: P.revoke[i], expire: P.expire[i], close: open[i] + P.issue[i] - use - P.revoke[i] - P.expire[i] }];
    }));
  }
  C.monthlyBalances = balances;
  const issuerName = (i) => (i === 'hq' ? '总部（人工调整）' : C.BIZ[i].n);

  function reportCsv(key) {
    const R = C.MONTHLY[key];
    const bal = balances(key);
    const L = [`Full愈 CRM 月度对账,${R.label},${R.status},事实数据非结算`, '', '年卡·按售卖业务,售出张数,实收(元),退卡张数,退款(元),净实收(元)'];
    BIZ3.forEach((b) => { const s = R.cards.sold[b]; const r = R.cards.refund[b]; L.push([C.BIZ[b].n, s.n, s.c / 100, r.n, r.c / 100, (s.c - r.c) / 100].join(',')); });
    L.push('', '年卡已享优惠(元)·售卖业务\\使用业务,时叙,轻疗,在场,合计');
    BIZ3.forEach((b) => { const u = R.cards.usage[b]; L.push([C.BIZ[b].n, u.sx / 100, u.ql / 100, u.zc / 100, sum(u) / 100].join(',')); });
    L.push('', '积分消耗(分)·发行业务\\消耗业务,时叙,轻疗,在场,合计');
    ISSUERS.forEach((i) => { const u = R.points.use[i]; L.push([issuerName(i), u.sx, u.ql, u.zc, sum(u)].join(',')); });
    L.push('', '积分余额·发行业务,期初,发行,消耗,撤回,过期,期末');
    ISSUERS.forEach((i) => { const x = bal[i]; L.push([issuerName(i), x.open, x.issue, x.use, x.revoke, x.expire, x.close].join(',')); });
    return '\ufeff' + L.join('\n');
  }
  C.act.reportMonth = (el) => C.go(`#/report/${el.dataset.v}`);
  C.act.reportExport = () => {
    if (!C.can('report:view')) return C.toast('当前角色无 report:view 权限');
    const key = view.month;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([reportCsv(key)], { type: 'text/csv;charset=utf-8' }));
    a.download = `crm-monthly-${key}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    C.audit('导出月报', `${key} 月度对账`, '汇总数据，不含会员明细');
    C.toast(`已导出 ${key} 月度对账 CSV`);
  };

  function matrix(rows, rowName, data, money) {
    const v = (x) => (money ? C.yuan(x) : C.n(x));
    const col = (b) => rows.reduce((s, r) => s + data[r][b], 0);
    return `<div class="table-wrap"><table class="matrix"><thead><tr><th></th>${BIZ3.map((b) => `<th class="r">${C.BIZ[b].n}${money ? '使用' : '消耗'}</th>`).join('')}<th class="r">合计</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${rowName(r)}</td>${BIZ3.map((b) => `<td class="r num ${r === b ? 'diag' : ''}">${v(data[r][b])}</td>`).join('')}<td class="r num"><b>${v(sum(data[r]))}</b></td></tr>`).join('')}
      <tr class="total"><td>合计</td>${BIZ3.map((b) => `<td class="r num">${v(col(b))}</td>`).join('')}<td class="r num">${v(rows.reduce((s, r) => s + sum(data[r]), 0))}</td></tr>
      </tbody></table></div>`;
  }

  C.pages.report = {
    title: '月度对账',
    render(params) {
      if (!C.can('report:view')) return noPerm('月度对账', '需要 report:view（财务 / 管理员）。');
      const key = C.MONTHLY[params[0]] ? params[0] : '2026-11';
      view.month = key;
      const R = C.MONTHLY[key];
      const vk = `report:${key}:${C.state.role}`;
      if (!C.state.viewed[vk]) { C.state.viewed[vk] = true; C.audit('查看月报', `${key} 月度对账`, ''); }
      const bal = balances(key);
      const sold = BIZ3.reduce((s, b) => ({ n: s.n + R.cards.sold[b].n, c: s.c + R.cards.sold[b].c }), { n: 0, c: 0 });
      const refund = BIZ3.reduce((s, b) => ({ n: s.n + R.cards.refund[b].n, c: s.c + R.cards.refund[b].c }), { n: 0, c: 0 });
      const saved = BIZ3.reduce((s, b) => s + sum(R.cards.usage[b]), 0);
      const cross = BIZ3.reduce((s, r) => s + BIZ3.filter((b) => b !== r).reduce((t, b) => t + R.cards.usage[r][b], 0), 0);
      const tot = (k) => ISSUERS.reduce((s, i) => s + bal[i][k], 0);
      const pCross = ISSUERS.reduce((s, i) => s + BIZ3.filter((b) => b !== i).reduce((t, b) => t + R.points.use[i][b], 0), 0);
      const recon = R.mtd && C.queueOpen ? C.queueOpen('recon') : 0;
      const chip = (k) => `<button class="chip ${key === k ? 'active' : ''}" data-act="reportMonth" data-v="${k}">${C.MONTHLY[k].label}</button>`;
      const eq = ISSUERS.every((i) => bal[i].open + bal[i].issue - bal[i].use - bal[i].revoke - bal[i].expire === bal[i].close);
      const liab = R.mtd ? (tot('close') === C.SUMMARY.pointsOutstanding
        ? `<div class="check ok">期末合计 ${C.n(tot('close'))} 分与工作台「积分负债」一致</div>`
        : `<div class="check bad">期末合计 ${C.n(tot('close'))} 分与工作台「积分负债」${C.n(C.SUMMARY.pointsOutstanding)} 分不一致，需排查</div>`) : '';
      return `
        <div class="page-head"><div><h1>月度对账</h1><p>按日对账后的 CRM 流水汇总，只出事实数据：业务间分摊比例由财务另定，CRM 不生成结算凭证；预估不等于已结算。积分按 1 分 = 1 元负债计。</p></div>
          <div class="head-actions"><div class="chips">${Object.keys(C.MONTHLY).map(chip).join('')}</div><button class="btn" data-act="reportExport">导出 CSV</button></div></div>
        <div class="note ${R.mtd ? 'warn' : 'ok'}" style="margin-bottom:12px">${C.pill(R.status, R.mtd ? 'amber' : 'green')} ${E(R.note)}</div>
        ${recon ? `<div class="note bad" style="margin-bottom:12px">2026-11-06 日对账还有 ${recon} 条差异未处理，相关数字暂按 CRM 流水计入，处理后次日重算。<button class="text-btn" data-act="nav" data-key="queue/recon">去处理 ›</button></div>` : ''}
        <div class="stats-grid">
          <div class="stat emphasis"><div class="label">大会员卡售出</div><div class="value">${sold.n}<small>张</small></div><div class="sub">实收 ${C.yuan(sold.c)} · 退卡 ${refund.n} 张</div></div>
          <div class="stat"><div class="label">已享优惠</div><div class="value">${C.yuan(saved)}</div><div class="sub">其中跨业务 ${C.yuan(cross)}</div></div>
          <div class="stat"><div class="label">积分发行 / 消耗</div><div class="value">${C.n(tot('issue'))}<small>/ ${C.n(tot('use'))} 分</small></div><div class="sub">跨业务消耗 ${C.n(pCross)} 分</div></div>
          <div class="stat"><div class="label">期末未用积分</div><div class="value">${C.n(tot('close'))}<small>分</small></div><div class="sub">负债 ${C.yuan(tot('close') * 100)}${R.mtd ? ` · 2027-01-01 将过期 ${C.n(C.SUMMARY.pointsExpiringJan1)} 分` : ''}</div></div>
        </div>
        <div class="stack">
          <section class="panel"><div class="section-title"><h2>大会员卡 · 按售卖业务</h2><span class="tiny">哪里卖哪里收：实收进售卖业务自有商户</span></div>
            <div class="table-wrap"><table><thead><tr><th>售卖业务</th><th class="r">售出</th><th class="r">实收</th><th class="r">退卡</th><th class="r">退款</th><th class="r">净实收</th></tr></thead><tbody>
            ${BIZ3.map((b) => { const s = R.cards.sold[b]; const r = R.cards.refund[b]; return `<tr><td>${C.biz(b)}</td><td class="r num">${s.n} 张</td><td class="r num">${C.yuan(s.c)}</td><td class="r num">${r.n} 张</td><td class="r num">${C.yuan(r.c)}</td><td class="r num"><b>${C.yuan(s.c - r.c)}</b></td></tr>`; }).join('')}
            <tr class="total"><td>合计</td><td class="r num">${sold.n} 张</td><td class="r num">${C.yuan(sold.c)}</td><td class="r num">${refund.n} 张</td><td class="r num">${C.yuan(refund.c)}</td><td class="r num">${C.yuan(sold.c - refund.c)}</td></tr>
            </tbody></table></div>
            ${R.mtd ? '<p class="tiny muted" style="margin-top:8px">退卡锁定中的卡期（等待渠道退款结果）不计入退款，确认后计入当月。</p>' : ''}</section>
          <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
            <section class="panel"><div class="section-title"><h2>已享优惠 · 售卖业务 × 使用业务</h2></div>
              ${matrix(BIZ3, (b) => `${C.BIZ[b].n}售出的卡`, R.cards.usage, true)}
              <p class="tiny muted" style="margin-top:8px">对角线外为跨业务优惠：A 售出的卡在 B 享受的优惠由 B 让利，是否分摊由财务另定。</p></section>
            <section class="panel"><div class="section-title"><h2>积分消耗 · 发行业务 × 消耗业务</h2><span class="tiny">单位：分</span></div>
              ${matrix(ISSUERS, (i) => `${issuerName(i)}发行`, R.points.use, false)}
              <p class="tiny muted" style="margin-top:8px">消耗按批次归属发行业务（到期最早优先扣减时记录每批扣了多少）。</p></section>
          </div>
          <section class="panel"><div class="section-title"><h2>积分余额勾稽 · 按发行业务</h2><span class="tiny">期末 = 期初 + 发行 − 消耗 − 撤回 − 过期</span></div>
            <div class="table-wrap"><table><thead><tr><th>发行业务</th><th class="r">期初</th><th class="r">发行</th><th class="r">消耗</th><th class="r">撤回</th><th class="r">过期</th><th class="r">期末</th></tr></thead><tbody>
            ${ISSUERS.map((i) => { const x = bal[i]; return `<tr><td>${issuerName(i)}</td><td class="r num">${C.n(x.open)}</td><td class="r num">${C.n(x.issue)}</td><td class="r num">${C.n(x.use)}</td><td class="r num">${C.n(x.revoke)}</td><td class="r num">${C.n(x.expire)}</td><td class="r num"><b>${C.n(x.close)}</b></td></tr>`; }).join('')}
            <tr class="total"><td>合计</td>${['open', 'issue', 'use', 'revoke', 'expire', 'close'].map((k) => `<td class="r num">${C.n(tot(k))}</td>`).join('')}</tr>
            </tbody></table></div>
            <div class="stack" style="gap:8px;margin-top:12px">
              <div class="check ${eq ? 'ok' : 'bad'}">${eq ? '各发行业务期初 + 发行 − 消耗 − 撤回 − 过期 = 期末' : '勾稽不平，需排查'}</div>${liab}
              ${key === '2026-11' ? `<div class="tiny muted">期初取 2026-10 定稿期末 ${C.n(ISSUERS.reduce((s, i) => s + balances('2026-10')[i].close, 0))} 分。</div>` : ''}</div></section>
        </div>`;
    }
  };

  /* ============ 角色权限 ============ */
  const LOCKED = { 'member:view': '基础权限，所有角色必备', 'role:edit': '仅总部管理员' };
  const DEPS = { 'member:edit': 'member:view', 'adjust:batch': 'adjust:create', 'sync:retry': 'sync:view' };
  const SOD = [['adjust:create', 'approve:money', '可发起又可审批积分调整'], ['identity:create', 'approve:identity', '可发起又可审批换绑 / 合并']];
  const EDITABLE = ['OPS', 'FINANCE', 'CS'];
  const permName = (p) => (C.PERMS.find((x) => x[0] === p) || [p, p])[1];
  /* 草稿只含可编辑角色；管理员行始终取真实权限 */
  const permsOf = (r) => (view.draft && view.draft[r] && C.can('role:edit') ? view.draft[r] : C.ROLES[r].perms);
  function changes() {
    if (!view.draft) return [];
    return EDITABLE.flatMap((r) => {
      const a = C.ROLES[r].perms;
      const d = view.draft[r];
      return [...d.filter((p) => !a.includes(p)).map((p) => ({ r, p, on: true })), ...a.filter((p) => !d.includes(p)).map((p) => ({ r, p, on: false }))];
    });
  }
  function depErrors() {
    return EDITABLE.flatMap((r) => Object.entries(DEPS).filter(([p, need]) => permsOf(r).includes(p) && !permsOf(r).includes(need)).map(([p, need]) => `${C.ROLES[r].title}：${permName(p)} 需要先有「${permName(need)}」`));
  }
  C.act.roleToggle = (el) => {
    if (!C.can('role:edit')) return;
    if (!view.draft) view.draft = Object.fromEntries(EDITABLE.map((r) => [r, [...C.ROLES[r].perms]]));
    const list = view.draft[el.dataset.r];
    const p = el.dataset.p;
    if (el.checked && !list.includes(p)) list.push(p);
    if (!el.checked) list.splice(list.indexOf(p), 1);
    C.render();
  };
  C.act.roleDiscard = () => { view.draft = null; C.render(); C.toast('已放弃未保存的权限变更'); };
  const chgText = (x) => `${C.ROLES[x.r].title}${x.on ? ' 授予' : ' 收回'}「${permName(x.p)}」`;
  C.act.roleReview = () => {
    const list = changes();
    if (!list.length || depErrors().length) return;
    C.dialog('保存权限变更',
      `<div class="form"><div class="note warn">保存后立即生效，已登录的该角色账号下一次操作即按新权限校验。</div>
        <ul class="steps">${list.map((x) => `<li>${C.pill(x.on ? '授予' : '收回', x.on ? 'green' : 'red')}<span>${E(C.ROLES[x.r].code)} · ${E(permName(x.p))} <span class="mono tiny muted">${x.p}</span></span></li>`).join('')}</ul>
        <label>变更原因<input id="roleNote" maxlength="60" placeholder="必填：如「客服需要查看审计以答复投诉」"></label>
        <p id="roleErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="roleSave">确认保存</button>`);
  };
  C.act.roleSave = () => {
    const err = (t) => { const e = document.getElementById('roleErr'); e.textContent = t; e.hidden = false; };
    if (!C.can('role:edit')) return err('当前角色无 role:edit 权限');
    const note = document.getElementById('roleNote').value.trim();
    if (note.length < 4) return err('变更原因至少 4 个字');
    const list = changes();
    EDITABLE.forEach((r) => {
      const mine = list.filter((x) => x.r === r);
      if (!mine.length) return;
      C.ROLES[r].perms = C.PERMS.map((p) => p[0]).filter((p) => view.draft[r].includes(p));
      C.audit('修改角色权限', `${C.ROLES[r].code} · ${C.ROLES[r].title}`, `${mine.map((x) => `${x.on ? '+' : '−'}${x.p}`).join(' ')} · ${note}`);
    });
    view.draft = null;
    C.closeDialog();
    C.render();
    C.toast(`已保存 ${list.length} 项权限变更，立即生效`);
  };

  const CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  C.pages.roles = {
    title: '角色权限',
    render() {
      if (!C.can('role:edit') && !C.can('audit:view')) return noPerm('角色权限', '需要 audit:view（会员运营 / 财务 / 管理员）。');
      const edit = C.can('role:edit');
      const roles = Object.keys(C.ROLES);
      const cell = (r, p) => {
        const has = permsOf(r).includes(p);
        if (edit && EDITABLE.includes(r) && !LOCKED[p]) return `<td class="c"><input type="checkbox" data-act="roleToggle" data-r="${r}" data-p="${p}" ${has ? 'checked' : ''} aria-label="${C.ROLES[r].title} · ${permName(p)}"></td>`;
        return `<td class="c">${has ? `<span class="perm-on" aria-label="有">${CHECK}</span>` : '<span class="perm-off" aria-label="无">—</span>'}</td>`;
      };
      const list = changes();
      const deps = depErrors();
      const sod = EDITABLE.flatMap((r) => SOD.filter(([a, b]) => permsOf(r).includes(a) && permsOf(r).includes(b)).map(([, , t]) => `${C.ROLES[r].title}（${C.ROLES[r].code}）${t}`));
      return `
        <div class="page-head"><div><h1>角色权限</h1><p>四个内置角色。审批类操作在单据层强制「审批人 ≠ 发起人」，与角色无关；仅总部管理员可修改其他角色的权限，保存即生效并写审计。</p></div>
          <span class="tiny muted">${edit ? '当前身份可修改' : '当前身份只读'}</span></div>
        <div class="grid-2 roles-grid">
          <section class="panel"><div class="section-title"><h2>权限矩阵</h2><span class="tiny">${C.PERMS.length} 个权限点</span></div>
            <div class="table-wrap"><table class="matrix"><thead><tr><th>权限</th>${roles.map((r) => `<th class="c">${C.ROLES[r].title}<div class="tiny muted mono">${C.ROLES[r].code}</div></th>`).join('')}</tr></thead><tbody>
            ${C.PERMS.map(([p, label]) => `<tr><td>${E(label)}<div class="tiny muted"><span class="mono">${p}</span>${LOCKED[p] ? ` · ${LOCKED[p]}` : ''}${DEPS[p] ? ` · 需 ${DEPS[p]}` : ''}</div></td>${roles.map((r) => cell(r, p)).join('')}</tr>`).join('')}
            </tbody></table></div>
            ${list.length ? `<div class="unsaved"><span>未保存变更 ${list.length} 项：${E(list.map(chgText).join('；'))}${deps.length ? `<span class="tiny" style="display:block;color:#f3c9bf">${E(deps.join('；'))}</span>` : ''}</span>
              <span class="head-actions"><button class="btn" data-act="roleDiscard">放弃</button><button class="btn primary" data-act="roleReview" ${deps.length ? 'disabled title="先补齐依赖权限"' : ''}>保存变更</button></span></div>` : ''}</section>
          <div class="stack">
            <section class="panel"><div class="section-title"><h2>职责分离检查</h2></div>
              ${sod.length ? sod.map((t) => `<div class="note warn" style="margin-bottom:8px">${E(t)}。单据层仍禁止自审，但建议拆给不同角色。</div>`).join('') : '<div class="check ok">非管理员角色均未同时持有发起与审批权限</div>'}</section>
            <section class="panel"><div class="section-title"><h2>固定规则</h2></div>
              <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.9">
                <li>退卡、积分调整、换绑、明文导出：审批人不能是发起人。</li>
                <li>审批时重新校验余额、卡期状态与手机号占用，不按申请时快照放行。</li>
                <li>会员合并默认只给管理员（approve:identity）。</li>
                <li>CRM 内显示明文手机号；三端业务后台一律脱敏，只有单个拨号时明文。</li>
                <li>审计日志只追加，任何角色都不能修改或删除。</li></ul></section>
          </div>
        </div>`;
    }
  };
})();
