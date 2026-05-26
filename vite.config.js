import { defineConfig } from 'vite'

export default defineConfig({
  root: './tools/velocity-calculator',
  base: '/tools/velocity-calculator/',
  publicDir: false,
  build: {
    outDir: '../../dist/tools/velocity-calculator',
    emptyOutDir: true,
    rollupOptions: {
      input: './tools/velocity-calculator/index.html'
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
