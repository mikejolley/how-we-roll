import { getSupabaseClient } from "./lib/supabase";

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
