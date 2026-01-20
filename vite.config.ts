import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/img-judger/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将react相关库拆分为单独的chunk
          vendor: ['react', 'react-dom'],
          // 将xlsx库拆分为单独的chunk（这是最大的依赖）
          xlsx: ['xlsx'],
          // 可以将其他较大的依赖也拆分开
        }
      }
    },
    chunkSizeWarningLimit: 800, // 稍微提高警告阈值
  }
})
