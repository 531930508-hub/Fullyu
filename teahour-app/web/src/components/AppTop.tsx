import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icons';

export type SurfaceKey = 'mini' | 'workbench' | 'manage';

const SURFACES: Array<{ key: SurfaceKey; zh: string; en: string; to: string }> = [
  { key: 'mini', zh: '顾客小程序', en: 'Customer', to: '/' },
  { key: 'workbench', zh: '平板营业台', en: 'Workbench', to: '/store/workbench' },
  { key: 'manage', zh: '管理后台', en: 'Admin', to: '/admin/overview' }
];

export function AppTop({
  active,
  locale = 'zh',
  onAbout
}: {
  active: SurfaceKey;
  locale?: 'zh' | 'en';
  onAbout?: () => void;
}) {
  const navigate = useNavigate();
  const [aboutOpen, setAboutOpen] = useState(false);
  const en = locale === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);

  const openAbout = () => {
    if (onAbout) onAbout();
    else setAboutOpen(true);
  };

  return (
    <>
      <header className="app-top">
        <div className="brand">
          Full愈·时叙 <span className="demo-tag">LOCAL DEMO</span>
        </div>
        <nav className="surface-switch" aria-label={l('切换工作台', 'Switch surface')}>
          {SURFACES.map((item) => (
            <button
              type="button"
              key={item.key}
              className={item.key === active ? 'active' : ''}
              aria-current={item.key === active ? 'page' : undefined}
              onClick={() => navigate(item.to)}
            >
              {en ? item.en : item.zh}
            </button>
          ))}
        </nav>
        <button type="button" className="text-btn" onClick={openAbout}>
          <Icon name="info" size={16} />
          {l('演示说明', 'About')}
        </button>
      </header>
      {aboutOpen ? <AboutDialog locale={locale} onClose={() => setAboutOpen(false)} /> : null}
    </>
  );
}

function AboutDialog({ locale, onClose }: { locale: 'zh' | 'en'; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const en = locale === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="wide" onClose={onClose} aria-label={l('演示说明', 'About')}>
      <div className="sheet-head">
        <h2>{l('演示说明', 'About this demo')}</h2>
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
            '顾客端、营业台与总部后台共用同一套本地演示数据。可以从选店、点单一路体验到出餐、零售交付、退款、补做与财务流水。',
            'The customer app, workbench and admin share one local demo dataset. Walk from choosing a store through ordering, handover, refunds and finance.'
          )}
        </p>
        <div className="demo-info-grid">
          <article>
            <h3>{l('顾客小程序', 'Customer app')}</h3>
            <p>
              {l(
                '醒、松、庆、眠四系列，冷热筛选，零售茶包与瓶装，购物袋、会员码与订单；中英界面即时切换，支持扫桌签定位。',
                'Four series, hot and iced filters, retail bags and bottles, bag, member code and orders. Bilingual switching and table QR.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('平板营业台', 'Workbench')}</h3>
            <p>
              {l(
                '统一待出餐队列，杯贴扫码自动更新，会员码识别，收款与现金入账；零售以 4 位提货码核验交付。',
                'One prep queue, cup-label scanning, member lookup, payments and cash. Retail handover is verified with a 4-digit pickup code.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('总部后台', 'Admin')}</h3>
            <p>
              {l(
                '商品与原料、门店范围与权限、经营概览、财务流水、运营费用与门店净利。已审批报损计入门店成本。',
                'Products and materials, store scopes and permissions, overview, ledger, operating expenses and store net profit.'
              )}
            </p>
          </article>
          <article>
            <h3>{l('清楚的边界', 'Clear boundaries')}</h3>
            <p>
              {l(
                '没有真实支付、打印、平台订单或会员服务，也不控制泡茶机；身份与审批均为本地演示。',
                'No real payments, printing, platform orders or membership services, and no tea-machine control. Identity and approvals are simulated locally.'
              )}
            </p>
          </article>
        </div>
        <p className="note">
          {l(
            '数据只保存在本地数据库，可随时重置。正式上线前需要接入真实支付、打印与会员接口。',
            'Data lives in the local database and can be reset at any time. Real payment, printing and membership integrations are required before launch.'
          )}
        </p>
        <div className="flex between" style={{ marginTop: 18 }}>
          <span className="small muted">{l('本地演示 · 未连接真实设备', 'Local demo · No real devices')}</span>
          <button type="button" className="btn" onClick={onClose}>
            {l('知道了', 'Got it')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
