import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * Milestone share prompts — quiet nudges toward the Kingdom Card at the
 * moments players are proudest: a full year of rule, a real population,
 * a succession. Shared kingdom cards are the zero-budget marketing
 * channel; the trick is asking at a peak, not at random. Each moment
 * fires once per install (localStorage flags).
 */

const FLAG_KEY = "kingdomos.shareMoments.v1";

function readFlags(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FLAG_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function markFlag(id: string): void {
  try {
    const f = readFlags();
    f[id] = true;
    localStorage.setItem(FLAG_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota errors */
  }
}

export function ShareMoments({ onOpenKingdomCard }: { onOpenKingdomCard: () => void }) {
  const year = useGameStore((s) => s.worldStats.year);
  const npcCount = useGameStore((s) => s.worldStats.npcCount);
  const generation = useGameStore((s) => s.worldStats.generation);
  const identity = useGameStore((s) => s.identity);
  const [moment, setMoment] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!identity || moment) return;
    const flags = readFlags();
    const candidates: Array<{ id: string; when: boolean; text: string }> = [
      {
        id: "year1",
        when: year >= 2,
        text: `A full year of rule in ${identity.kingdomName}. That's worth a portrait.`,
      },
      {
        id: "pop25",
        when: npcCount >= 25,
        text: `${identity.kingdomName} has grown to ${npcCount} souls. Show it off?`,
      },
      {
        id: "succession",
        when: (generation ?? 1) >= 2,
        text: "A new monarch wears the crown. Mark the dynasty with a Kingdom Card.",
      },
    ];
    const hit = candidates.find((c) => c.when && !flags[c.id]);
    if (hit) {
      markFlag(hit.id); // marked on SHOW — re-prompting a "Later" would nag
      setMoment({ id: hit.id, text: hit.text });
    }
  }, [identity, year, npcCount, generation, moment]);

  if (!moment) return null;
  return (
    <div className="share-moment" role="status">
      <span className="share-moment-icon" aria-hidden="true">📜</span>
      <p>{moment.text}</p>
      <div className="share-moment-actions">
        <button type="button" className="ghost" onClick={() => setMoment(null)}>
          Later
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setMoment(null);
            onOpenKingdomCard();
          }}
        >
          View Kingdom Card
        </button>
      </div>
    </div>
  );
}
