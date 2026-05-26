import { defineConfig } from 'vite'

export default defineConfig({
  root: './src',
  base: '/tools/velocity-calculator/',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: './src/index.html'
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
