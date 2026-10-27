import { bindings, defineConfig, exports as workerExports } from "cf/config";

const localReadConnection = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_AGENT_DB;
const localWriterConnection = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_AGENT_WRITER_DB;

export default defineConfig({
  worker: {
    name: "khoji-fraud-agent",
    entrypoint: "./src/server.ts",
    compatibilityDate: "2026-10-25",
    compatibilityFlags: ["nodejs_compat"],
    observability: { traces: { enabled: true } },
    assets: { notFoundHandling: "single-page-application" },
    env: {
      ASSETS: bindings.assets(),
      OPENAI_API_KEY: bindings.secret(),
      OPENAI_MODEL: bindings.text("gpt-6-luna"),
      AGENT_DB: bindings.hyperdrive({
        id: "910081e1926a40f4b622f19e9447431c",
        ...(localReadConnection ? { dev: { connectionString: localReadConnection } } : {}),
      }),
      AGENT_WRITER_DB: bindings.hyperdrive({
        id: "db2d5c697ec04cceb5b902f52fec3119",
        ...(localWriterConnection ? { dev: { connectionString: localWriterConnection } } : {}),
      }),
      Investigator: bindings.durableObject({
        worker: "khoji-fraud-agent",
        exportName: "Investigator",
      }),
    },
    exports: {
      Investigator: workerExports.durableObject({ storage: "sqlite" }),
    },
  },
});
