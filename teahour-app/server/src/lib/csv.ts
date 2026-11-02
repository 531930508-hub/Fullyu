import { yuanToCents } from './money.js';

export type ExpenseCategory = {
  id: string;
  name: string;
  nameEn: string;
  aliases: string[];
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'labor', name: '人力', nameEn: 'Labor', aliases: ['人力', '人工', '工资', '薪酬', '员工', 'labor', 'payroll', 'staff'] },
  { id: 'rent', name: '租金', nameEn: 'Rent', aliases: ['租金', '房租', '场地', 'rent', 'lease'] },
  { id: 'hq', name: '总部管理费', nameEn: 'HQ management', aliases: ['总部管理费', '管理费', '总部费用', 'hq', 'management', 'overhead'] },
  { id: 'utilities', name: '水电物业', nameEn: 'Utilities', aliases: ['水电', '物业', '水电物业', '能耗', 'utilities', 'utility'] },
  { id: 'marketing', name: '营销推广', nameEn: 'Marketing', aliases: ['营销', '推广', '广告', 'marketing', 'promotion'] },
  { id: 'other', name: '其他', nameEn: 'Other', aliases: ['其他', '其它', '杂费', 'other', 'misc'] }
];

export const EXPENSE_SOURCES: Record<string, string> = {
  manual: '手动录入',
  import: '批量导入',
  seed: '示例'
};

export type ParsedSheet = {
  rows: Array<{
    line: number;
    date: string;
    storeId: string;
    storeName: string;
    category: string;
    categoryName: string;
    amountCents: number;
    memo: string;
  }>;
  errors: Array<{ line: number; message: string }>;
  duplicates: number;
  lineCount: number;
};

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['日期', '发生日期', 'date'],
  store: ['门店', '门店名称', '店铺', 'store'],
  category: ['类别', '费用类别', '科目', 'category'],
  amount: ['金额', '费用金额', 'amount'],
  memo: ['备注', '说明', 'memo', 'note']
};

export function normalizeExpenseText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000·•\-—_/\\()（）]/g, '');
}

export function parseDelimited(text: string): Array<{ cells: string[]; line: number }> {
  const clean = String(text ?? '').replace(/^\uFEFF/, '');
  const first = clean.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#'));
  const delimiter = ((first || '').match(/\t/g) || []).length > ((first || '').match(/,/g) || []).length ? '\t' : ',';
  const parsed: Array<{ cells: string[]; line: number }> = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      parsed.push({ cells: row, line });
      row = [];
      field = '';
      line += 1;
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  parsed.push({ cells: row, line });
  return parsed.filter(
    (x) => x.cells.some((c) => String(c).trim()) && !String(x.cells[0] || '').trim().startsWith('#')
  );
}

export function resolveExpenseCategory(value: unknown): ExpenseCategory {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('费用类别不能为空');
  const needle = normalizeExpenseText(raw);
  const hit = EXPENSE_CATEGORIES.find((c) =>
    [c.id, c.name, c.nameEn, ...c.aliases].some((x) => normalizeExpenseText(x) === needle)
  );
  if (!hit) throw new Error(`无法识别费用类别“${raw}”`);
  return hit;
}

export type StoreAlias = {
  id: string;
  name: string;
  nameEn: string;
  short: string;
  city: string;
  cityEn: string;
};

export function resolveExpenseStore(stores: StoreAlias[], value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('门店不能为空');
  const needle = normalizeExpenseText(raw);
  if (['brand', 'hq', '总部', '品牌', '品牌零售', '总部品牌', 'headquarters'].includes(needle)) {
    return 'brand';
  }
  const aliases = (st: StoreAlias) => [st.id, st.name, st.nameEn, st.short, `${st.city}${st.short}`, `${st.cityEn}${st.short}`];
  const exact = stores.find((st) => aliases(st).some((x) => normalizeExpenseText(x) === needle));
  if (exact) return exact.id;
  const partial = stores.filter((st) =>
    aliases(st).some((x) => {
      const alias = normalizeExpenseText(x);
      return alias && (alias.includes(needle) || needle.includes(alias));
    })
  );
  if (partial.length === 1) return partial[0].id;
  if (partial.length > 1) throw new Error(`门店“${raw}”匹配到多家，请填写完整门店名`);
  throw new Error(`无法识别门店“${raw}”`);
}

