import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "../apps/web/dist",
  plugins: [cloudflare({ viteEnvironment: { name: "worker" } })],
  environments: {
    worker: {
      build: { sourcemap: true },
    },
  },
});
