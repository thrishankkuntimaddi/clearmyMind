import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/clearmyMind/',
  server: {
    // Vite's HMR WebSocket always lives at the server root, not at `base`.
    // Without this, the HMR client tries ws://localhost:5173/clearmyMind?token=…
    // which fails and causes an infinite reconnect flood in the console.
    hmr: {
      host: 'localhost',
      port: 5173,
      protocol: 'ws',
    },
  },
})
