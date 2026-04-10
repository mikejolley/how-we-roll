import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Participant, ResponseMap } from "./SpectrumBoard";
import type { SpectrumQuestion } from "../lib/questions";

const SLIDER_PERSIST_DEBOUNCE_MS = 280;
const SCALE_STEP_PERCENT = 5;

function snapToScaleStep(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value / SCALE_STEP_PERCENT) * SCALE_STEP_PERCENT));
}

type SpectrumRowProps = {
  question: SpectrumQuestion;
  participants: Participant[];
  responses: ResponseMap;
  currentParticipantId: string;
  presentationMode: boolean;
  canRespond: boolean;
  onSliderRelease: (questionId: string, value: number) => void;
};

type MarkerEntry = { participant: Participant; value: number };

const MARKER_PX = 40;
const MARKER_RADIUS_PX = MARKER_PX / 2;

/** Horizontal position along the scale track for a 0–100 value (markers and tick dots). */
function scaleTrackLeft(percent: number): string {
  return `calc(${MARKER_RADIUS_PX}px + (100% - ${MARKER_PX}px) * ${percent / 100})`;
}

/** Tick positions 0, 5, …, 100 (aligned with slider step). */
const SCALE_DOT_PERCENTAGES = Array.from({ length: 21 }, (_, index) => index * 5);

type MarkerProps = {
  participant: Participant;
  value: number;
  offsetY: number;
  stackIndex: number;
  stackCount: number;
};

function AnimatedMarker({
  participant,
  value,
  offsetY,
  stackIndex,
  stackCount,
}: MarkerProps) {
  const [moveKey, setMoveKey] = useState(0);
  const [displayValue, setDisplayValue] = useState(value);
  const [displayOffsetY, setDisplayOffsetY] = useState(offsetY);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (displayValue === value && displayOffsetY === offsetY) {
      return;
    }

    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
    }

    // Defer marker motion until rapid slider changes settle.
    settleTimer.current = window.setTimeout(() => {
      const moved = displayValue !== value || displayOffsetY !== offsetY;
      setDisplayValue(value);
      setDisplayOffsetY(offsetY);
      if (moved) {
        setMoveKey((k) => k + 1);
      }
    }, 180);

    return () => {
      if (settleTimer.current) {
        window.clearTimeout(settleTimer.current);
      }
    };
  }, [value, offsetY, displayValue, displayOffsetY]);

  const v = Math.min(100, Math.max(0, displayValue));

  return (
    <span
      className="marker"
      style={{
        left: scaleTrackLeft(v),
        top: `calc(50% + ${displayOffsetY}px)`,
        zIndex: stackCount + stackIndex,
      }}
      data-tooltip-id="participant-tooltip"
      data-tooltip-place="top"
      data-tooltip-content={`${participant.name} (${displayValue})`}
      aria-label={`${participant.name} (${displayValue})`}
    >
      <span
        key={moveKey}
        className={`markerFace${moveKey > 0 ? " markerFaceRoll" : ""}`}
        style={{ borderColor: participant.color }}
      >
        {participant.emoji}
      </span>
    </span>
  );
}

