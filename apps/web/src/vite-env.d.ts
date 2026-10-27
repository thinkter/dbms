/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KHOJI_LIVE?: string;
  readonly VITE_KHOJI_AGENT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
