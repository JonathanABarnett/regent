import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { sanitizeName } from "../lib/sanitize";

const KINGDOM_SUGGESTIONS = [
  "Aurelia", "Brightmark", "Castellan", "Doravale", "Eastmoor",
  "Faerhaven", "Greenholm", "Hallowmere", "Ironwatch", "Jorund",
  "Kelvar", "Loneset", "Mirevale", "Northcrown", "Orinhall",
  "Pelmark", "Quietshore", "Rookhaven", "Stillpine", "Theldrin",
  "Underbough", "Voregate", "Wenmark", "Yarrowfen",
];
const MONARCH_SUGGESTIONS = [
  "Aldric", "Brenna", "Cassian", "Drystan", "Elara",
  "Faelan", "Galen", "Hilde", "Ivor", "Jora",
  "Kael", "Lirien", "Magna", "Norra", "Osric",
  "Pernille", "Quinn", "Rhett", "Sarai", "Torin",
  "Una", "Verity", "Wolfric", "Yseult",
];
const PET_SUGGESTIONS = [
  "Biscuit", "Pippin", "Hazel", "Mochi", "Tuck",
  "Nim", "Pumpkin", "Sable", "Wren", "Wisp",
  "Clover", "Pebble", "Ash", "Bramble", "Honey",
  "Smudge", "Twig", "Linden", "Pip", "Marrow",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * First-launch onboarding. Renders only when `identity` is null AND no save
 * exists. Asks the player to name their kingdom and their monarch. Both are
 * fixed at founding — they appear in the HUD, the journal, achievements, and
 * eventually screenshots.
 *
 * This is the *moment of ownership* — the difference between "neat tech demo"
 * and "my kingdom".
 */
export interface OnboardingResult {
  kingdomName: string;
  monarchName: string;
  petName: string;
  petKind: "dog" | "cat";
}

export function OnboardingModal({
  onComplete,
  initial,
}: {
  onComplete: (r: OnboardingResult) => void;
  /**
   * Last-committed values from a prior pass through this modal. When the
   * player hits "← Back" inside the character creator we re-mount this
   * modal — without `initial` their typed names would be replaced with
   * fresh random picks. Passing the saved draft restores them.
   */
  initial?: Partial<OnboardingResult>;
}) {
  const identity = useGameStore((s) => s.identity);
  const [kingdomName, setKingdomName] = useState(initial?.kingdomName ?? pick(KINGDOM_SUGGESTIONS));
  const [monarchName, setMonarchName] = useState(initial?.monarchName ?? pick(MONARCH_SUGGESTIONS));
  const [petName, setPetName] = useState(initial?.petName ?? pick(PET_SUGGESTIONS));
  const [petKind, setPetKind] = useState<"dog" | "cat">(initial?.petKind ?? "dog");

  if (identity) return null;

  function commit() {
    const k = sanitizeName(kingdomName, 28) || pick(KINGDOM_SUGGESTIONS);
    const m = sanitizeName(monarchName, 28) || pick(MONARCH_SUGGESTIONS);
    const p = sanitizeName(petName, 20) || pick(PET_SUGGESTIONS);
    onComplete({ kingdomName: k, monarchName: m, petName: p, petKind });
  }

  return (
    <div
      className="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding-card">
        <div className="onboarding-crest">✦</div>
        <div className="onboarding-steps" aria-label="Founding flow">
          <span className="onboarding-step active" aria-current="step">
            <span className="onboarding-step-dot">1</span>
            <span className="onboarding-step-label">Name</span>
          </span>
          <span className="onboarding-step-bar" />
          <span className="onboarding-step">
            <span className="onboarding-step-dot">2</span>
            <span className="onboarding-step-label">Design</span>
          </span>
        </div>
        <h2 id="onboarding-title">A new kingdom rises</h2>
        <p className="onboarding-tagline">
          A scrap of land, a handful of villagers, and one person to lead them.
          Choose well — they'll carry these names for as long as the kingdom stands.
        </p>
        <label>
          <span>Kingdom name</span>
          <input
            type="text"
            value={kingdomName}
            onChange={(e) => setKingdomName(e.target.value)}
            maxLength={28}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
          <button
            type="button"
            className="reroll"
            title="Pick a random name"
            onClick={() => setKingdomName(pick(KINGDOM_SUGGESTIONS))}
          >
            ↻
          </button>
        </label>
        <label>
          <span>Monarch's name</span>
          <input
            type="text"
            value={monarchName}
            onChange={(e) => setMonarchName(e.target.value)}
            maxLength={28}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
          <button
            type="button"
            className="reroll"
            title="Pick a random name"
            onClick={() => setMonarchName(pick(MONARCH_SUGGESTIONS))}
          >
            ↻
          </button>
        </label>
        <label>
          <span>Royal companion</span>
          <input
            type="text"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            maxLength={20}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
          <button
            type="button"
            className="reroll"
            title="Pick a random name"
            onClick={() => setPetName(pick(PET_SUGGESTIONS))}
          >
            ↻
          </button>
        </label>
        <div className="pet-kind-pick">
          <button
            type="button"
            className={petKind === "dog" ? "active" : ""}
            onClick={() => setPetKind("dog")}
          >
            🐕 dog
          </button>
          <button
            type="button"
            className={petKind === "cat" ? "active" : ""}
            onClick={() => setPetKind("cat")}
          >
            🐈 cat
          </button>
        </div>
        <button className="onboarding-commit" onClick={commit}>
          Next: design {monarchName.trim() || "your monarch"} →
        </button>
        <p className="onboarding-hint">
          You'll style {monarchName.trim() || "the monarch"}'s appearance next. Names can't be
          changed once the kingdom is founded.
        </p>
      </div>
    </div>
  );
}
