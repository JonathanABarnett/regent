import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5876,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? { protocol: "ws", host, port: 5877 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Pixi into its own chunk so React shell ships first
          pixi: ["pixi.js"],
          // React core
          react: ["react", "react-dom"],
          // Zod, Zustand, simplex-noise — small deps that don't change often
          vendor: ["zod", "zustand", "simplex-noise"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
