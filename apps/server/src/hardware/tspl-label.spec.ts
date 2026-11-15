/**
 * 芯烨 XP-420B 杯贴 TSPL 渲染：版式坐标、取餐号主角、二维码口径、字距与转义。
 *
 * 这些断言就是「设计稿」的可执行版本：坐标写死在 CUP_LABEL_LAYOUT、
 * 字距写死在 CUP_LABEL_TRACK，真机出纸前先保证指令串本身是对的。
 *
 * 渲染器是「逐字一条 TEXT」，所以测试按行（同 y）取指令、按 x 排序后拼回文字，
 * 既能钉住版式坐标，也能验证空格照样占位。
 */
import {
  CUP_LABEL_LAYOUT,
  CUP_LABEL_TRACK,
  DEFAULT_TSPL_LABEL_STYLE,
  buildCupLabelTspl,
  buildTsplJob,
  fitTracked,
  formatLabelTime,
  measureDots,
  optionLine,
  pickupCodeOf,
  splitProductName,
  trackedWidth,
  truncateUnits,
  tsplText,
  type CupLabelPayload,
  type PrintJobPayload
} from '@teahour/integrations';

const label = (patch: Partial<CupLabelPayload> = {}): CupLabelPayload => ({
  label: 'A001-1',
  orderNumber: 'TH-261110-0007',
  storeName: '西岸店',
  productName: '醒·花园蜜香',
  temp: '冰',
  ice: '少冰',
  cupIndex: 1,
  cupTotal: 2,
  printedAt: '2026-11-10T06:32:00.000Z',
  pickupCode: 'A001',
  series: 'xing',
  customerName: '林',
  storePhone: 'TEL 021-5466 8899',
  orderedAt: '2026-11-10T06:30:00.000Z',
  ...patch
});

const raw = (patch: Partial<CupLabelPayload> = {}) => buildCupLabelTspl(label(patch));
const lines = (patch: Partial<CupLabelPayload> = {}) => raw(patch).split('\n');

/** 单字符 TEXT 指令的解析结果。 */
type Glyph = { x: number; y: number; font: string; text: string };

const TEXT_RE = /^TEXT (\d+),(\d+),"([^"]*)",0,1,1,"(.*)"$/;

function glyphs(out: string): Glyph[] {
  return out
    .split('\n')
    .filter((line) => line.startsWith('TEXT'))
    .map((line) => {
      const matched = TEXT_RE.exec(line);
      if (!matched) throw new Error(`不是合法的 TEXT 指令：${line}`);
      return { x: Number(matched[1]), y: Number(matched[2]), font: matched[3], text: matched[4] };
    });
}

/** 取某一行的所有字，按 x 从左到右排好。 */
function row(out: string, y: number): Glyph[] {
  return glyphs(out)
    .filter((glyph) => glyph.y === y)
    .sort((a, b) => a.x - b.x);
}

/** 行内文字（空格不发指令，拼回来时自然丢掉，所以断言里都不带空格）。 */
const texts = (glyphsInRow: Glyph[]): string => glyphsInRow.map((glyph) => glyph.text).join('');

const rowText = (out: string, y: number): string => texts(row(out, y));

/** 温度与时间共用一条基线，以 150 点分左右栏。 */
const LANE_SPLIT = 150;

/** 同一行里按水平区间取字：温度在左栏（0–150），时间在右栏（150–320）。 */
const band = (out: string, y: number, from: number, to: number): Glyph[] =>
  row(out, y).filter((glyph) => glyph.x >= from && glyph.x < to);

const bandText = (out: string, y: number, from: number, to: number): string =>
  texts(band(out, y, from, to));

