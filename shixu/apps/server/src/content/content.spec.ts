import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { UPLOAD_ROOT } from '../common/assets';

/** 生成指定尺寸的合法 PNG，用来验证服务端尺寸与签名校验。 */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const PORTRAIT = png(1600, 900).toString('base64');
const WRONG_SIZE = png(800, 600).toString('base64');

describe('首页内容配置', () => {
  let h: Harness;
  let token: string;
  const files: string[] = [];

  beforeAll(async () => {
    h = await createHarness();
    token = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    for (const key of files) fs.rmSync(path.join(UPLOAD_ROOT, key), { force: true });
    await h.close();
  });

  const track = (url: string) => {
    const key = url.replace(/^.*\/uploads\//, '');
    if (key && key !== url) files.push(key);
    return key;
  };

  it('后台读取首页内容：空轮播、8 个系列槽位与商品选项', async () => {
    const res = await h.api('get', '/admin/content', token);
    expect(res.status).toBe(200);
    expect(res.body.banners).toEqual([]);
    expect(res.body.series).toHaveLength(8);
    expect(res.body.series.map((row: { key: string }) => row.key)).toEqual([
      'xing-zh',
      'song-zh',
      'qing-zh',
      'mian-zh',
      'xing-en',
      'song-en',
      'qing-en',
      'mian-en'
    ]);
    expect(res.body.series.every((row: { imageUrl: string }) => row.imageUrl === '')).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it('新建轮播：保存 1600×900 图片，顾客首页拿到站内跳转', async () => {
    const res = await h.api('post', '/admin/banners', token, {
      title: '春日醒系列',
      base64: PORTRAIT,
      contentType: 'image/png',
      linkType: 'series',
      linkValue: 'xing',
      active: true
    });
    expect(res.status).toBe(201);
    const banner = res.body.banner;
    expect(banner.imageUrl).toMatch(/^https?:\/\/.+\/uploads\/home\/banners\/.+\.png$/);
    expect(track(banner.imageUrl)).toBeTruthy();
    expect(banner.linkType).toBe('series');
    expect(banner.linkValue).toBe('xing');
    expect(banner.active).toBe(true);

    const boot = await h.api('get', '/customer/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.home.banners).toHaveLength(1);
    expect(boot.body.home.banners[0]).toMatchObject({
      id: banner.id,
      imageUrl: banner.imageUrl,
      linkType: 'series',
      linkValue: 'xing'
    });
  });

  it('拒绝非 1600×900 的轮播图，并说明当前尺寸', async () => {
    const res = await h.api('post', '/admin/banners', token, {
      title: '尺寸不对',
      base64: WRONG_SIZE,
      contentType: 'image/png',
      linkType: 'none'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('1600×900');
    expect(res.body.message).toContain('800×600');
  });

  it('拒绝不存在的商品跳转与非法链接类型', async () => {
    const missing = await h.api('post', '/admin/banners', token, {
      title: '坏商品',
      base64: PORTRAIT,
      contentType: 'image/png',
      linkType: 'product',
      linkValue: 'not-exists'
    });
    expect(missing.status).toBe(400);

    const invalid = await h.api('post', '/admin/banners', token, {
      title: '坏链接',
      base64: PORTRAIT,
      contentType: 'image/png',
      linkType: 'external',
      linkValue: 'https://example.com'
    });
    expect(invalid.status).toBe(400);
  });

  it('停用后顾客不可见；排序按后台顺序返回；删除会清理图片', async () => {
    const first = await h.api('post', '/admin/banners', token, {
      title: '第一屏',
      base64: PORTRAIT,
      contentType: 'image/png',
      linkType: 'menu'
    });
    const second = await h.api('post', '/admin/banners', token, {
      title: '第二屏',
      base64: PORTRAIT,
      contentType: 'image/png',
      linkType: 'retail'
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    track(first.body.banner.imageUrl);
    track(second.body.banner.imageUrl);

    const list = await h.api('get', '/admin/content', token);
    expect(list.body.banners.map((row: { title: string }) => row.title)).toEqual([
      '春日醒系列',
      '第一屏',
      '第二屏'
    ]);
    const [a, b] = list.body.banners as Array<{ id: string }>;

    const reordered = await h.api('put', '/admin/banners/order', token, {
      ids: [list.body.banners[2].id, b.id, a.id]
    });
    expect(reordered.status).toBe(200);
    expect(reordered.body.banners.map((row: { title: string }) => row.title)).toEqual([
      '第二屏',
      '第一屏',
      '春日醒系列'
    ]);

    const hidden = await h.api('put', `/admin/banners/${a.id}`, token, { active: false });
    expect(hidden.status).toBe(200);
    expect(hidden.body.banner.active).toBe(false);

    const boot = await h.api('get', '/customer/bootstrap');
    expect(boot.body.home.banners.map((row: { id: string }) => row.id)).toEqual([
      list.body.banners[2].id,
      b.id
    ]);

    const removed = await h.api('delete', `/admin/banners/${first.body.banner.id}`, token);
    expect(removed.status).toBe(200);
    const key = first.body.banner.imageUrl.replace(/^.*\/uploads\//, '');
    expect(fs.existsSync(path.join(UPLOAD_ROOT, key))).toBe(false);
  });

  it('系列图上传、替换与恢复：顾客只拿覆盖值，恢复后回落内置图', async () => {
    const res = await h.api('put', '/admin/content/series/xing-zh', token, {
      base64: PORTRAIT,
      contentType: 'image/png'
    });
    expect(res.status).toBe(200);
    const firstUrl = res.body.series.find((row: { key: string }) => row.key === 'xing-zh').imageUrl as string;
    expect(firstUrl).toMatch(/^https?:\/\/.+\/uploads\/home\/series\/xing-zh-.+\.png$/);
    const firstKey = track(firstUrl);

    let boot = await h.api('get', '/customer/bootstrap');
    expect(boot.body.home.series['xing-zh']).toBe(firstUrl);
    expect(fs.existsSync(path.join(UPLOAD_ROOT, firstKey))).toBe(true);

    const replaced = await h.api('put', '/admin/content/series/xing-zh', token, {
      base64: PORTRAIT,
      contentType: 'image/png'
    });
    const secondUrl = replaced.body.series.find((row: { key: string }) => row.key === 'xing-zh').imageUrl as string;
    track(secondUrl);
    expect(secondUrl).not.toBe(firstUrl);
    expect(fs.existsSync(path.join(UPLOAD_ROOT, firstKey))).toBe(false);

    const reset = await h.api('delete', '/admin/content/series/xing-zh', token);
    expect(reset.status).toBe(200);
    expect(reset.body.series.find((row: { key: string }) => row.key === 'xing-zh').imageUrl).toBe('');

    boot = await h.api('get', '/customer/bootstrap');
    expect(boot.body.home.series['xing-zh']).toBeUndefined();
    const secondKey = secondUrl.replace(/^.*\/uploads\//, '');
    expect(fs.existsSync(path.join(UPLOAD_ROOT, secondKey))).toBe(false);
  });

  it('系列图同样必须是 1600×900，非法 key 直接拒绝', async () => {
    const wrong = await h.api('put', '/admin/content/series/song-en', token, {
      base64: WRONG_SIZE,
      contentType: 'image/png'
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toContain('1600×900');

    const badKey = await h.api('put', '/admin/content/series/unknown-zh', token, {
      base64: PORTRAIT,
      contentType: 'image/png'
    });
    expect(badKey.status).toBe(400);
  });
});
