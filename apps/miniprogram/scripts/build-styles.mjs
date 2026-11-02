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
css = css.replace(/:root\s*\{/, 'page,\n:root {');
css = `/* 自动生成：由 teahour.source.css 按 750rpx/400px=1.875 换算。请修改源文件后运行 styles 脚本。 */\n${css}`;

fs.writeFileSync(target, css);
console.log(`styles: ${path.relative(root, target)} (${Buffer.byteLength(css)} bytes)`);
