import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

function fixFileProtocol() {
  return {
    name: 'fix-file-protocol',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist/build/h5/index.html')
      try {
        let html = readFileSync(htmlPath, 'utf-8')
        // Remove module detection scripts
        html = html.replace(/<script type="module">import\.meta\.url[\s\S]*?<\/script>/g, '')
        html = html.replace(/<script type="module">!function\(\)\{if\(window\.__vite_is_modern_browser[\s\S]*?<\/script>/g, '')
        // Remove nomodule attributes so legacy scripts always load
        html = html.replace(/ nomodule/g, '')
        // Remove the main module entry (legacy entry will be used)
        html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, '')
        // Remove crossorigin from remaining scripts (not needed for file://)
        html = html.replace(/ crossorigin/g, '')
        writeFileSync(htmlPath, html)
        console.log('\n✅ Fixed index.html for file:// protocol support')
      } catch (e) {
        // ignore in dev mode
      }
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [
    uni(),
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderLegacyChunks: true,
    }),
    fixFileProtocol(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
