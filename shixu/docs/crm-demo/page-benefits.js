/* Full愈 CRM demo · 权益：Full愈 大会员卡（CRM 统一管理）+ 业务会员卡目录（只读）
 * 大会员卡：基础信息、三端权益、规则与版本在 CRM 维护；新版本只对生效后的新购生效，已售卡按开卡快照执行。
 * 业务会员卡：各业务系统自有卡种，CRM 只同步基础信息，不提供开卡、核销、退卡等操作。
 */
(function () {
  const C = window.CRM;
  const E = C.esc;
  const P = C.CARD_PRODUCT;
  const VSTATUS = { CURRENT: ['现行', 'green'], SCHEDULED: ['待生效', 'lilac'], RETIRED: ['已停用', ''], CANCELED: ['已撤销', 'red'] };
  const RULE_TEXT = { sx: '每杯固定减额', ql: '预约折扣', zc: '课程会员价' };

  C.pages.brandcard = {
    title: '大会员卡',
    render() {
      const edit = C.can('card:edit');
      const cur = P.versions.find((v) => v.status === 'CURRENT');
      const sched = P.versions.find((v) => v.status === 'SCHEDULED');
      const sold = Object.values(P.stats.soldMonth).reduce((s, v) => s + v, 0);
      return `
        <div class="page-head"><div><h1>Full愈 大会员卡</h1><p>品牌大会员卡的基础信息、三端权益与规则统一在 CRM 管理；修改即生成新版本，只对生效后的新购生效，已售卡按开卡快照执行。</p></div>
          <button class="btn primary" data-act="cardNewVersion" ${edit && !sched ? '' : `disabled title="${edit ? '已有待生效版本，先撤销或等待生效' : '当前角色无 card:edit 权限'}"`}>编辑为新版本</button></div>
        <div class="stats-grid">
          <div class="stat emphasis"><div class="label">生效中</div><div class="value">${C.n(P.stats.active)}<small>张</small></div><div class="sub">30 天内到期 ${P.stats.expiring30} 张</div></div>
          <div class="stat"><div class="label">本月售出</div><div class="value">${sold}<small>张</small></div><div class="sub">${Object.entries(P.stats.soldMonth).map(([b, v]) => `${C.BIZ[b].n} ${v}`).join(' · ')}</div></div>
          <div class="stat"><div class="label">售价（示例）</div><div class="value">${C.yuan(P.price)}</div><div class="sub">待经营确认 · 三端同价</div></div>
          <div class="stat"><div class="label">有效期（示例）</div><div class="value">${P.days}<small>天</small></div><div class="sub">从支付成功起算；续费接在最晚到期日后</div></div>
        </div>
        <div class="grid-2" style="grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)">
          <div class="stack">
            <section class="panel"><div class="section-title"><h2>三端权益</h2><span class="tiny">现行 v${cur.v} · 开卡时写入卡期快照</span></div>
              <div class="table-wrap"><table><thead><tr><th>业务</th><th>权益 / 规则快照</th><th>规则类型</th></tr></thead><tbody>
              ${Object.entries(P.benefits).map(([b, s]) => `<tr><td>${C.biz(b)}</td><td class="wrap"><strong>${E(s.text)}</strong><span class="mono tiny rule-json">${E(s.rule)}</span></td><td>${RULE_TEXT[b]}</td></tr>`).join('')}
              </tbody></table></div>
              <p class="tiny muted" style="margin-top:10px">业务端按快照计算优惠并回传 usage（已省金额），CRM 累计「已享优惠」用于退卡测算与月度对账。</p></section>
            <section class="panel"><div class="section-title"><h2>版本</h2><span class="tiny">只追加；生效时刻之后的新购使用新版本</span></div>
              <div class="table-wrap"><table><thead><tr><th>版本</th><th>生效时间</th><th>变更</th><th>修改人</th><th>状态</th><th></th></tr></thead><tbody>
              ${P.versions.map((v) => `<tr><td class="mono">v${v.v}</td><td class="num">${v.at}</td><td class="wrap">${E(v.change)}</td><td>${E(v.by)}</td><td>${C.pill(...VSTATUS[v.status])}</td>
                <td>${v.status === 'SCHEDULED' && edit ? `<button class="text-btn" data-act="cardCancelVersion" data-v="${v.v}">撤销</button>` : ''}</td></tr>`).join('')}
              </tbody></table></div></section>
          </div>
          <div class="stack">
            <div class="card-visual"><div class="eyebrow">FULL YU ANNUAL MEMBER</div><h3>${E(P.name)}</h3><p>${E(P.subtitle)}</p>
              <p style="margin-top:10px">${C.yuan(P.price)} / ${P.days} 天 · 产品编码 <span class="mono">${P.code}</span></p></div>
            <section class="panel"><div class="section-title"><h2>基础信息</h2></div>
              <dl class="kv"><dt>卡名</dt><dd>${E(P.name)}</dd><dt>编码</dt><dd class="mono">${P.code}</dd>
                <dt>售卖渠道</dt><dd><span class="chips">${P.channels.map(C.biz).join('')}</span></dd>
                <dt>收款</dt><dd>哪里卖哪里收：各业务自有商户</dd><dt>现行版本</dt><dd>v${cur.v} · ${cur.at} 起</dd>
                ${sched ? `<dt>待生效</dt><dd>${C.pill(`v${sched.v} · ${sched.at}`, 'lilac')}</dd>` : ''}</dl></section>
            <section class="panel"><div class="section-title"><h2>规则</h2></div>
              <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.9">${P.rules.map((r) => `<li>${E(r)}</li>`).join('')}</ul></section>
          </div>
        </div>`;
    }
  };

  C.act.cardNewVersion = () => {
    const field = (b) => `<label>${C.BIZ[b].n}权益<input id="cv_${b}" maxlength="30" value="${E(P.benefits[b].text)}"></label>`;
    C.dialog('编辑为新版本',
      `<div class="form">
        <div class="note">已售卡按开卡快照执行，不受影响；新版本只对生效时间之后的新购生效。</div>
        <div class="grid-2" style="grid-template-columns:1fr 1fr;gap:10px"><label>售价（元）<input id="cvPrice" type="number" min="1" step="1" value="${P.price / 100}"></label><label>有效天数<input id="cvDays" type="number" min="1" step="1" value="${P.days}"></label></div>
        ${P.channels.map(field).join('')}
        <label>生效日期<input id="cvAt" type="date" min="${nextDay(C.TODAY)}" value="${nextDay(C.TODAY)}"></label>
        <label>变更说明<input id="cvNote" maxlength="60" placeholder="必填：如「在场权益改为课程 9 折」"></label>
        <p id="cvErr" class="tiny err" hidden></p></div>`,
      `<button class="btn" data-act="closeDlg">取消</button><button class="btn primary" data-act="cardSaveVersion">保存为待生效版本</button>`);
  };
  /* 本地日期 +1（不用 toISOString，避免 UTC 偏移成前一天） */
  function nextDay(d) { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  C.act.cardSaveVersion = () => {
    const err = (t) => { const e = document.getElementById('cvErr'); e.textContent = t; e.hidden = false; };
    const price = Number(document.getElementById('cvPrice').value);
    const days = Number(document.getElementById('cvDays').value);
    const at = document.getElementById('cvAt').value;
    const note = document.getElementById('cvNote').value.trim();
    if (!Number.isInteger(price) || price <= 0) return err('售价须为正整数（元）');
    if (!Number.isInteger(days) || days <= 0) return err('有效天数须为正整数');
    if (!at || at <= C.TODAY) return err('生效日期须晚于今天（不追溯、不即时覆盖）');
    if (note.length < 2) return err('请填写变更说明');
    const benefits = {};
    for (const b of P.channels) { const v = document.getElementById(`cv_${b}`).value.trim(); if (!v) return err(`${C.BIZ[b].n}权益不能为空`); benefits[b] = v; }
    const v = Math.max(...P.versions.map((x) => x.v)) + 1;
    P.versions.unshift({ v, at: `${at} 00:00`, by: C.me().name, change: note, status: 'SCHEDULED', price: price * 100, days, benefits });
    C.audit('新建大会员卡版本', `${P.name} v${v}`, `${at} 生效 · ${note}`);
    C.closeDialog();
    C.render();
    C.toast(`已保存 v${v}，${at} 起对新购生效`);
  };
  C.act.cardCancelVersion = (el) => {
    const v = P.versions.find((x) => x.v === +el.dataset.v);
    if (!v || v.status !== 'SCHEDULED') return;
    v.status = 'CANCELED';
    C.audit('撤销大会员卡版本', `${P.name} v${v.v}`, '生效前撤销');
    C.render();
    C.toast(`已撤销 v${v.v}`);
  };

  /* ---------- 业务会员卡（只读目录） ---------- */
  C.pages.bizcards = {
    title: '业务会员卡',
    render() {
      const holders = C.MEMBERS.flatMap((m) => (m.bizCards || []).map((k) => ({ m, k })));
      const group = ['sx', 'ql', 'zc'].map((b) => {
        const list = C.BIZ_CARD_PRODUCTS.filter((p) => p.b === b);
        return `<section class="panel"><div class="section-title"><h2>${C.BIZ[b].n}</h2><span class="tiny">${list.length ? `${list.length} 种 · 同步于 ${list[0].synced}` : ''}</span></div>
          ${list.length ? `<div class="table-wrap"><table><thead><tr><th>卡名</th><th>类型</th><th class="r">售价</th><th>规格</th><th class="r">持卡人数</th></tr></thead><tbody>
            ${list.map((p) => `<tr><td><strong>${E(p.name)}</strong></td><td>${E(p.type)}</td><td class="r num">${C.yuan(p.price)}</td><td>${E(p.spec)}</td><td class="r num">${C.n(p.holders)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="empty"><b>暂无业务会员卡</b>${C.BIZ[b].n}目前只参与 Full愈 大会员卡权益。</div>`}</section>`;
      }).join('');
      return `
        <div class="page-head"><div><h1>业务会员卡</h1><p>各业务线自有会员卡由业务系统开卡、核销、退卡；CRM 只同步基础信息，用于会员 360 展示，不提供任何操作。</p></div><span class="tiny muted">示例卡种 · 接入时以业务系统为准</span></div>
        <div class="stack">${group}
          <section class="panel"><div class="section-title"><h2>样本会员持卡</h2><span class="tiny">点击进入会员 360 · 权益卡</span></div>
            <div class="table-wrap"><table><thead><tr><th>会员</th><th>业务</th><th>卡名</th><th>状态</th><th>有效期</th><th>余量</th></tr></thead><tbody>
            ${holders.map(({ m, k }) => `<tr class="click" data-act="openMemberCard" data-no="${m.no}"><td><strong>${E(m.name)}</strong> <span class="mono tiny muted">${m.no}</span></td><td>${C.biz(k.b)}</td><td>${E(k.name)}</td><td>${C.pill(k.status, k.status === '生效中' ? 'green' : k.status === '即将到期' ? 'amber' : '')}</td><td class="num">${k.valid}</td><td class="num">${E(k.remain)}</td></tr>`).join('')}
            </tbody></table></div></section></div>`;
    }
  };
  C.act.openMemberCard = (el) => C.go(`#/member/${el.dataset.no}/card`);
})();
