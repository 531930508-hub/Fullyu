import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';

/**
 * 系统说明。
 *
 * 运营台顶部不再单独占一条横栏：侧边栏顶部已经有品牌标识，
 * 说明入口收进侧边栏底部，点开后仍是原来的说明弹窗。
 */
export function AboutLink({ locale = 'zh' }: { locale?: 'zh' | 'en' }) {
  const [open, setOpen] = useState(false);
  const en = locale === 'en';

  return (
    <>
      <button type="button" className="sidebar-about" onClick={() => setOpen(true)}>
        <Icon name="info" size={14} />
        <span>{en ? 'About' : '系统说明'}</span>
      </button>
      {open ? createPortal(<AboutDialog locale={locale} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

export function AboutDialog({ locale, onClose }: { locale: 'zh' | 'en'; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const en = locale === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="wide" onClose={onClose} aria-label={l('系统说明', 'About')}>
      <div className="sheet-head">
        <h2>{l('系统说明', 'About this system')}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={l('关闭', 'Close')}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="sheet-body">
        <div className="eyebrow">FULL愈 · TEA HOUR</div>
        <h3 style={{ margin: '8px 0 13px' }}>
          {l('把一杯茶，和日常连接起来。', 'A cup of tea, connected to the everyday.')}
        </h3>
        <p className="small muted">
          {l(
            '门店营业与经营管理在同一个运营台里，共用一套账号、接口与数据。顾客在微信小程序下单，门店接单、扫码出餐，总部查看经营与财务。看得到哪些菜单由角色权限决定。',
            'Store operations and brand management live in one console, sharing one set of accounts, APIs and data. Customers order in the WeChat mini-program, stores accept and scan, HQ reviews operations and finance. Visible menus depend on your role.'
          )}
        </p>
        <div className="demo-info-grid">
          <article>
            <h3>{l('顾客小程序', 'Customer mini-program')}</h3>
            <p>
              {l(
                '独立的微信小程序：醒、松、庆、眠四系列，冷热筛选，零售茶包与瓶装，购物袋、会员码与订单。',
                'A standalone WeChat mini-program: four series, hot and iced filters, retail bags and bottles, bag, member code and orders.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('门店营业', 'Store operations')}</h3>
            <p>
              {l(
                '统一待出餐队列，杯贴扫码自动更新，会员码识别，收款与现金入账；零售以 4 位提货码核验交付。',
                'One prep queue, cup-label scanning, member lookup, payments and cash. Retail handover is verified with a 4-digit pickup code.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('经营管理', 'Brand management')}</h3>
            <p>
              {l(
                '商品与原料、门店范围与权限、经营概览、财务流水、运营费用与门店净利。已审批报损计入门店成本。',
                'Products and materials, store scopes and permissions, overview, ledger, operating expenses and store net profit.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('权限边界', 'Permission boundaries')}</h3>
            <p>
              {l(
                '门店账号只看本店数据，总部账号按角色开放财务、商品与组织能力；关键操作留审批与操作记录。',
                'Store accounts see their own store only; HQ accounts get finance, catalog and org capabilities by role. Key actions leave approval and audit trails.'
              )}
            </p>
          </article>
        </div>
        <p className="note">
          {l(
            '支付、打印、泡茶机、会员与外卖平台通过适配层接入，按门店配置启用；未接入时对应操作不可用。',
            'Payments, printing, tea machines, membership and delivery platforms are integrated through adapters and enabled per store; related actions stay unavailable until connected.'
          )}
        </p>
        <div className="flex between" style={{ marginTop: 18 }}>
          <span className="small muted">{l('Full愈·时叙 运营台', 'Tea Hour operations console')}</span>
          <button type="button" className="btn" onClick={onClose}>
            {l('知道了', 'Got it')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
