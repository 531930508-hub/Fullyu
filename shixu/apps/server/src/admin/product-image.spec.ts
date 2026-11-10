import fs from 'node:fs';
import path from 'node:path';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { UPLOAD_ROOT } from '../common/assets';

/** 1×1 透明 PNG，用来走真实图片落盘与静态地址链路。 */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('商品图片上传', () => {
  let h: Harness;
  let token: string;
  const keys: string[] = [];

  beforeAll(async () => {
    h = await createHarness();
    token = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    for (const key of keys) fs.rmSync(path.join(UPLOAD_ROOT, key), { force: true });
    await h.close();
  });

  it('上传后商品、后台列表与顾客目录都返回可访问的图片地址', async () => {
    const res = await h.api('post', '/admin/products/xing-0/image', token, {
      base64: TINY_PNG,
      contentType: 'image/png'
    });
    expect(res.status).toBe(201);
    const imageUrl = res.body.product.imageUrl as string;
    expect(imageUrl).toMatch(/^https?:\/\/.+\/uploads\/products\/xing-0-.+\.png$/);

    const key = imageUrl.replace(/^.*\/uploads\//, '');
    keys.push(key);
    expect(fs.existsSync(path.join(UPLOAD_ROOT, key))).toBe(true);

    const list = await h.api('get', '/admin/products', token);
    const adminRow = list.body.products.find((item: { id: string }) => item.id === 'xing-0');
    expect(adminRow.imageUrl).toBe(imageUrl);

    const bootstrap = await h.api('get', '/customer/bootstrap');
    const publicRow = bootstrap.body.products.find((item: { id: string }) => item.id === 'xing-0');
    expect(publicRow.imageUrl).toBe(imageUrl);
  });

  it('拒绝内容与声明格式不符的上传', async () => {
    const res = await h.api('post', '/admin/products/xing-0/image', token, {
      base64: Buffer.from('not an image').toString('base64'),
      contentType: 'image/png'
    });
    expect(res.status).toBe(400);
  });

  it('拒绝超过 2MB 的图片', async () => {
    const huge = Buffer.alloc(2 * 1024 * 1024 + 1, 7);
    const res = await h.api('post', '/admin/products/xing-0/image', token, {
      base64: huge.toString('base64'),
      contentType: 'image/png'
    });
    expect(res.status).toBe(400);
  });

  it('移除图片后回到默认插画，并清理旧文件', async () => {
    const res = await h.api('delete', '/admin/products/xing-0/image', token);
    expect(res.status).toBe(200);
    expect(res.body.product.imageUrl).toBe('');
    for (const key of keys) expect(fs.existsSync(path.join(UPLOAD_ROOT, key))).toBe(false);

    const bootstrap = await h.api('get', '/customer/bootstrap');
    const publicRow = bootstrap.body.products.find((item: { id: string }) => item.id === 'xing-0');
    expect(publicRow.imageUrl).toBe('');
  });
});
