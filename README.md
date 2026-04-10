# How We Roll (React + Vite)

Lightweight collaborative spectrum board for team activities, backed by Supabase Realtime.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` (or `.env`) from `.env.example`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

3. Run dev server:

```bash
npm run dev
```

## Supabase setup

Run `supabase/schema.sql` in Supabase SQL editor once per project.

### GitHub OAuth setup (required for room creation)

1. In Supabase dashboard, go to **Authentication > Providers > GitHub** and enable it.
2. Add your GitHub OAuth app client ID/secret in Supabase.
3. Add callback URL from Supabase to your GitHub OAuth app settings.
4. **Redirect URLs** in Supabase must include your app origin **without** the hash route, e.g. `http://localhost:5173/` (PKCE puts `?code=` on the origin). Do **not** use `http://localhost:5173/#/` as the only redirect.
5. Set **Site URL** to the full app URL, e.g. `https://<user>.github.io/<repo>/` (not `https://<user>.github.io/`). Under **Redirect URLs**, add the same URL (trailing slash is fine). Production builds set `VITE_PUBLIC_BASE_PATH` from the repo name in GitHub Actions so `redirectTo` is always `https://<user>.github.io/<repo>/` even when the browser pathname is wrong. For a custom domain, set repository secret `VITE_OAUTH_REDIRECT_URL` to that origin (with path if any) and add it in Supabase.

Join remains open to anyone with a room link. Creating/deleting rooms requires GitHub auth.

### Room links (obscurity)

New rooms get a random suffix appended to the name you type (e.g. `team-offsite-a7k2m9pq`). Joining only works with the **full** slug or shared URL, not a short guessable name alone.

## GitHub Pages deployment

This app uses `HashRouter`, so routes work on static hosting without rewrite rules. The production build uses a **relative asset base** (`./`), so it works under `https://<user>.github.io/<repo>/` without extra Vite config.

### Automated deploy (recommended)

1. In the GitHub repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions**, add repository secrets (optional but required for a working app in production):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`  
   These are the same names as in `.env.local`. If they are missing, the site still builds but shows the Supabase setup message until you add them and re-run the workflow.
3. Push to `main`; `.github/workflows/deploy-pages.yml` builds `dist/` and publishes it.

### Manual build

```bash
npm run build
```

Publish the `dist/` folder via the Pages UI, a `gh-pages` branch, or any static host.

## Security notes

- Never commit **`.env`**, **`.env.local`**, or any file containing real Supabase **service role** keys. Use **`.env.example`** as the template only. The repo ignores `.env` and `.env*.local` patterns that typically hold secrets.
- The frontend uses a **publishable** Supabase key; it is expected to be public (including in the built JS on GitHub Pages).
- Protect data with Supabase RLS and policies, not secret frontend keys.
- Room links are intentionally shareable; anyone with the link can join.
- Room creation/deletion is owner-only and requires GitHub auth.
- DB enforces slug format and a 20-room limit per GitHub-authenticated user.
- If you need stronger abuse protection, add CAPTCHA and/or an Edge Function for room creation.
