import { getSupabaseClient } from "./lib/supabase";

/**
 * PKCE redirect must land on the deployed app root, including a GitHub Pages **project** path
 * (e.g. /how-we-roll/). `origin + "/"` is wrong — Supabase then falls back to Site URL and you
 * end up at https://user.github.io/?code=... with no app.
 *
 * Priority: full URL override → build-time base path (CI sets this from the repo name) → pathname.
 */
export function getOAuthRedirectUrl(): string {
  const fullOverride = import.meta.env.VITE_OAUTH_REDIRECT_URL?.trim();
  if (fullOverride) {
    return fullOverride.endsWith("/") ? fullOverride : `${fullOverride}/`;
  }

  const baseSegment = import.meta.env.VITE_PUBLIC_BASE_PATH?.trim().replace(/^\/+|\/+$/g, "");
  if (baseSegment) {
    return `${window.location.origin}/${baseSegment}/`;
  }

  const { origin, pathname } = window.location;
  let path = pathname.replace(/\/index\.html$/i, "");
  if (path !== "/" && !path.endsWith("/")) {
    path += "/";
  }
  return `${origin}${path}`;
}

/**
 * GitHub OAuth (PKCE) returns ?code= on the origin URL. HashRouter keeps routes in the hash,
 * so redirect must NOT use window.location.href (which includes #/... and breaks detection).
 * Call once on app load to exchange the code and strip query params.
 */
export async function finishOAuthRedirectIfPresent(): Promise<void> {
  let supabase: ReturnType<typeof getSupabaseClient>;
  try {
    supabase = getSupabaseClient();
  } catch {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has("code")) {
    return;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
  if (error) {
    console.error("OAuth session exchange failed:", error.message);
    return;
  }

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  const clean = `${url.pathname}${url.hash || "#/"}`;
  window.history.replaceState({}, "", clean);
}
