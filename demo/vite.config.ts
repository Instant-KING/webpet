import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 纯前端 demo：不依赖 playground 的编辑器后端插件
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, open: false },
})
