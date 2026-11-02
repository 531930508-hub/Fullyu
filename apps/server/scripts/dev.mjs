/**
 * 开发模式运行器：tsc --watch 增量编译 + node --watch 自动重启。
 *
 * 为什么不用 tsx/esbuild：NestJS 的构造函数注入依赖 `emitDecoratorMetadata`
 * （Reflect design:paramtypes），esbuild 不生成这份元数据，服务会被注入成
 * undefined，所有接口都 500。这里用仓库里已有的 TypeScript 编译器，保证
 * 开发态与 `pnpm build` 产物行为一致，且不引入新依赖。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const serverDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const entry = path.join(serverDir, 'dist', 'main.js');
const tscArgs = ['-p', 'tsconfig.build.json'];

console.log('[dev] 首次编译中…');
const first = spawnSync('tsc', tscArgs, { cwd: serverDir, stdio: 'inherit', shell: true });
if (first.status !== 0 || !fs.existsSync(entry)) {
  console.error('[dev] 首次编译失败，请先修复类型错误');
  process.exit(first.status || 1);
}

const children = [];
const start = (command, args) => {
  const child = spawn(command, args, { cwd: serverDir, stdio: 'inherit', shell: true });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[dev] ${command} 退出（code=${code} signal=${signal}），停止开发服务`);
      stop(code ?? 1);
    }
  });
  return child;
};

let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
};

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('tsc', [...tscArgs, '--watch', '--preserveWatchOutput']);
start('node', ['--watch', 'dist/main.js']);