export function parseExpenseDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) throw new Error(`日期“${raw}”应为 YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`日期“${raw}”不存在`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseExpenseAmount(value: unknown): number {
  try {
    return yuanToCents(value);
  } catch {
    throw new Error(`金额“${value}”应为正数，最多两位小数`);
  }
}

function headerIndex(normalized: string, key: keyof typeof HEADER_ALIASES): number {
  return HEADER_ALIASES[key].findIndex((alias) => normalizeExpenseText(alias) === normalized);
}

export function expenseKey(row: { storeId: string; category: string; date: string; amountCents: number; memo: string }): string {
  return [row.storeId, row.category, row.date, row.amountCents, row.memo.trim()].join('|');
}

export function parseExpenseSheet(
  text: string,
  stores: StoreAlias[],
  options: { existingKeys?: Set<string> } = {}
): ParsedSheet {
  const parsed = parseDelimited(text);
  const errors: Array<{ line: number; message: string }> = [];
  if (!parsed.length) return { rows: [], errors: [{ line: 1, message: '没有可读取的数据' }], duplicates: 0, lineCount: 0 };
  const header = parsed[0];
  const normalized = header.cells.map((c) => normalizeExpenseText(c));
  const index: Record<string, number> = {};
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
    const found = normalized.findIndex((cell) => headerIndex(cell, key) >= 0);
    if (found < 0 && key !== 'memo') {
      errors.push({ line: header.line, message: `表头缺少“${HEADER_ALIASES[key][0]}”列` });
    }
    index[key] = found;
  }
  if (errors.length) return { rows: [], errors, duplicates: 0, lineCount: Math.max(0, parsed.length - 1) };

  const rows: ParsedSheet['rows'] = [];
  const seen = new Set(options.existingKeys || []);
  let duplicates = 0;
  for (const entry of parsed.slice(1)) {
    const cell = (key: string) => (index[key] >= 0 ? entry.cells[index[key]] ?? '' : '');
    try {
      const date = parseExpenseDate(cell('date'));
      const storeId = resolveExpenseStore(stores, cell('store'));
      const category = resolveExpenseCategory(cell('category'));
      const amountCents = parseExpenseAmount(cell('amount'));
      const memo = String(cell('memo') || '').trim().slice(0, 120);
      const row = {
        line: entry.line,
        date,
        storeId,
        storeName: storeId === 'brand' ? '品牌零售 / 总部' : stores.find((s) => s.id === storeId)?.name || storeId,
        category: category.id,
        categoryName: category.name,
        amountCents,
        memo
      };
      const key = expenseKey(row);
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      rows.push(row);
    } catch (error) {
      errors.push({ line: entry.line, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { rows, errors, duplicates, lineCount: Math.max(0, parsed.length - 1) };
}

export function sampleExpenseText(today: string): string {
  return [
    '日期,门店,类别,金额,备注',
    `${today},上海·城市中心店,人力,68,演示：当日人力，可按实际替换`,
    `${today},上海·城市中心店,租金,45,演示：租金日摊`,
    `${today},上海·城市中心店,总部管理费,12,演示：总部管理费分摊`,
    `${today},上海·城市中心店,水电物业,8,演示：当日水电物业`
  ].join('\n');
}

export function sampleMultiStoreExpenseText(today: string, storeNames: string[]): string {
  const lines = ['日期,门店,类别,金额,备注'];
  for (const name of storeNames) {
    lines.push(`${today},${name},人力,68,演示：当日人力，可按实际替换`);
    lines.push(`${today},${name},租金,45,演示：租金日摊`);
    lines.push(`${today},${name},总部管理费,12,演示：总部管理费分摊`);
    lines.push(`${today},${name},水电物业,8,演示：当日水电物业`);
  }
  return lines.join('\n');
}
