import type { Participant } from "./SpectrumBoard";

type ParticipantLegendProps = {
  participants: Participant[];
};

export function ParticipantLegend({ participants }: ParticipantLegendProps) {
  return (
    <section className="legend card">
      <h2>People</h2>
      <ul>
        {participants.map((participant) => (
          <li key={participant.id}>
            <span className="swatch" style={{ backgroundColor: participant.color }} />
            <span className="emoji">{participant.emoji}</span>
            <span>{participant.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