export function SpectrumRow({
  question,
  participants,
  responses,
  currentParticipantId,
  presentationMode,
  canRespond,
  onSliderRelease,
}: SpectrumRowProps) {
  const rowKey = `${question.id}::${currentParticipantId}`;
  const prevRowKeyRef = useRef<string | null>(null);
  const hasSeededFromApiRef = useRef(false);
  const userDirtyRef = useRef(false);
  const [localSliderValue, setLocalSliderValue] = useState(50);
  const pendingPersistValueRef = useRef(50);
  const persistTimerRef = useRef<number | null>(null);
  const onPersistRef = useRef(onSliderRelease);

  const pointerActiveRef = useRef(false);
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    onPersistRef.current = onSliderRelease;
  }, [onSliderRelease]);

  useEffect(() => {
    if (!currentParticipantId) {
      return;
    }
    if (prevRowKeyRef.current !== rowKey) {
      prevRowKeyRef.current = rowKey;
      hasSeededFromApiRef.current = false;
      userDirtyRef.current = false;
    }
    if (hasSeededFromApiRef.current || userDirtyRef.current) {
      return;
    }
    const v = responses[question.id]?.[currentParticipantId];
    if (v !== undefined) {
      hasSeededFromApiRef.current = true;
      const snapped = snapToScaleStep(v);
      pendingPersistValueRef.current = snapped;
      queueMicrotask(() => {
        setLocalSliderValue(snapped);
      });
    }
  }, [rowKey, currentParticipantId, question.id, responses]);

  const clearPersistTimer = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  const schedulePersist = useCallback(
    (value: number) => {
      pendingPersistValueRef.current = value;
      clearPersistTimer();
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        onPersistRef.current(question.id, pendingPersistValueRef.current);
      }, SLIDER_PERSIST_DEBOUNCE_MS);
    },
    [clearPersistTimer, question.id],
  );

  const flushPersist = useCallback(() => {
    clearPersistTimer();
    onPersistRef.current(question.id, pendingPersistValueRef.current);
  }, [clearPersistTimer, question.id]);

  useEffect(() => () => clearPersistTimer(), [clearPersistTimer]);

  const responseRow = responses[question.id] ?? {};

  const markerRows: MarkerEntry[] = participants.map((participant) => {
    const remote = responseRow[participant.id] ?? 50;
    const value =
      currentParticipantId && participant.id === currentParticipantId ? localSliderValue : remote;
    return { participant, value };
  });

  const sortSameValueStack = (a: MarkerEntry, b: MarkerEntry) => {
    const aIsCurrent = a.participant.id === currentParticipantId;
    const bIsCurrent = b.participant.id === currentParticipantId;
    if (aIsCurrent === bIsCurrent) {
      return a.participant.id.localeCompare(b.participant.id);
    }
    return aIsCurrent ? 1 : -1;
  };

  const rowsByValue = new Map<number, MarkerEntry[]>();
  for (const row of markerRows) {
    const bucket = rowsByValue.get(row.value);
    if (bucket) {
      bucket.push(row);
    } else {
      rowsByValue.set(row.value, [row]);
    }
  }

  const orderedByValue = new Map<number, MarkerEntry[]>();
  for (const [value, bucket] of rowsByValue) {
    orderedByValue.set(value, [...bucket].sort(sortSameValueStack));
  }

  const markerLayout = markerRows.map((entry) => {
    const orderedSameValue = orderedByValue.get(entry.value) ?? [entry];
    const stackIndex = orderedSameValue.findIndex((row) => row.participant.id === entry.participant.id);
    const centeredOffset = (stackIndex - (orderedSameValue.length - 1) / 2) * 10;
    const isCurrentParticipant = entry.participant.id === currentParticipantId;

    return {
      ...entry,
      stackIndex,
      stackCount: orderedSameValue.length,
      offsetY: centeredOffset,
      zOrder: isCurrentParticipant ? 10_000 : stackIndex + 1,
    };
  });

  const setLocalFromInput = (value: number) => {
    userDirtyRef.current = true;
    pendingPersistValueRef.current = value;
    setLocalSliderValue(value);
  };

  const scaleDots = SCALE_DOT_PERCENTAGES.map((pct) => (
    <span key={pct} className="scaleDot" style={{ left: scaleTrackLeft(pct) }} aria-hidden />
  ));

  const scaleTrack = (
    <div className="scaleWrap" role="img" aria-label={`Scale for ${question.title}`}>
      <div className="scaleTrack">
        {scaleDots}
        {markerLayout.map(({ participant, value, stackCount, offsetY, zOrder }) => (
          <AnimatedMarker
            key={`${question.id}-${participant.id}`}
            participant={participant}
            value={value}
            offsetY={offsetY}
            stackIndex={zOrder}
            stackCount={stackCount}
          />
        ))}
      </div>
    </div>
  );

  return (
    <article className="questionRow">
      <header className="questionRowHeading">
        <h3>
          <span className="questionHeadingEmoji">{question.headingEmoji}</span>{" "}
          {question.title}
        </h3>
      </header>

      {presentationMode ? (
        <div className="presentationSpectrumLine">
          <span className="spectrumEndLabel spectrumEndLabelStart">{question.leftLabel}</span>
          <div className="trackStrip presentationTrackCell">{scaleTrack}</div>
          <span className="spectrumEndLabel spectrumEndLabelEnd">{question.rightLabel}</span>
        </div>
      ) : (
        <>
          <div className="trackStrip">{scaleTrack}</div>
          <p className="spectrumLabels spectrumLabelsBelowTrack">
            <span>{question.leftLabel}</span>
            <span className="spectrumArrow" aria-hidden>
              ↔
            </span>
            <span>{question.rightLabel}</span>
          </p>
        </>
      )}

      {!presentationMode && canRespond ? (
        <label className="sliderLabel" htmlFor={`spectrum-slider-${question.id}`}>
          <span className="srOnly">Your position for {question.title}</span>
          <input
            id={`spectrum-slider-${question.id}`}
            className="slider spectrumSlider"
            type="range"
            min={0}
            max={100}
            step={SCALE_STEP_PERCENT}
            value={localSliderValue}
            style={{ "--slider-fill": `${localSliderValue}%` } as CSSProperties}
            onPointerDown={() => {
              pointerActiveRef.current = true;
            }}
            onChange={(event) => {
              const v = Number(event.currentTarget.value);
              setLocalFromInput(v);
              schedulePersist(v);
            }}
            onPointerUp={() => {
              if (!pointerActiveRef.current) {
                return;
              }
              pointerActiveRef.current = false;
              skipNextBlurRef.current = true;
              flushPersist();
            }}
            onBlur={() => {
              if (skipNextBlurRef.current) {
                skipNextBlurRef.current = false;
                return;
              }
              flushPersist();
            }}
          />
        </label>
      ) : null}
    </article>
  );
}
