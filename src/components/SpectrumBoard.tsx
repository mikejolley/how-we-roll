import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import { AsciiTitle } from "./AsciiTitle";
import { ParticipantLegend } from "./ParticipantLegend";
import { SpectrumRow } from "./SpectrumRow";
import { EMOJI_CHOICES, QUESTIONS, SECTION_LABELS } from "../lib/questions";
import {
  getStableColor,
  getSupabaseClient,
  isValidRoomSlug,
  makeSessionId,
  normalizeRoomSlug,
} from "../lib/supabase";

type RoomGate = "loading" | "ok" | "missing" | "invalid";

export type Participant = {
  id: string;
  room_id: string;
  name: string;
  emoji: string;
  color: string;
  session_id: string;
  updated_at: string;
};

type ResponseRow = {
  room_id: string;
  participant_id: string;
  question_id: string;
  value_0_100: number;
  updated_at: string;
};

export type ResponseMap = Record<string, Record<string, number>>;

type SpectrumBoardProps = {
  roomSlug: string;
};

type QueryResult<T> = Promise<{
  data: T;
  error: Error | null;
}>;

type RoomsTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => QueryResult<{ id: string } | null>;
      single: () => QueryResult<{ id: string }>;
    };
  };
  insert: (row: { slug: string; last_active_at: string }) => {
    select: (columns: string) => {
      single: () => QueryResult<{ id: string }>;
    };
  };
};

type ParticipantsTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => QueryResult<Participant[]>;
  };
  upsert: (row: {
    id: string;
    room_id: string;
    name: string;
    emoji: string;
    color: string;
    session_id: string;
    updated_at: string;
  }) => {
    select: (columns: string) => {
      single: () => QueryResult<{ id: string }>;
    };
  };
};

type ResponsesTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => QueryResult<ResponseRow[]>;
  };
  upsert: (row: {
    room_id: string;
    participant_id: string;
    question_id: string;
    value_0_100: number;
    updated_at: string;
  }) => QueryResult<null>;
};

const buildResponseMap = (rows: ResponseRow[]) => {
  const map: ResponseMap = {};

  for (const row of rows) {
    map[row.question_id] = map[row.question_id] ?? {};
    map[row.question_id][row.participant_id] = row.value_0_100;
  }

  return map;
};

const storageKey = (roomSlug: string) => `howweroll:${roomSlug}:identity`;

const readSavedIdentity = (roomSlug: string) => {
  if (typeof window === "undefined") {
    return {
      participantId: null as string | null,
      name: "",
      emoji: "😀",
    };
  }

  const savedIdentity = window.localStorage.getItem(storageKey(roomSlug));
  if (!savedIdentity) {
    return {
      participantId: null as string | null,
      name: "",
      emoji: "😀",
    };
  }

  try {
    const parsed = JSON.parse(savedIdentity) as {
      participantId?: string;
      name?: string;
      emoji?: string;
    };

    return {
      participantId: parsed.participantId ?? null,
      name: parsed.name ?? "",
      emoji: parsed.emoji ?? "😀",
    };
  } catch {
    return {
      participantId: null as string | null,
      name: "",
      emoji: "😀",
    };
  }
};

