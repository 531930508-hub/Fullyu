/**
 * 桌签码解析。
 *
 * 同一张桌签可能以三种内容出现：
 * 1. 小程序内扫码使用的纯文本：`门店ID|位置名`（未配置公网链接时的默认格式）。
 * 2. 微信「扫普通链接二维码打开小程序」的 https 链接：
 *    `https://域名/前缀?store=门店ID&seat=位置名`。
 *    微信识别后打开小程序，并把完整链接放进 `q` 参数。
 * 3. 小程序码 scene / 直接携带的查询参数（可能被 URL 编码一次或两次）。
 *
 * 解析结果只包含门店 id 与位置名，不带任何价格或用户信息；
 * 门店是否可用、位置是否仍存在，由首页拿到目录后再校验。
 */
const STORE_KEYS = ['store', 'storeid', 'store_id', 'shop', 'shopid'];
const SEAT_KEYS = ['seat', 'table', 'tableid', 'table_id', 'position', 'pos'];

const STORE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** 微信会按需编码 scene / q，最多解两层，避免双重编码导致中文位置名无法匹配。 */
function decodeDeep(text) {
  let out = String(text == null ? '' : text);
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch (error) {
      break;
    }
  }
  return out;
}

function queryParams(text) {
  const params = {};
  text.split('&').forEach((pair) => {
    if (!pair) return;
    const index = pair.indexOf('=');
    const key = decodeDeep(index === -1 ? pair : pair.slice(0, index)).trim().toLowerCase();
    if (!key || params[key] != null) return;
    const value = index === -1 ? '' : decodeDeep(pair.slice(index + 1)).trim();
    if (value) params[key] = value;
  });
  return params;
}

function pick(params, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    if (params[keys[i]]) return params[keys[i]];
  }
  return '';
}

function normalize(storeId, seat) {
  const id = String(storeId || '').trim();
  const value = String(seat || '').trim().slice(0, 30);
  if (!STORE_PATTERN.test(id) || !value) return null;
  return { storeId: id, seat: value };
}

/** 判断一段文本是否已经具备 URL / 查询参数结构（编码过的 scene 需先解码再看）。 */
function hasStructure(text) {
  return (
    /^https?:\/\//i.test(text) ||
    text.indexOf('?') !== -1 ||
    /(^|&)(store|storeid|store_id|seat|table|scene|q)=/i.test(text)
  );
}

export function parseTableCode(raw, depth = 0) {
  if (depth > 3) return null;
  const original = String(raw == null ? '' : raw).trim();
  if (!original) return null;

  // 整段被编码（小程序码 scene）时才整体解码；URL 里的 q 值要保持编码，
  // 否则内层链接的 & 会和外层参数混在一起。
  let value = original;
  if (!hasStructure(value)) {
    const decoded = decodeDeep(value);
    if (decoded !== value && hasStructure(decoded)) value = decoded;
  }

  if (hasStructure(value)) {
    const noHash = value.split('#')[0];
    const index = noHash.indexOf('?');
    const query = index === -1 ? noHash : noHash.slice(index + 1);
    const params = query && query.indexOf('=') !== -1 ? queryParams(query) : {};

    // 微信把普通链接二维码的原始链接放在 q，小程序码放在 scene，二者都可能再次编码。
    const nested = params.q || params.scene;
    if (nested) {
      const parsed = parseTableCode(nested, depth + 1);
      if (parsed) return parsed;
    }

    return normalize(pick(params, STORE_KEYS), pick(params, SEAT_KEYS));
  }

  const text = decodeDeep(value);
  const match =
    text.match(/^([A-Za-z0-9_-]{1,40})\s*[|#,/]\s*(.{1,30})$/) ||
    text.match(/([A-Za-z0-9_-]{1,40})\s*[|#]\s*(.{1,30})$/);
  if (!match) return null;
  return normalize(match[1], match[2]);
}

export default parseTableCode;
