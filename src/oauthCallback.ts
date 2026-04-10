import { getSupabaseClient } from "./lib/supabase";

/**
 * PKCE redirect must land on the deployed app root, including a GitHub Pages project path
 * (e.g. /how-we-roll/). `window.location.origin + "/"` is wrong there — it sends users to the
 * user-site root instead of the repo URL.
 */
export function getOAuthRedirectUrl(): string {
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
