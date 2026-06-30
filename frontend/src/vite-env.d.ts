/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base domain used to preview tenant subdomains (slug.<BASE_DOMAIN>). */
  readonly VITE_BASE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
