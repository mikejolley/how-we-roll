import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  isValidRoomSlug,
  makeSecretRoomSuffix,
  normalizeRoomSlug,
} from "../lib/supabase";
import { AsciiTitle } from "./AsciiTitle";

type RoomJoinFormProps = {
  initialSlug?: string;
};

const ROOM_ADJECTIVES = [
  "aggressive",
  "brave",
  "calm",
  "clever",
  "curious",
  "daring",
  "eager",
  "fierce",
  "gentle",
  "jolly",
  "kind",
  "lucky",
  "mighty",
  "nimble",
  "playful",
  "steady",
  "swift",
  "wild",
];

const ROOM_ANIMALS = [
  "otter",
  "fox",
  "owl",
  "panda",
  "dolphin",
  "wolf",
  "falcon",
  "koala",
  "badger",
  "beaver",
  "tiger",
  "lion",
  "rabbit",
  "gecko",
  "whale",
  "sparrow",
  "cougar",
  "lemur",
];

export function RoomJoinForm({ initialSlug = "" }: RoomJoinFormProps) {
  const navigate = useNavigate();
  const [roomSlug, setRoomSlug] = useState(normalizeRoomSlug(initialSlug));
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authIdentity, setAuthIdentity] = useState<string>("");
  const [myRooms, setMyRooms] = useState<Array<{ id: string; slug: string; created_at: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [supabaseUnavailable, setSupabaseUnavailable] = useState(false);

  const normalized = useMemo(() => normalizeRoomSlug(roomSlug), [roomSlug]);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      setSupabaseUnavailable(true);
      return;
    }

    const bootstrap = async () => {
      const [{ data: sessionData }, profileResult] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      setAuthSession(sessionData.session ?? null);

      if (!profileResult.error && profileResult.data.user) {
        const user = profileResult.data.user;
        const identity =
          (user.user_metadata?.user_name as string | undefined) ||
          (user.user_metadata?.preferred_username as string | undefined) ||
          user.email ||
          user.id;
        setAuthIdentity(identity);

        const roomsResult = await supabase
          .from("rooms")
          .select("id,slug,created_at")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false });
        if (!roomsResult.error) {
          setMyRooms((roomsResult.data ?? []) as Array<{ id: string; slug: string; created_at: string }>);
        }
      } else {
        setAuthIdentity("");
      }
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthSession(nextSession);

      if (!nextSession?.user) {
        setAuthIdentity("");
        setMyRooms([]);
        return;
      }

      const identity =
        (nextSession.user.user_metadata?.user_name as string | undefined) ||
        (nextSession.user.user_metadata?.preferred_username as string | undefined) ||
        nextSession.user.email ||
        nextSession.user.id;
      setAuthIdentity(identity);
      void refreshRooms();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidRoomSlug(normalized)) {
      return;
    }

    navigate(`/r/${normalized}`);
  };

  const refreshRooms = async () => {
    const supabase = getSupabaseClient();
    const userResult = await supabase.auth.getUser();
    if (userResult.error || !userResult.data.user) {
      setMyRooms([]);
      return;
    }

    const roomsResult = await supabase
      .from("rooms")
      .select("id,slug,created_at")
      .eq("owner_user_id", userResult.data.user.id)
      .order("created_at", { ascending: false });

    if (!roomsResult.error) {
      setMyRooms((roomsResult.data ?? []) as Array<{ id: string; slug: string; created_at: string }>);
    }
  };

  const signInWithGitHub = async () => {
    if (supabaseUnavailable) {
      return;
    }
    const supabase = getSupabaseClient();
    setErrorMessage("");

    const redirectTo = `${window.location.origin}/`;

    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
      },
    });
  };

  const signOut = async () => {
    if (supabaseUnavailable) {
      return;
    }
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setAuthSession(null);
    setAuthIdentity("");
    setMyRooms([]);
  };

  const createRoom = async () => {
    if (supabaseUnavailable) {
      setErrorMessage(
        "Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
      );
      return;
    }
    if (!isValidRoomSlug(normalized)) {
      setErrorMessage("Enter a valid room label (3-72 chars, letters/numbers/hyphens).");
      return;
    }

    const supabase = getSupabaseClient();
    setBusy(true);
    setErrorMessage("");

    const { data: userResult } = await supabase.auth.getUser();
    const currentUser = authSession?.user ?? userResult.user;

    if (!currentUser) {
      setBusy(false);
      setErrorMessage("Sign in with GitHub to create rooms.");
      return;
    }

    const finalSlug = normalized;

    const githubUsername =
      (currentUser.user_metadata?.user_name as string | undefined) ||
      (currentUser.user_metadata?.preferred_username as string | undefined) ||
      (currentUser.user_metadata?.name as string | undefined) ||
      currentUser.email ||
      "unknown";

    const roomInsert = await supabase
      .from("rooms")
      .insert({
        slug: finalSlug,
        owner_user_id: currentUser.id,
        owner_github_username: githubUsername.slice(0, 39),
        last_active_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    setBusy(false);

    if (roomInsert.error) {
      setErrorMessage(roomInsert.error.message);
      return;
    }

    setRoomSlug(finalSlug);
    await refreshRooms();
    navigate(`/r/${finalSlug}`);
  };

  const deleteRoom = async (roomId: string) => {
    const confirmed = window.confirm("Delete this room and all responses?");
    if (!confirmed) {
      return;
    }

    if (supabaseUnavailable) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();
    const userResult = await supabase.auth.getUser();
    const currentUser = authSession?.user ?? userResult.data.user;

    if (!currentUser) {
      setBusy(false);
      setErrorMessage("Your session expired. Sign in again to delete rooms.");
      return;
    }

    const result = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomId)
      .eq("owner_user_id", currentUser.id)
      .select("id");

    setBusy(false);

    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }

    if (!result.data || result.data.length === 0) {
      setErrorMessage("Could not delete this room. Refresh and try again.");
      return;
    }

    await refreshRooms();
  };

  const generateDescriptiveAnimalName = () => {
    const adjective = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)];
    const animal = ROOM_ANIMALS[Math.floor(Math.random() * ROOM_ANIMALS.length)];
    const generated = `${adjective}-${animal}-${makeSecretRoomSuffix(6)}`;
    setRoomSlug(normalizeRoomSlug(generated));
  };

  return (
    <form className="card roomJoinForm" onSubmit={handleSubmit}>
      <AsciiTitle />
      {authSession ? (
        <p className="success">
          Signed in as {authIdentity || "GitHub user"}.{" "}
          <button type="button" className="inlineLink" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      ) : null}
      {supabaseUnavailable ? (
        <p className="tiny warning">
          Supabase setup missing. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
          in <code>.env.local</code>, then restart <code>npm run dev</code>.
        </p>
      ) : null}
      <label className="fieldLabel" htmlFor="roomSlug">
        Create or join a room to start plotting your team.
      </label>
      <div className="row">
        <input
          id="roomSlug"
          name="roomSlug"
          autoFocus
          value={roomSlug}
          onChange={(event) => setRoomSlug(normalizeRoomSlug(event.target.value))}
          placeholder="e.g. team-meetup-2026"
          required
          className="input"
        />
        {authSession ? (
          <button
            type="button"
            className="button iconButton"
            aria-label="Generate"
            onClick={generateDescriptiveAnimalName}
          >
            ⚙
          </button>
        ) : null}
      </div>
      <div className="row">
        <button type="submit" className="button">
          Join
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => void createRoom()}
          disabled={!authSession || busy}
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
      {!authSession ? (
        <button type="button" className="button" onClick={() => void signInWithGitHub()} disabled={busy}>
          Sign in with GitHub to create rooms
        </button>
      ) : null}

      {myRooms.length > 0 ? (
        <div className="yourRoomsSection">
          <div className="sectionDivider" />
          <h2 className="yourRoomsHeading">Your rooms</h2>
          <ul className="roomList">
            {myRooms.map((room) => (
              <li key={room.id}>
                <button type="button" className="linkButton" onClick={() => navigate(`/r/${room.slug}`)}>
                  {room.slug}
                </button>
                <button
                  type="button"
                  className="button danger deleteIconButton"
                  aria-label={`Delete ${room.slug}`}
                  title={`Delete ${room.slug}`}
                  disabled={busy}
                  onClick={() => void deleteRoom(room.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="deleteIconSvg">
                    <path
                      d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v7M14 10v7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {errorMessage ? <p className="tiny warning">{errorMessage}</p> : null}
    </form>
  );
}
