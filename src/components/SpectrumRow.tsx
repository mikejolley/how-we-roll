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

const MARKER_PX = 40;
const MARKER_RADIUS_PX = MARKER_PX / 2;

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
        left: `calc(${MARKER_RADIUS_PX}px + (100% - ${MARKER_PX}px) * ${v / 100})`,
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

  const schedulePersist = useCallback((value: number) => {
    pendingPersistValueRef.current = value;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      onPersistRef.current(question.id, pendingPersistValueRef.current);
    }, SLIDER_PERSIST_DEBOUNCE_MS);
  }, [question.id]);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    onPersistRef.current(question.id, pendingPersistValueRef.current);
  }, [question.id]);

  useEffect(
    () => () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    },
    [],
  );

  const responseRow = responses[question.id] ?? {};

  const markerRows = participants
    .map((participant) => {
      const remote = responseRow[participant.id] ?? 50;
      const value =
        currentParticipantId && participant.id === currentParticipantId ? localSliderValue : remote;
      return {
        participant,
        value,
      };
    })
    .filter((entry): entry is { participant: Participant; value: number } => Boolean(entry));

  const markerLayout = markerRows.map((entry) => {
    const sameValue = markerRows.filter((row) => row.value === entry.value);
    const orderedSameValue = [...sameValue].sort((a, b) => {
      const aIsCurrent = a.participant.id === currentParticipantId;
      const bIsCurrent = b.participant.id === currentParticipantId;
      if (aIsCurrent === bIsCurrent) {
        return a.participant.id.localeCompare(b.participant.id);
      }
      return aIsCurrent ? 1 : -1;
    });
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

  return (
    <article className="questionRow">
      <header className="questionRowHeading">
        <h3>
          <span className="questionHeadingEmoji">{question.headingEmoji}</span>{" "}
          {question.title}
        </h3>
      </header>

      <div className="trackStrip">
        <div className="scaleWrap" role="img" aria-label={`Scale for ${question.title}`}>
          <div className="scaleTrack">
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
      </div>

      <p className="spectrumLabels spectrumLabelsBelowTrack">
        <span>{question.leftLabel}</span>
        <span className="spectrumArrow" aria-hidden>
          ↔
        </span>
        <span>{question.rightLabel}</span>
      </p>

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
