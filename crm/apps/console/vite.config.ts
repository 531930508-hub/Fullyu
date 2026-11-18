import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * 中后台平台壳。
 *
 * base 与线上挂载点一致（/admin/），路由用 hash，免 nginx rewrite。
 * 开发端口避开 CRM 服务端（3000）与在场后台（5173）。
 */
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 权限码与业务常量与 CRM 服务端共用同一份源文件
      '@fullyu/crm-shared': resolve(__dirname, '../../packages/shared/src/index.ts')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
