import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    open: false,
    // Keeps Vite logs in your terminal instead of clearing the screen (helps on Windows/PowerShell).
    clearScreen: false,
  },
})
