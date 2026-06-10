import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the API runs on :3000; proxy API paths so the SPA can use same-origin
// relative URLs (which also work when the built app is served by Fastify).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/repos": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
  build: { outDir: "dist" },
});
