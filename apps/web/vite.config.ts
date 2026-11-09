import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // The event service is authoritative; the browser never computes prices.
    proxy: {
      "/api": { target: "http://localhost:3000", rewrite: (p) => p.replace(/^\/api/, "") },
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
})
