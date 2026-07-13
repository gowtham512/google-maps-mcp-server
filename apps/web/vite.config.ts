import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // appType 'spa' (default) already serves index.html for all non-asset routes
  // in dev mode — no extra config needed. Nginx handles it in production via
  // try_files $uri $uri/ /index.html in nginx.conf.
})
