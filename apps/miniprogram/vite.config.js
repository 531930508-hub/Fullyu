import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  plugins: [uni()],
  // 部署到子路径（如 https://域名/mp/）时用 VITE_BASE=/mp/ 构建；本地开发保持 /。
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});
