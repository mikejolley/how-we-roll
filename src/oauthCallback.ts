import { getSupabaseClient } from "./lib/supabase";

/**
 * PKCE redirect must land on the app root (path included for GitHub Pages project sites).
 * Optional `VITE_OAUTH_REDIRECT_URL` overrides for custom domains; otherwise use origin + pathname.
 */
export function getOAuthRedirectUrl(): string {
  const override = import.meta.env.VITE_OAUTH_REDIRECT_URL?.trim();
  if (override) {
    return override.endsWith("/") ? override : `${override}/`;
  }

  const { origin, pathname } = window.location;
  let basePath = pathname.replace(/\/index\.html$/i, "");
  if (basePath !== "/" && !basePath.endsWith("/")) {
    basePath += "/";
  }
  return `${origin}${basePath}`;
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
  window.history.replaceState({}, "", `${url.pathname}${url.hash || "#/"}`);
}
