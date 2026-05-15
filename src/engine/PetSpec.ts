/**
 * Pet customization model. Like CharacterSpec but tiny — pets are smaller
 * pixel creatures with fewer slots.
 */

import type { Graphics } from "pixi.js";

export type PetKind = "dog" | "cat";
export type PetAccessory = "none" | "collar" | "bandana" | "crown" | "bow";

export interface PetSpec {
  v: 1;
  kind: PetKind;
  /** main body fur color */
  bodyColor: string;   // hex
  /** belly + face highlight */
  bellyColor: string;  // hex
  /** ears, nose tip — darker accent */
  accentColor: string; // hex
  /** eye color */
  eyeColor: string;
  /** optional collar/bandana/crown */
  accessory: PetAccessory;
  /** accessory color */
  accessoryColor: string;
}

export const PET_BODY_COLORS = [
  "#1c1917", "#451a03", "#78350f", "#92400e", "#a16207",
  "#ca8a04", "#d6c0a3", "#e7e5e4", "#52525b", "#a8a29e",
  "#fde68a", "#fcd34d",
];

export const PET_EYE_COLORS = [
  "#0c0a09", "#1e40af", "#15803d", "#fde047", "#7c2d12",
];

export const PET_ACCESSORIES: PetAccessory[] = ["none", "collar", "bandana", "crown", "bow"];

export const DEFAULT_PET_SPEC: PetSpec = {
  v: 1,
  kind: "dog",
  bodyColor: "#a16207",
  bellyColor: "#fde68a",
  accentColor: "#78350f",
  eyeColor: "#0c0a09",
  accessory: "collar",
  accessoryColor: "#dc2626",
};

export const CAT_DEFAULT_SPEC: PetSpec = {
  v: 1,
  kind: "cat",
  bodyColor: "#52525b",
  bellyColor: "#d4d4d8",
  accentColor: "#27272a",
  eyeColor: "#fde047",
  accessory: "collar",
  accessoryColor: "#1e40af",
};

export function defaultPetSpec(kind: PetKind): PetSpec {
  return kind === "cat" ? { ...CAT_DEFAULT_SPEC } : { ...DEFAULT_PET_SPEC };
}

// ── Renderer ─────────────────────────────────────────────────────────────

import { type DrawSurface } from "./CharacterRenderer";

export function drawPet(
  surface: DrawSurface,
  spec: PetSpec,
  frame: number,
): void {
  const bob = frame % 2 === 0 ? 0 : 1;
  const body = spec.bodyColor;
  const belly = spec.bellyColor;
  const accent = spec.accentColor;

  // shadow
  surface.rectAlpha(13, 28, 6, 1, "#000000", 0.4);

  // body (low, stocky)
  surface.rect(8, 16 + bob, 16, 8, body);
  // belly
  surface.rect(10, 22 + bob, 12, 2, belly);
  // head — front (left side)
  surface.rect(5, 14 + bob, 8, 8, body);

  // ears (different by kind)
  if (spec.kind === "cat") {
    surface.rect(5, 12 + bob, 2, 3, accent);
    surface.rect(11, 12 + bob, 2, 3, accent);
  } else {
    surface.rect(4, 14 + bob, 2, 4, accent); // floppy ear
  }

  // eye
  surface.rect(9, 17 + bob, 2, 2, spec.eyeColor);
  // nose
  surface.rect(5, 18 + bob, 2, 2, "#1c1917");

  // legs
  surface.rect(10, 24 + bob, 2, 4, body);
  surface.rect(20, 24 + bob, 2, 4, body);

  // tail
  if (spec.kind === "cat") {
    surface.rect(24, 14 + bob, 2, 8, body);
  } else {
    surface.rect(24, 18 + bob, 4, 2, body);
  }

  drawPetAccessory(surface, spec, bob);
}

function drawPetAccessory(surface: DrawSurface, spec: PetSpec, bob: number) {
  if (spec.accessory === "none") return;
  const c = spec.accessoryColor;
  switch (spec.accessory) {
    case "collar":
      // band around the neck (where head meets body)
      surface.rect(5, 21 + bob, 8, 1, c);
      // tag
      surface.rect(8, 22 + bob, 2, 1, "#fde047");
      break;
    case "bandana":
      // triangle around neck
      surface.rect(5, 21 + bob, 8, 2, c);
      surface.rect(6, 23 + bob, 6, 1, c);
      surface.rect(7, 24 + bob, 4, 1, c);
      break;
    case "crown":
      // tiny crown on head
      surface.rect(6, 13 + bob, 6, 1, c);
      surface.rect(6, 12 + bob, 1, 1, c);
      surface.rect(8, 11 + bob, 2, 1, c);
      surface.rect(11, 12 + bob, 1, 1, c);
      break;
    case "bow":
      // bow on top of head
      surface.rect(7, 13 + bob, 1, 2, c);
      surface.rect(8, 12 + bob, 1, 4, c);
      surface.rect(9, 13 + bob, 2, 2, c);
      surface.rect(11, 12 + bob, 1, 4, c);
      break;
  }
}
