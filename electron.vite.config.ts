import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    server: {
      // The dev server only listens on this machine.
      host: '127.0.0.1'
    }
  }
})
