// 把按 400px 设计稿书写的 teahour.source.css 换算成小程序 rpx（750rpx / 400px = 1.875）。
// 用法：pnpm --filter @teahour/miniprogram styles
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src/styles/teahour.source.css');
const target = path.join(root, 'src/styles/teahour.css');

const toRpx = (match, value) => {
  const number = Number.parseFloat(value);
  if (!number) return match;
  const rpx = Math.round(number * 1.875 * 100) / 100;
  return `${String(rpx).replace(/\.0+$/, '')}rpx`;
};

let css = fs.readFileSync(source, 'utf8');
css = css.replace(/(-?\d*\.?\d+)px/g, toRpx);
// 小程序 WXSS 不认识 :root。若把 token 写成 `page, :root {…}`，微信会因选择器列表
// 含非法项而丢掉整条规则，所有 var(--token) 全部失效（页面变白、按钮无底色）。
// 因此拆成两条独立规则：page 供小程序，:root 供 H5；两条各自独立失效互不影响。
css = css.replace(/:root\s*\{([\s\S]*?)\n\}/, (_, body) => `page {${body}\n}\n:root {${body}\n}`);
css = `/* 自动生成：由 teahour.source.css 按 750rpx/400px=1.875 换算。请修改源文件后运行 styles 脚本。 */\n${css}`;

fs.writeFileSync(target, css);
console.log(`styles: ${path.relative(root, target)} (${Buffer.byteLength(css)} bytes)`);
