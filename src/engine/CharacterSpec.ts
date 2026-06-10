/**
 * Character customization model. Compact, JSON-serializable, used for both
 * the player's monarch (now) and eventually any NPC the player wants to dress.
 *
 * Design constraint: ALL options must be representable with pure-color
 * rectangles drawn on a 32×32 grid, no external assets. That keeps the
 * editor live-previewable, the engine asset-free, and saves a single tiny
 * object per character.
 */

export type HairStyle = "short" | "long" | "ponytail" | "bald" | "mohawk" | "braid" | "topknot";
export type OutfitStyle = "tunic" | "robe" | "armor" | "peasant" | "regal";
export type HatStyle =
  | "none"
  | "crown"
  | "hood"
  | "cap"
  | "circlet"
  | "wizard"
  | "helm"
  | "jester";
export type SkinTone = "fair" | "tan" | "olive" | "brown" | "dark";
export type HandItem = "none" | "sword" | "staff" | "book" | "scepter" | "lute" | "shield";
export type Cape = "none" | "short" | "long";
export type EyeAccessory = "none" | "glasses" | "monocle" | "eyepatch";
export type BodyType = "slim" | "average" | "stout";

export interface CharacterSpec {
  /** Schema version for migrations. */
  v: 1;
  skinTone: SkinTone;
  bodyType: BodyType;
  hairStyle: HairStyle;
  hairColor: string;     // hex
  eyeColor: string;      // hex
  eyeAccessory: EyeAccessory;
  outfit: OutfitStyle;
  outfitColor: string;   // hex
  accentColor: string;   // hex (trim, belts, collars)
  hat: HatStyle;
  hatColor: string;      // hex
  cape: Cape;
  capeColor: string;     // hex
  handItem: HandItem;
  handItemColor: string; // hex
  /** Has a beard? Only really visible in certain hair styles. */
  beard: boolean;
}

export const SKIN_PALETTE: Record<SkinTone, string> = {
  fair:  "#fde7c2",
  tan:   "#e0a877",
  olive: "#c79b6e",
  brown: "#8b5a3c",
  dark:  "#5a3825",
};

export const HAIR_COLORS = [
  "#1c1917", "#451a03", "#78350f", "#92400e",
  "#a16207", "#ca8a04", "#fde68a", "#dc2626",
  "#a8a29e", "#e7e5e4",
];

export const EYE_COLORS = [
  "#0c0a09", "#451a03", "#1e40af", "#15803d",
  "#92400e", "#7c2d12", "#374151",
];

export const FABRIC_COLORS = [
  "#dc2626", "#b91c1c", "#7c2d12",
  "#1d4ed8", "#1e40af", "#0c4a6e",
  "#15803d", "#166534", "#365314",
  "#7c3aed", "#581c87",
  "#92400e", "#78350f",
  "#52525b", "#27272a", "#1c1917",
  "#fde68a", "#fcd34d", "#f59e0b",
  "#e7e5e4", "#a8a29e",
];

export const DEFAULT_SPEC: CharacterSpec = {
  v: 1,
  skinTone: "fair",
  bodyType: "average",
  hairStyle: "short",
  hairColor: "#78350f",
  eyeColor: "#0c0a09",
  eyeAccessory: "none",
  outfit: "regal",
  outfitColor: "#7c3aed",
  accentColor: "#fde68a",
  hat: "crown",
  hatColor: "#fde047",
  cape: "short",
  capeColor: "#dc2626",
  handItem: "scepter",
  handItemColor: "#fde047",
  beard: false,
};

/**
 * Deterministic commoner spec from an NPC seed — same seed, same face,
 * across sessions and saves. Used for decision-card and profile portraits
 * so the villager asking for shelter has a face, not just a name.
 * Leans peasant: no crowns, mostly bare heads, rarely armed.
 */
export function specFromSeed(seed: number): CharacterSpec {
  let s = (seed >>> 0) || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const skinTones: SkinTone[] = ["fair", "tan", "olive", "brown", "dark"];
  const bodyTypes: BodyType[] = ["slim", "average", "stout"];
  const hairStyles: HairStyle[] = ["short", "long", "ponytail", "bald", "braid", "topknot"];
  const outfits: OutfitStyle[] = ["tunic", "peasant", "peasant", "robe", "tunic"];
  const hats: HatStyle[] = ["none", "none", "none", "cap", "hood"];
  return {
    v: 1,
    skinTone: pick(skinTones),
    bodyType: pick(bodyTypes),
    hairStyle: pick(hairStyles),
    hairColor: pick(HAIR_COLORS),
    eyeColor: pick(EYE_COLORS),
    eyeAccessory: rand() < 0.08 ? "glasses" : "none",
    outfit: pick(outfits),
    outfitColor: pick(FABRIC_COLORS),
    accentColor: pick(FABRIC_COLORS),
    hat: pick(hats),
    hatColor: pick(FABRIC_COLORS),
    cape: "none",
    capeColor: pick(FABRIC_COLORS),
    handItem: "none",
    handItemColor: pick(FABRIC_COLORS),
    beard: rand() < 0.25,
  };
}

/** Convenience for random presets in the editor. */
export function randomSpec(): CharacterSpec {
  const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const skinTones: SkinTone[] = ["fair", "tan", "olive", "brown", "dark"];
  const bodyTypes: BodyType[] = ["slim", "average", "stout"];
  const hairStyles: HairStyle[] = ["short", "long", "ponytail", "bald", "mohawk", "braid", "topknot"];
  const outfits: OutfitStyle[] = ["tunic", "robe", "armor", "peasant", "regal"];
  const hats: HatStyle[] = ["none", "crown", "hood", "cap", "circlet", "wizard", "helm", "jester"];
  const capes: Cape[] = ["none", "short", "long"];
  const handItems: HandItem[] = ["none", "sword", "staff", "book", "scepter", "lute", "shield"];
  const eyeAcc: EyeAccessory[] = ["none", "glasses", "monocle", "eyepatch"];
  return {
    v: 1,
    skinTone: pick(skinTones),
    bodyType: pick(bodyTypes),
    hairStyle: pick(hairStyles),
    hairColor: pick(HAIR_COLORS),
    eyeColor: pick(EYE_COLORS),
    eyeAccessory: pick(eyeAcc),
    outfit: pick(outfits),
    outfitColor: pick(FABRIC_COLORS),
    accentColor: pick(FABRIC_COLORS),
    hat: pick(hats),
    hatColor: pick(FABRIC_COLORS),
    cape: pick(capes),
    capeColor: pick(FABRIC_COLORS),
    handItem: pick(handItems),
    handItemColor: pick(FABRIC_COLORS),
    beard: Math.random() < 0.3,
  };
}
