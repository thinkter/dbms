import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/agents": {
        target: "https://khoji-fraud-agent.ashmangamer0406.workers.dev",
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: "https://khoji-fraud-agent.ashmangamer0406.workers.dev",
        changeOrigin: true,
      },
    },
  },
});
