import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

const DEFAULT_TITLE = "KingdomOS — a small fantasy world, living on your desktop";

/**
 * Live tab-title ticker. Even as a background tab, the browser chrome
 * whispers kingdom state — "Orinhall · Y3 D14 · 12 souls" — which keeps
 * the world present while the player works and gives them a reason to
 * click back. Renders nothing; granular selectors mean it only updates
 * when day/year/population actually change.
 */
export function TabTitle() {
  const identity = useGameStore((s) => s.identity);
  const day = useGameStore((s) => s.worldStats.day);
  const year = useGameStore((s) => s.worldStats.year);
  const npcCount = useGameStore((s) => s.worldStats.npcCount);

  useEffect(() => {
    document.title = identity
      ? `${identity.kingdomName} · Y${year} D${day} · ${npcCount} souls — KingdomOS`
      : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [identity, day, year, npcCount]);

  return null;
}