describe('TSPL 杯贴渲染（XP-420B）', () => {
  it('40×60mm 纸：SIZE / GAP / 方向 / 浓度 / 速度 齐全，且以 CLS 开头、PRINT 结尾', () => {
    const out = lines();
    expect(out.slice(0, 7)).toEqual([
      'SIZE 40 mm,60 mm',
      'GAP 2 mm,0 mm',
      'DIRECTION 1',
      'DENSITY 8',
      'SPEED 4',
      'SET TEAR ON',
      'CLS'
    ]);
    expect(out[out.length - 1]).toBe('PRINT 1,1');
  });

  it('取餐号是主角：48 高点阵，位置固定，字距比正文更宽', () => {
    const out = raw();
    expect(row(out, CUP_LABEL_LAYOUT.hero.y)).toEqual([
      { x: 20, y: 94, font: '5', text: 'A' },
      { x: 56, y: 94, font: '5', text: '0' },
      { x: 92, y: 94, font: '5', text: '0' },
      { x: 128, y: 94, font: '5', text: '1' }
    ]);
    // 32 点字宽 + 4 点字距 = 36 点一步
    expect(CUP_LABEL_LAYOUT.hero.x).toBe(20);
    expect(CUP_LABEL_TRACK.hero).toBe(4);
  });

  it('二维码码值是杯贴码，不是取餐号；21 模块 × 5 点居中', () => {
    const qr = lines().filter((line) => line.startsWith('QRCODE'));
    expect(qr).toHaveLength(1);
    // (320 - 105) / 2 = 107.5，取整 108
    expect(qr[0]).toBe(`QRCODE 108,${CUP_LABEL_LAYOUT.qr.y},M,5,A,0,"A001-1"`);
  });

  it('眉题只留中文：2mm 英文挤在 3mm 中文旁边会把呼吸吃光', () => {
    const out = raw();
    expect(rowText(out, CUP_LABEL_LAYOUT.eyebrow.y)).toBe('取餐号');
    expect(row(out, CUP_LABEL_LAYOUT.eyebrow.y)[0]).toEqual({ x: 20, y: 64, font: 'TSS24.BF2', text: '取' });
    expect(lines().some((line) => line.includes('TAKE AWAY'))).toBe(false);
  });

  it('品牌行收紧：不留空格、字距 2 点，给右上角杯序让出视线', () => {
    const brand = row(raw(), CUP_LABEL_LAYOUT.brand.y);
    // 分隔符是 ASCII 竖线：中点号在部分机型字库里缺字形，会打成问号
    expect(brand.map((glyph) => glyph.text).join('')).toBe('Full愈|时叙');
    // 「Full」4 个 ASCII × (12+2) = 56，愈 落在 20+56 上
    expect(brand.find((glyph) => glyph.text === '愈')?.x).toBe(76);
    // 竖线与原来的中点号同宽（ASCII 12+2 字距），版式位置不变
    expect(brand.find((glyph) => glyph.text === '|')?.x).toBe(102);
    expect(brand.find((glyph) => glyph.text === '时')?.x).toBe(116);
    // 整行右缘 166，离杯序（232 起）还有 66 点
    const last = brand[brand.length - 1];
    expect(last.x + 24).toBe(166);
    expect(CUP_LABEL_TRACK.brand).toBeLessThan(CUP_LABEL_TRACK.cn);
  });

  it('系列单独成行、品名只留茶名，并靠双打加粗', () => {
    const out = raw();
    expect(row(out, CUP_LABEL_LAYOUT.series.y)).toEqual([{ x: 20, y: 186, font: 'TSS24.BF2', text: '醒' }]);
    // 英文系列名右移 12 点、基线抬 4 点：20 + (24+3) + 12 = 56
    const seriesEn = row(out, CUP_LABEL_LAYOUT.series.y + CUP_LABEL_LAYOUT.series.enDy);
    expect(seriesEn[0]).toEqual({ x: 56, y: 190, font: '3', text: 'G' });
    expect(seriesEn.map((glyph) => glyph.text).join('')).toBe('GOODDAY');

    const product = row(out, CUP_LABEL_LAYOUT.product.y);
    // 每个字打两遍（错 1 点），所以文字翻倍
    expect(product.map((glyph) => glyph.text).join('')).toBe('花花园园蜜蜜香香');
    expect(product.map((glyph) => glyph.x)).toEqual([20, 21, 47, 48, 74, 75, 101, 102]);
  });

  it('字距是显式的：正文中文 24 点 + 3 点，相邻字间隔 27', () => {
    expect(CUP_LABEL_TRACK.cn).toBe(3);
    const eyebrow = row(raw(), CUP_LABEL_LAYOUT.eyebrow.y);
    expect(eyebrow[1].x - eyebrow[0].x).toBe(24 + CUP_LABEL_TRACK.cn);
    expect(eyebrow[2].x - eyebrow[1].x).toBe(24 + CUP_LABEL_TRACK.cn);
  });

  it('品名没有「·」时不拆系列，整名照排', () => {
    const out = raw({ productName: '冰滴咖啡' });
    expect(rowText(out, CUP_LABEL_LAYOUT.product.y)).toBe('冰冰滴滴咖咖啡啡');
    expect(out).not.toContain('GOOD DAY');
  });

  it('系列没有英文映射（或没传 series）时只出中文，不留空洞', () => {
    const noSeries = raw({ series: undefined });
    expect(rowText(noSeries, CUP_LABEL_LAYOUT.series.y)).toBe('醒');
    expect(row(noSeries, CUP_LABEL_LAYOUT.series.y + CUP_LABEL_LAYOUT.series.enDy)).toEqual([]);

    const unknown = raw({ series: 'mystery' });
    expect(row(unknown, CUP_LABEL_LAYOUT.series.y + CUP_LABEL_LAYOUT.series.enDy)).toEqual([]);
  });

  it('时间按门店时区（上海）出，不用服务器 UTC；贴右边界收', () => {
    const time = band(raw(), CUP_LABEL_LAYOUT.time.y, LANE_SPLIT, CUP_LABEL_LAYOUT.width);
    expect(texts(time)).toBe('11-1014:30');
    // 11 个字符 × 12 + 10 个 1 点字距 = 142，300 - 142 = 158
    expect(time[0]).toEqual({ x: 158, y: 254, font: '0', text: '1' });
    const last = time[time.length - 1];
    expect(last.x + 12).toBe(CUP_LABEL_LAYOUT.right);
  });

  it('温度在左栏、时间在右栏：同一条基线但互不相撞', () => {
    const out = raw();
    const options = band(out, CUP_LABEL_LAYOUT.option.y, 0, LANE_SPLIT);
    const time = band(out, CUP_LABEL_LAYOUT.time.y, LANE_SPLIT, CUP_LABEL_LAYOUT.width);
    expect(CUP_LABEL_LAYOUT.option.y).toBe(CUP_LABEL_LAYOUT.time.y);
    // 「冰 · 少冰」最后落 143，时间从 158 起，中间留 15 点呼吸
    const optionsRight = options[options.length - 1].x + 24;
    expect(optionsRight).toBe(143);
    expect(time[0].x - optionsRight).toBe(15);
  });

  it('称呼与杯序右对齐贴边，不压到取餐号', () => {
    const out = raw();
    expect(row(out, CUP_LABEL_LAYOUT.customer.y)).toEqual([
      { x: 300 - 24, y: 113, font: 'TSS24.BF2', text: '林' }
    ]);
    const seq = row(out, CUP_LABEL_LAYOUT.cupSeq.y);
    expect(seq.map((glyph) => glyph.text).join('')).toBe('1/2');
    expect(seq.map((glyph) => glyph.x)).toEqual([232, 260, 288]);
    expect(seq[seq.length - 1].x + 12).toBe(CUP_LABEL_LAYOUT.right);
  });

  it('昵称按字格截：中文 3 个字、英文 6 个字母，右边都收在 300', () => {
    // 3 个字以内原样印，不动
    expect(rowText(raw({ customerName: '王小明' }), CUP_LABEL_LAYOUT.customer.y)).toBe('王小明');
    // 中文超长：3 个字 + …
    expect(truncateUnits('爱喝奶茶的小仙女', 3)).toBe('爱喝奶…');
    const cn = row(raw({ customerName: '爱喝奶茶的小仙女' }), CUP_LABEL_LAYOUT.customer.y);
    expect(cn.map((glyph) => glyph.text).join('')).toBe('爱喝奶…');
    // 4 个字格 × 24 + 3 个字距 = 105，300 - 105 = 195
    expect(cn[0].x).toBe(195);
    expect(cn[cn.length - 1].x + 24).toBe(CUP_LABEL_LAYOUT.right);

    // 英文按半格算，同样 3 个字格能放 6 个字母
    expect(truncateUnits('Alexander', 3)).toBe('Alexan…');
    const en = row(raw({ customerName: 'Alexander' }), CUP_LABEL_LAYOUT.customer.y);
    expect(en.map((glyph) => glyph.text).join('')).toBe('Alexan…');
    expect(en[en.length - 1].x + 24).toBe(CUP_LABEL_LAYOUT.right);
    // 6 个字母 + 省略号，宽度落在版心内，也不压取餐号（A001 右缘 160）
    const width = trackedWidth('Alexan…', 24, 12, 3);
    expect(width).toBeLessThanOrEqual(CUP_LABEL_LAYOUT.customer.maxDots);
    const heroRight = CUP_LABEL_LAYOUT.hero.x + 4 * 32 + 3 * CUP_LABEL_TRACK.hero;
    expect(CUP_LABEL_LAYOUT.right - width).toBeGreaterThan(heroRight);

    // 中英混排按实际格数：Lily 两个格 + 茶 一个格 = 3，刚好不截
    expect(truncateUnits('Lily茶', 3)).toBe('Lily茶');
    expect(truncateUnits('Lily茶树', 3)).toBe('Lily茶…');
  });

  it('省略号按全角算：右对齐不会因为标点比预期窄而出界', () => {
    // 中文点阵里的「…」占满一格，宽度模型必须与之一致
    expect(measureDots('…', 24, 12)).toBe(24);
    expect(trackedWidth('爱喝奶…', 24, 12, 3)).toBe(4 * 24 + 3 * 3);
  });

  it('门店名居中；电话没配置时整行不出现，不拿占位数字凑', () => {
    const out = raw();
    const store = row(out, CUP_LABEL_LAYOUT.store.y);
    expect(store.map((glyph) => glyph.text).join('')).toBe('西岸店');
    // 3 个字 × 24 + 2 个字距 = 78，居中起点 (320 - 78) / 2 = 121
    expect(store[0].x).toBe(121);
    expect(rowText(out, CUP_LABEL_LAYOUT.tel.y)).toBe('TEL021-54668899');

    const withoutTel = raw({ storePhone: undefined });
    expect(row(withoutTel, CUP_LABEL_LAYOUT.tel.y)).toEqual([]);
    expect(withoutTel).not.toContain('TEL');
  });

  it('单号不上杯贴：顾客和吧台都不读它，省下的一行换成行距', () => {
    const out = raw();
    expect(out).not.toContain('TH-261110-0007');
    expect(out).not.toContain('TH-');
  });

  it('所有文字都落在 20–300 的版心内，不压边', () => {
    const FONT_DOTS: Record<string, number> = { '5': 32, '3': 16, '0': 12, 'TSS24.BF2': 24 };
    for (const glyph of glyphs(raw())) {
      expect(glyph.x).toBeGreaterThanOrEqual(CUP_LABEL_LAYOUT.margin);
      expect(glyph.x + FONT_DOTS[glyph.font]).toBeLessThanOrEqual(CUP_LABEL_LAYOUT.right);
    }
  });

  it('温度与冰量合成一行；热饮不重复写冰量', () => {
    expect(optionLine('冰', '少冰')).toBe('冰 · 少冰');
    expect(optionLine('热', '热')).toBe('热');
    expect(optionLine('热', null)).toBe('热');
    expect(optionLine(null, null)).toBe('');
    expect(bandText(raw(), CUP_LABEL_LAYOUT.option.y, 0, LANE_SPLIT)).toBe('冰·少冰');
  });

  it('引号与换行会被清洗，不能撑破 TSPL 指令', () => {
    expect(tsplText('A"B\nC\tD')).toBe("A'B C D");
    const out = raw({ customerName: '林"二' });
    expect(row(out, CUP_LABEL_LAYOUT.customer.y).map((glyph) => glyph.text)).toEqual(['林', "'", '二']);
    // 清洗后每条指令仍能被 TEXT_RE 完整解析，不会多冒一个引号把 PRINT 吞掉
    expect(out.endsWith('PRINT 1,1')).toBe(true);
  });

  it('超长品名按整字截断补省略号，宽度（含字距）不越过版心', () => {
    const long = '这是一杯名字特别特别特别特别长的茶';
    const fitted = fitTracked(long, CUP_LABEL_LAYOUT.rule.width, 24, 12, CUP_LABEL_TRACK.cn);
    expect(fitted.endsWith('…')).toBe(true);
    expect(trackedWidth(fitted, 24, 12, CUP_LABEL_TRACK.cn)).toBeLessThanOrEqual(CUP_LABEL_LAYOUT.rule.width);
  });

  it('旧任务没有取餐号/系列字段也能打：从杯贴码反推，系列只出中文', () => {
    const legacy = {
      label: 'B012-3',
      orderNumber: 'TH-261029-0001',
      storeName: '西岸店',
      productName: '松·青野微风',
      temp: null,
      ice: null,
      cupIndex: 3,
      cupTotal: 3,
      printedAt: '2026-10-29T03:00:00.000Z'
    } satisfies CupLabelPayload;
    expect(pickupCodeOf(legacy)).toBe('B012');
    const out = buildCupLabelTspl(legacy);
    expect(rowText(out, CUP_LABEL_LAYOUT.hero.y)).toBe('B012');
    expect(rowText(out, CUP_LABEL_LAYOUT.series.y)).toBe('松');
    expect(rowText(out, CUP_LABEL_LAYOUT.cupSeq.y)).toBe('3/3');
    // 没有称呼时用「茶客」，不印空白
    expect(rowText(out, CUP_LABEL_LAYOUT.customer.y)).toBe('茶客');
  });

  it('一单多杯：每杯一张独立标签，按杯贴码各出各的', () => {
    const payload: PrintJobPayload = {
      orderId: 'o1',
      orderNumber: 'TH-261110-0007',
      storeId: 'sh',
      reprint: false,
      labels: [label(), label({ label: 'A001-2', cupIndex: 2, productName: '醒·柚子清光' })]
    };
    const docs = buildTsplJob(payload);
    expect(docs).toHaveLength(2);
    expect(docs[0].tspl).toContain('"A001-1"');
    expect(docs[1].tspl).toContain('"A001-2"');
    expect(rowText(docs[1].tspl, CUP_LABEL_LAYOUT.product.y)).toBe('柚柚子子清清光光');
    expect(docs.every((doc) => doc.tspl.startsWith('SIZE 40 mm,60 mm'))).toBe(true);
  });

  it('品名拆分：只在「·」处拆一次，"手冲茶"后缀留在茶名里', () => {
    expect(splitProductName('醒·花园蜜香 手冲茶')).toEqual({ seriesCn: '醒', teaName: '花园蜜香 手冲茶' });
    expect(splitProductName('瓶装香槟茶')).toEqual({ seriesCn: '', teaName: '瓶装香槟茶' });
  });

  it('时间格式化容错：非法时间返回空串，不抛错', () => {
    expect(formatLabelTime('not-a-date', 'Asia/Shanghai')).toBe('');
    expect(formatLabelTime('2026-11-10T06:30:00.000Z', 'Asia/Shanghai')).toBe('11-10 14:30');
  });

  it('自定义纸宽高与字体走配置，不写死', () => {
    const out = buildCupLabelTspl(label(), {
      ...DEFAULT_TSPL_LABEL_STYLE,
      widthMm: 50,
      heightMm: 80,
      fontCn: 'TST24.BF2',
      density: 10,
      speed: 3
    }).split('\n');
    expect(out[0]).toBe('SIZE 50 mm,80 mm');
    expect(out[3]).toBe('DENSITY 10');
    expect(out[4]).toBe('SPEED 3');
    expect(out.some((line) => line.includes('"TST24.BF2"'))).toBe(true);
  });
});