import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cachedClient: ReturnType<typeof createClient> | null = null;

function normalizeSupabaseProjectUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Supabase URL is empty.");
  }

  // Accept host-like values from env secrets (e.g. abcdef.supabase.co) and normalize.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const projectRootUrl = withProtocol.replace(/\/rest\/v1\/?$/i, "");

  let parsed: URL;
  try {
    parsed = new URL(projectRootUrl);
  } catch {
    throw new Error(
      "Invalid Supabase URL. Use the project URL like https://<project-ref>.supabase.co (not a relative path).",
    );
  }

  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error(
      "Invalid Supabase URL path. Use the project root URL only (for example: https://<project-ref>.supabase.co).",
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export const getSupabaseClient = () => {
  if (cachedClient) {
    return cachedClient;
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (legacy NEXT_PUBLIC_* names are also accepted)",
    );
  }

  cachedClient = createClient(normalizeSupabaseProjectUrl(supabaseUrl), supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "how-we-roll-supabase-auth",
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });

  return cachedClient;
};

const slugAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";

/** Random segment for room slugs (unguessable suffix). */
export const makeSecretRoomSuffix = (length = 8) => {
  let segment = "";
  for (let i = 0; i < length; i += 1) {
    segment += slugAlphabet[Math.floor(Math.random() * slugAlphabet.length)];
  }
  return segment;
};

/** Random base segment (no hyphens inside). */
export const makeRoomSlug = () => {
  let slug = "";
  for (let i = 0; i < 10; i += 1) {
    slug += slugAlphabet[Math.floor(Math.random() * slugAlphabet.length)];
  }
  return slug;
};

/** Fully random room id: base + secret (for “Generate random room”). */
export const makeFullRandomRoomSlug = () => `${makeRoomSlug()}-${makeSecretRoomSuffix()}`;

/** Max total slug length (must match DB check). */
export const ROOM_SLUG_MAX_LENGTH = 72;

export const normalizeRoomSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, ROOM_SLUG_MAX_LENGTH);

/** Join / paste: full slug including secret suffix. */
export const isValidRoomSlug = (value: string) =>
  new RegExp(`^[a-z0-9][a-z0-9-]{2,${ROOM_SLUG_MAX_LENGTH - 1}}$`).test(value);

const SECRET_SUFFIX_LEN = 8;

/** Label typed before “Create room” (we append -{secret}). Shorter than full join slug OK. */
export const isValidRoomCreatePrefix = (value: string) => {
  const v = value.replace(/-+$/g, "");
  const maxPrefix = ROOM_SLUG_MAX_LENGTH - SECRET_SUFFIX_LEN - 1;
  if (v.length < 1 || v.length > maxPrefix) {
    return false;
  }
  return /^[a-z0-9][a-z0-9-]*$/.test(v);
};

/**
 * Final slug when creating a room: user prefix + unguessable suffix.
 * Keeps total length within ROOM_SLUG_MAX_LENGTH.
 */
export const buildRoomSlugWithSecret = (normalizedPrefix: string) => {
  const secret = makeSecretRoomSuffix(SECRET_SUFFIX_LEN);
  const hyphen = 1;
  const maxBase = ROOM_SLUG_MAX_LENGTH - secret.length - hyphen;
  const base = normalizedPrefix.replace(/-+$/g, "").slice(0, Math.max(0, maxBase));
  if (!base) {
    return makeFullRandomRoomSlug();
  }
  return `${base}-${secret}`;
};

export const makeSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getStableColor = (seed: string) => {
  const palette = [
    "#EF4444",
    "#F97316",
    "#F59E0B",
    "#84CC16",
    "#22C55E",
    "#14B8A6",
    "#06B6D4",
    "#3B82F6",
    "#6366F1",
    "#8B5CF6",
    "#A855F7",
    "#EC4899",
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return palette[Math.abs(hash) % palette.length];
};
