import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      // Proxy API calls to the Fastify server in dev.
      "/api": { target: "http://localhost:8790", changeOrigin: true },
    },
  },
});
