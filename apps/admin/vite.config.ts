import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

function fixFileProtocol() {
  return {
    name: 'fix-file-protocol',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist/index.html')
      try {
        let html = readFileSync(htmlPath, 'utf-8')
        html = html.replace(/<script type="module">import\.meta\.url[\s\S]*?<\/script>/g, '')
        html = html.replace(/<script type="module">!function\(\)\{if\(window\.__vite_is_modern_browser[\s\S]*?<\/script>/g, '')
        html = html.replace(/ nomodule/g, '')
        html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/g, '')
        html = html.replace(/ crossorigin/g, '')
        writeFileSync(htmlPath, html)
        console.log('\n\u2705 Fixed index.html for file:// protocol support')
      } catch (e) {
        // ignore in dev mode
      }
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderLegacyChunks: true,
    }),
    fixFileProtocol(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 权限码定义与后端共用同一份源文件
      '@fullyu/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        modifyVars: {
          // Full愈 品牌主题覆盖 Ant Design
          'primary-color': '#6B463C',
          'link-color': '#6B463C',
          'success-color': '#27AE60',
          'warning-color': '#F39C12',
          'error-color': '#C0392B',
          'font-size-base': '14px',
          'heading-color': '#4B3621',
          'text-color': '#4B3621',
          'text-color-secondary': '#7D665C',
          'border-radius-base': '8px',
          'border-color-base': '#D8CBBB',
          'body-background': '#F5E8D8',
          'component-background': '#FFFFFF',
        },
        javascriptEnabled: true,
      },
    },
  },
})
