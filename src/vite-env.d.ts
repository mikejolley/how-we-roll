/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** GitHub Pages project folder (repo name), e.g. how-we-roll — set in CI for OAuth redirectTo */
  readonly VITE_PUBLIC_BASE_PATH?: string;
  /** Optional full URL override for OAuth return, e.g. custom domain */
  readonly VITE_OAUTH_REDIRECT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