export function SpectrumBoard({ roomSlug }: SpectrumBoardProps) {
  const initialIdentity = readSavedIdentity(roomSlug);
  const [{ client: supabase, initError: supabaseInitError }] = useState(() => {
    try {
      return { client: getSupabaseClient(), initError: null as string | null };
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : String(unknownError);
      return { client: null, initError: message };
    }
  });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [name, setName] = useState(initialIdentity.name);
  const [emoji, setEmoji] = useState(initialIdentity.emoji);
  const [presentationMode, setPresentationMode] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(initialIdentity.participantId);
  const [sessionId] = useState(() => makeSessionId());
  const [saving, setSaving] = useState(false);
  const [linkJustCopied, setLinkJustCopied] = useState(false);
  const normalizedSlug = useMemo(() => normalizeRoomSlug(roomSlug), [roomSlug]);
  const [roomGate, setRoomGate] = useState<RoomGate>(() =>
    isValidRoomSlug(normalizeRoomSlug(roomSlug)) ? "loading" : "invalid",
  );

  const roomIdRef = useRef<string | null>(null);
  const participantIdRef = useRef<string | null>(null);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  useEffect(() => {
    if (!presentationMode) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPresentationMode(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [presentationMode]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const slug = normalizedSlug;

    if (!isValidRoomSlug(slug)) {
      setRoomId(null);
      setRoomGate("invalid");
      return;
    }

    setRoomGate("loading");
    setRoomId(null);

    const roomsTable = supabase.from("rooms") as unknown as RoomsTable;

    let cancelled = false;

    const ensureRoom = async () => {
      const existing = await roomsTable.select("id").eq("slug", slug).maybeSingle();
      if (cancelled) {
        return;
      }
      if (existing.error) {
        throw existing.error;
      }

      const existingRoom = existing.data as { id: string } | null;
      if (existingRoom?.id) {
        setRoomId(existingRoom.id);
        setRoomGate("ok");
        return;
      }
      setRoomId(null);
      setRoomGate("missing");
    };

    void ensureRoom();

    return () => {
      cancelled = true;
    };
  }, [normalizedSlug, supabase]);

  useEffect(() => {
    if (!roomId || !supabase) {
      return;
    }

    const participantsTable = supabase.from("participants") as unknown as ParticipantsTable;
    const responsesTable = supabase.from("responses") as unknown as ResponsesTable;

    const loadData = async () => {
      const [participantsResult, responsesResult] = await Promise.all([
        participantsTable.select("*").eq("room_id", roomId),
        responsesTable.select("*").eq("room_id", roomId),
      ]);

      if (participantsResult.error) {
        throw participantsResult.error;
      }

      if (responsesResult.error) {
        throw responsesResult.error;
      }

      setParticipants(participantsResult.data ?? []);
      setResponses(buildResponseMap(responsesResult.data ?? []));
    };

    void loadData();

    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` },
        () => {
          void supabase
            .from("participants")
            .select("*")
            .eq("room_id", roomId)
            .then((result: { data: Participant[] | null; error: Error | null }) => {
              if (!result.error) {
                setParticipants(result.data ?? []);
              }
            });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses", filter: `room_id=eq.${roomId}` },
        () => {
          void supabase
            .from("responses")
            .select("*")
            .eq("room_id", roomId)
            .then((result: { data: ResponseRow[] | null; error: Error | null }) => {
              if (!result.error) {
                setResponses(buildResponseMap(result.data ?? []));
              }
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [roomId, supabase]);

  const ensureParticipant = useCallback(
    async ({ showSaving = false }: { showSaving?: boolean } = {}) => {
    if (!supabase || !roomId || !name.trim() || !emoji.trim()) {
      return null;
    }

    const participantsTable = supabase.from("participants") as unknown as ParticipantsTable;

      if (showSaving) {
        setSaving(true);
      }

    const participantSeed = participantId ?? `${roomId}-${sessionId}-${name.trim().toLowerCase()}`;
    const row = {
      id: participantSeed,
      room_id: roomId,
      name: name.trim(),
      emoji: emoji.trim(),
      color: getStableColor(participantSeed),
      session_id: sessionId,
      updated_at: new Date().toISOString(),
    };

    const result = await participantsTable.upsert(row).select("id").single();
      if (showSaving) {
        setSaving(false);
      }

    if (result.error) {
      throw result.error;
    }

    setParticipantId(result.data.id);
    window.localStorage.setItem(
      storageKey(roomSlug),
      JSON.stringify({ participantId: result.data.id, name: name.trim(), emoji: emoji.trim() }),
    );

    return result.data.id;
    },
    [roomId, name, emoji, participantId, roomSlug, sessionId, supabase],
  );

  const upsertResponse = useCallback(
    async (questionId: string, value: number) => {
      const rid = roomIdRef.current;
      const pid = participantIdRef.current;
      if (!supabase || !rid || !pid) {
        return;
      }

      const { error } = await supabase.from("responses").upsert({
        room_id: rid,
        participant_id: pid,
        question_id: questionId,
        value_0_100: value,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("how-we-roll: response save failed", error);
      }
    },
    [supabase],
  );

  const handleIdentitySave = async () => {
    await ensureParticipant({ showSaving: true });
  };

  const handleSliderRelease = async (questionId: string, value: number) => {
    if (!supabase) {
      return;
    }

    const activeParticipantId = (await ensureParticipant()) ?? participantId;
    if (!roomId || !activeParticipantId) {
      return;
    }

    participantIdRef.current = activeParticipantId;

    setResponses((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? {}),
        [activeParticipantId]: value,
      },
    }));

    await upsertResponse(questionId, value);
  };

  const copyRoomLink = useCallback(async () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = `#/r/${normalizedSlug}`;
    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setLinkJustCopied(true);
      window.setTimeout(() => setLinkJustCopied(false), 2000);
    } catch {
      setLinkJustCopied(false);
    }
  }, [normalizedSlug]);

  const groupedQuestions = useMemo(() => {
    return {
      "how-we-roll": QUESTIONS.filter((question) => question.section === "how-we-roll"),
      "extra-spectrums": QUESTIONS.filter((question) => question.section === "extra-spectrums"),
    };
  }, []);

  const exportJson = async () => {
    if (!roomId || !supabase) {
      return;
    }

    const roomsTable = supabase.from("rooms") as unknown as RoomsTable;
    const participantsTable = supabase.from("participants") as unknown as ParticipantsTable;
    const responsesTable = supabase.from("responses") as unknown as ResponsesTable;

    const [roomResult, participantsResult, responsesResult] = await Promise.all([
      roomsTable.select("*").eq("id", roomId).single(),
      participantsTable.select("*").eq("room_id", roomId),
      responsesTable.select("*").eq("room_id", roomId),
    ]);

    if (roomResult.error || participantsResult.error || responsesResult.error) {
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      room: roomResult.data,
      participants: participantsResult.data,
      responses: responsesResult.data,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `how-we-roll-${roomSlug}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const peopleForLegend = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name)),
    [participants],
  );
  const hasIdentity = Boolean(participantId);

  if (!supabase) {
    return (
      <main className="centeredPage">
        <section className="card">
          <h1>Supabase setup required</h1>
          <p className="muted">
            {import.meta.env.PROD ? (
              <>
                This build was produced without usable Supabase settings. Add repository secrets{" "}
                <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then
                re-run the deploy workflow. If you use the <code>github-pages</code> environment for
                secrets too, ensure those values are not empty — they override repository secrets for
                jobs attached to that environment.
              </>
            ) : (
              <>
                Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
                <code>.env.local</code>, then reload.
              </>
            )}
          </p>
          {supabaseInitError ? (
            <p className="muted tiny">
              <strong>Details:</strong> {supabaseInitError}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (roomGate === "loading") {
    return (
      <main className="centeredPage">
        <p className="muted">Loading room…</p>
      </main>
    );
  }

  if (roomGate === "invalid") {
    return (
      <main className="centeredPage">
        <section className="card">
          <h1>Invalid room</h1>
          <p className="muted">That room name is not valid. Check the link or spelling.</p>
          <p>
            <Link to="/">Back to home</Link>
          </p>
        </section>
      </main>
    );
  }

  if (roomGate === "missing") {
    return (
      <main className="centeredPage">
        <section className="card">
          <h1>Room not found</h1>
          <p className="muted">Ask the room owner to create it first from the home page.</p>
          <p>
            <Link to="/">Back to home</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="appShell">
      {presentationMode ? (
        <div className="presentationHintBar">
          Hit escape or{" "}
          <button type="button" className="inlineLink presentationHintLink" onClick={() => setPresentationMode(false)}>
            click here
          </button>{" "}
          to exit presentation mode.
        </div>
      ) : null}
      <div className={`boardPageWithStickyRail${presentationMode ? " presentationLayout" : ""}`}>
        <div className="boardMainColumn">
          {!presentationMode ? (
            <header className="card boardMainHeader">
              <div className="headerCenterCluster">
                <AsciiTitle />
                <div className="headerMetaRow headerMetaRowCentered">
                  <p className="muted tiny">
                    Room: {roomSlug}
                    <span aria-hidden> · </span>
                    <Link to="/" className="inlineLink">
                      Exit
                    </Link>
                  </p>
                  <div className="headerActionsInline headerActionsCentered">
                    <button type="button" className="button" onClick={() => void copyRoomLink()}>
                      {linkJustCopied ? "Copied!" : "Copy link"}
                    </button>
                    <button type="button" className="button" onClick={() => setPresentationMode((value) => !value)}>
                      {presentationMode ? "Exit presentation mode" : "Presentation mode"}
                    </button>
                    <button type="button" className="button" onClick={() => void exportJson()}>
                      Export JSON
                    </button>
                  </div>
                </div>
              </div>
            </header>
          ) : null}

          <main className="card boardMain">
            {!hasIdentity ? (
              <p className="identityCallout">
                Identity is required to participate! Enter your name, choose an icon, and tell everyone how you roll!
              </p>
            ) : null}
            {(["how-we-roll", "extra-spectrums"] as const).map((sectionKey) => (
              <section key={sectionKey} className="sectionBlock">
                {sectionKey === "extra-spectrums" ? <h2>{SECTION_LABELS[sectionKey]}</h2> : null}
                <div className="questionList">
                  {groupedQuestions[sectionKey].map((question) => (
                    <SpectrumRow
                      key={question.id}
                      question={question}
                      participants={participants}
                      responses={responses}
                      currentParticipantId={participantId ?? ""}
                      presentationMode={presentationMode}
                      canRespond={hasIdentity}
                      onSliderRelease={(questionId, value) => {
                        void handleSliderRelease(questionId, value);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </main>
        </div>

        <aside className="sidebarStack">
          {!presentationMode ? (
            <section className="card identityCard">
              <h2>Identity</h2>
              <label className="fieldLabel srOnly" htmlFor="nameInput">
                Name
              </label>
              <div className="row identityRow">
                <input
                  id="nameInput"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                />

                <label className="fieldLabel srOnly" htmlFor="emojiInput">
                  Icon
                </label>
                <select
                  id="emojiInput"
                  className="input emojiSelect"
                  value={emoji}
                  onChange={(event) => setEmoji(event.target.value)}
                >
                  {EMOJI_CHOICES.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
              </div>

              <button type="button" className="button primary" onClick={() => void handleIdentitySave()}>
                {saving ? "Saving..." : "Save identity"}
              </button>
            </section>
          ) : null}
          <ParticipantLegend participants={peopleForLegend} />
        </aside>
      </div>
      <Tooltip id="participant-tooltip" className="participantTooltip" />
    </div>
  );
}
