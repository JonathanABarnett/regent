/**
 * Canvas2D renderer for the Kingdom Card.
 *
 * Takes a composed `KingdomCardInput` and draws a 1200×630 composition. The
 * template system is intentionally extensible — pass 1 ships a single
 * "parchment" template; later passes add "heraldic" and "modern".
 *
 * The renderer is parameterized by a `CanvasRenderingContext2D` so callers
 * can hand in either a real canvas (browser) or a spy (tests). Layout
 * mirrors the chronicle's voice: warm sepia, serif headings, modest
 * footer wordmark — the kind of image a player would actually post.
 */

import type { KingdomCardInput, KingdomCardStats } from "./kingdom-card-data";
import { CARD_WIDTH, CARD_HEIGHT, trimMilestoneLine, compactNumber, pickSparklineSeries } from "./kingdom-card-data";

export type CardTemplate = "parchment" | "heraldic" | "modern";

/**
 * Stable list of every template id, in the order the picker UI should show
 * them. Exposed so the UI doesn't drift out of sync with the renderer.
 */
export const CARD_TEMPLATES: ReadonlyArray<{ id: CardTemplate; label: string; blurb: string }> = [
  { id: "parchment", label: "Parchment", blurb: "warm sepia, like an old chronicle" },
  { id: "heraldic", label: "Heraldic", blurb: "dark navy and gold, formal banner" },
  { id: "modern", label: "Modern", blurb: "clean off-white, your banner color as accent" },
];

export interface RenderOpts {
  template?: CardTemplate;
  /**
   * 32×32 source canvas/image of the monarch sprite (drawn via the engine's
   * CharacterRenderer). Renderer will up-scale and place on the card. Pass
   * `undefined` (e.g. in tests) to skip the portrait inset.
   */
  monarchSprite?: CanvasImageSource;
  /** 32×32 pet sprite, same contract as `monarchSprite`. */
  petSprite?: CanvasImageSource;
}

/**
 * Draw a full Kingdom Card onto the given 2D context. The context's surface
 * must be at least CARD_WIDTH × CARD_HEIGHT — callers should size their
 * canvas before invoking.
 */
export function drawKingdomCard(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  opts: RenderOpts = {},
): void {
  const template = opts.template ?? "parchment";
  ctx.imageSmoothingEnabled = false;

  const theme = THEMES[template] ?? THEMES.parchment;
  drawBackground(ctx, input, theme);
  drawForeground(ctx, input, theme);
  // Sprites layer on top — same for every template, anchored bottom-right.
  if (opts.monarchSprite || opts.petSprite) {
    drawPortraitInset(ctx, input, opts, theme);
  }
}

/**
 * Visual theme used to paint a card. Every template is just a named
 * `CardTheme` — the layout itself is shared. Adding a fourth template
 * means picking colors and a background-paint function, nothing more.
 */
interface CardTheme {
  background: (ctx: CanvasRenderingContext2D, input: KingdomCardInput) => void;
  /** Color of the big "Kingdom of X" title. */
  title: string;
  /** Color of the italic "under …" subtitle. */
  subtitle: string;
  /** Color of the horizontal rule under the title. */
  divider: string;
  /** Color of stat-badge numeric values. */
  statValue: string;
  /** Color of stat-badge text labels. */
  statLabel: string;
  /** Color of the separator dot between stat badges. */
  statSep: string;
  /** Color of the bullet dot in front of each milestone line. */
  bullet: string;
  /** Color of milestone body text. */
  body: string;
  /** Color of the date stamp ("Day 47 · Year 2"). */
  footerDate: string;
  /** Color of the wordmark line at the bottom-left. */
  footerWordmark: string;
  /** Background of the portrait plate. */
  plateFill: string;
  /** Highlight rim along the top + left of the plate. */
  plateHighlight: string;
  /** Color of the small italic caption under the plate. */
  reignCaption: string;
}

const THEMES: Record<CardTemplate, CardTheme> = {
  parchment: {
    background: drawParchmentBackground,
    title: "#5b2a08",
    subtitle: "#7c2d12",
    divider: "rgba(120, 53, 15, 0.5)",
    statValue: "#5b2a08",
    statLabel: "rgba(120, 53, 15, 0.85)",
    statSep: "rgba(146, 64, 14, 0.55)",
    bullet: "rgba(120, 53, 15, 0.75)",
    body: "#3f2616",
    footerDate: "#92400e",
    footerWordmark: "rgba(146, 64, 14, 0.85)",
    plateFill: "rgba(245, 200, 130, 0.9)",
    plateHighlight: "rgba(255, 240, 190, 0.6)",
    reignCaption: "rgba(80, 40, 15, 0.7)",
  },
  heraldic: {
    background: drawHeraldicBackground,
    title: "#fde68a", // gold leaf on navy
    subtitle: "#fbbf24",
    divider: "rgba(251, 191, 36, 0.55)",
    statValue: "#fde68a",
    statLabel: "rgba(251, 191, 36, 0.85)",
    statSep: "rgba(251, 191, 36, 0.45)",
    bullet: "rgba(251, 191, 36, 0.85)",
    body: "#fef3c7",
    footerDate: "#fbbf24",
    footerWordmark: "rgba(251, 191, 36, 0.7)",
    plateFill: "rgba(30, 41, 59, 0.85)",
    plateHighlight: "rgba(120, 113, 108, 0.4)",
    reignCaption: "rgba(251, 191, 36, 0.7)",
  },
  modern: {
    background: drawModernBackground,
    title: "#1c1917",
    subtitle: "#525252",
    divider: "rgba(28, 25, 23, 0.18)",
    statValue: "#1c1917",
    statLabel: "rgba(82, 82, 91, 0.95)",
    statSep: "rgba(82, 82, 91, 0.4)",
    bullet: "", // filled at runtime from banner color
    body: "#1c1917",
    footerDate: "#525252",
    footerWordmark: "rgba(82, 82, 91, 0.75)",
    plateFill: "rgba(250, 250, 249, 1)",
    plateHighlight: "rgba(231, 229, 228, 0.8)",
    reignCaption: "rgba(82, 82, 91, 0.75)",
  },
};

/**
 * Stats badge row. Centered under the divider, four pills max:
 *   👥 24 villagers   ⛁ 412 gold   ✦ 7 vault   ★ 14/27 achievements
 *
 * Each pill is only drawn when the underlying number is meaningful (>0 or
 * >=1 in the case of achievement totals). The row stays compact even when
 * a brand-new kingdom only has a population badge to show.
 */
function drawStatsRow(
  ctx: CanvasRenderingContext2D,
  stats: KingdomCardStats,
  theme: CardTheme,
): void {
  const badges: Array<{ label: string; value: string }> = [];
  if (stats.population !== undefined && stats.population > 0) {
    badges.push({
      label: stats.population === 1 ? "villager" : "villagers",
      value: compactNumber(stats.population),
    });
  }
  if (stats.gold !== undefined && stats.gold > 0) {
    badges.push({ label: "gold", value: compactNumber(stats.gold) });
  }
  if (stats.vault !== undefined && stats.vault > 0) {
    badges.push({
      label: stats.vault === 1 ? "vault piece" : "vault pieces",
      value: compactNumber(stats.vault),
    });
  }
  if (
    stats.achievementsUnlocked !== undefined &&
    stats.achievementsUnlocked > 0 &&
    stats.achievementsTotal !== undefined &&
    stats.achievementsTotal > 0
  ) {
    badges.push({
      label: "achievements",
      value: `${stats.achievementsUnlocked}/${stats.achievementsTotal}`,
    });
  }
  if (!badges.length) return;

  ctx.font = "bold 22px 'Georgia', 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const sep = "   ·   ";
  const text = badges.map((b) => `${b.value} ${b.label}`).join(sep);
  // Center the whole row.
  const metrics = ctx.measureText(text);
  const totalW = (metrics && typeof metrics.width === "number" && metrics.width)
    ? metrics.width
    // Fallback measurement (mocks may not provide a real measureText).
    : text.length * 11;
  let x = (CARD_WIDTH - totalW) / 2;
  const y = 290;

  for (let i = 0; i < badges.length; i++) {
    const b = badges[i];
    ctx.fillStyle = theme.statValue;
    const v = b.value;
    ctx.fillText(v, x, y);
    const vw = (ctx.measureText(v).width as number) || v.length * 13;
    x += vw + 6;
    ctx.font = "20px 'Georgia', 'Times New Roman', serif";
    ctx.fillStyle = theme.statLabel;
    ctx.fillText(b.label, x, y);
    const lw = (ctx.measureText(b.label).width as number) || b.label.length * 10;
    x += lw;
    if (i < badges.length - 1) {
      ctx.fillStyle = theme.statSep;
      ctx.fillText(sep, x, y);
      const sw = (ctx.measureText(sep).width as number) || sep.length * 10;
      x += sw;
    }
    ctx.font = "bold 22px 'Georgia', 'Times New Roman', serif";
  }
}

/**
 * Draw a tiny sparkline inside a rectangular box. Renders a polyline + a
 * subtle filled-area underneath. Used for the population chart on the
 * portrait inset.
 */
function drawSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  series: readonly number[],
  stroke: string,
  fill: string,
): void {
  if (series.length < 2) return;
  let min = Infinity;
  let max = -Infinity;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) max = min + 1;
  const points: Array<[number, number]> = series.map((v, i) => {
    const px = x + (i / (series.length - 1)) * w;
    const py = y + h - ((v - min) / (max - min)) * h;
    return [px, py];
  });
  // Filled area under the line
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0][0], y + h);
  for (const [px, py] of points) ctx.lineTo(px, py);
  ctx.lineTo(points[points.length - 1][0], y + h);
  ctx.closePath();
  ctx.fill();
  // Line on top
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/**
 * Bottom-right portrait inset. Shows the monarch (3× scale) with the pet
 * (2× scale) standing alongside, on a small parchment-tinted mat trimmed
 * with the kingdom's banner color. The inset's job is to make the card
 * feel like *your* kingdom rather than a generic export.
 */
function drawPortraitInset(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  opts: RenderOpts,
  theme: CardTheme,
): void {
  // Inset geometry. 200×130 plate anchored to the bottom-right, leaving room
  // for the wordmark below it. Within the plate: monarch on the left at 3×
  // scale (96×96), pet on the right at 2× scale (64×64).
  const plateW = 200;
  const plateH = 130;
  const plateX = CARD_WIDTH - plateW - 80;
  const plateY = CARD_HEIGHT - plateH - 80;

  // Plate background — pulled from the theme so the inset matches the card.
  ctx.fillStyle = theme.plateFill;
  ctx.fillRect(plateX, plateY, plateW, plateH);
  // Inner highlight rim
  ctx.fillStyle = theme.plateHighlight;
  ctx.fillRect(plateX, plateY, plateW, 2);
  ctx.fillRect(plateX, plateY, 2, plateH);
  // Banner-color trim (bottom + right) — gives it a coin/medallion feel
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  ctx.fillRect(plateX, plateY + plateH - 4, plateW, 4);
  ctx.fillRect(plateX + plateW - 4, plateY, 4, plateH);

  // Population sparkline — slim chart along the very top of the plate when
  // we have history. Gives the inset a "this kingdom has a story" feel even
  // before the player reads the milestones.
  const series = pickSparklineSeries(input.stats?.populationSeries ?? [], 60);
  if (series.length >= 2) {
    drawSparkline(
      ctx,
      plateX + 12,
      plateY + 4,
      plateW - 28,
      6,
      series,
      safeHex(input.bannerColor, "#b45309"),
      "rgba(180, 83, 9, 0.18)",
    );
  }

  // Monarch — 3× scale (96×96) on the left of the plate.
  ctx.imageSmoothingEnabled = false;
  if (opts.monarchSprite) {
    ctx.drawImage(opts.monarchSprite, plateX + 12, plateY + 18, 96, 96);
  }
  // Pet — 2× scale (64×64) on the right, baseline-aligned with the monarch.
  if (opts.petSprite) {
    ctx.drawImage(opts.petSprite, plateX + plateW - 76, plateY + 54, 64, 64);
  }

  // Small caption below the plate: "long may they reign" — tasteful, optional.
  ctx.fillStyle = theme.reignCaption;
  ctx.font = "italic 16px 'Georgia', 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const captionY = plateY + plateH + 22;
  const reignCaption = input.petName
    ? `${input.monarchName} & ${input.petName}`
    : `${input.monarchName}, sovereign`;
  ctx.fillText(reignCaption, plateX + plateW / 2, captionY, plateW);
}

// ── Templates ──────────────────────────────────────────────────────────

/**
 * Paint the card background using the theme's `background` callback. Each
 * theme is responsible for filling the entire CARD_WIDTH × CARD_HEIGHT
 * surface, painting any decorative elements (banner stripe, vignette, etc.),
 * and stopping. Layout/foreground happens in drawForeground.
 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  theme: CardTheme,
): void {
  theme.background(ctx, input);
}

/**
 * Paint the text layout — title, subtitle, divider, stats row, milestones,
 * footer. Same geometry for every theme; colors come from the theme.
 */
function drawForeground(
  ctx: CanvasRenderingContext2D,
  input: KingdomCardInput,
  theme: CardTheme,
): void {
  // Kingdom name
  ctx.fillStyle = theme.title;
  ctx.font = "bold 88px 'Georgia', 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Kingdom of ${input.kingdomName}`, CARD_WIDTH / 2, 150, CARD_WIDTH - 160);

  // Subtitle
  ctx.fillStyle = theme.subtitle;
  ctx.font = "italic 32px 'Georgia', 'Times New Roman', serif";
  const subtitle = `under ${input.monarchName} · Generation ${input.generation}`;
  ctx.fillText(subtitle, CARD_WIDTH / 2, 215, CARD_WIDTH - 160);

  // Optional motto — small italic line wedged between the subtitle and the
  // divider. The motto is the most personal thing on the card; rendering
  // it in quotes makes it read as the kingdom's own voice rather than UI.
  if (input.motto) {
    ctx.fillStyle = theme.subtitle;
    ctx.font = "italic 22px 'Georgia', 'Times New Roman', serif";
    ctx.fillText(`"${input.motto}"`, CARD_WIDTH / 2, 244, CARD_WIDTH - 200);
  }

  // Divider — pushed slightly down when the motto is present so it doesn't
  // crash into the italic line.
  const dividerY = input.motto ? 268 : 255;
  ctx.fillStyle = theme.divider;
  ctx.fillRect(CARD_WIDTH / 2 - 80, dividerY, 160, 2);

  // Stats row
  if (input.stats) {
    drawStatsRow(ctx, input.stats, theme);
  }

  // Milestones
  ctx.textAlign = "left";
  ctx.font = "26px 'Georgia', 'Times New Roman', serif";
  const milestonesX = 100;
  const milestonesY = input.stats ? 335 : 305;
  const lineHeight = 42;
  const lines = input.milestones.length
    ? input.milestones
    : ["The chronicle is young. Come back in a few days."];
  const bulletColor = theme.bullet || safeHex(input.bannerColor, "#b45309");
  for (let i = 0; i < lines.length; i++) {
    const text = trimMilestoneLine(lines[i], 90);
    const y = milestonesY + i * lineHeight;
    ctx.fillStyle = bulletColor;
    ctx.beginPath();
    ctx.arc(milestonesX, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.body;
    ctx.fillText(text, milestonesX + 18, y + 1, CARD_WIDTH - milestonesX - 80);
  }

  // Footer (left side; portrait inset reserves the right).
  ctx.font = "20px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = theme.footerDate;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(`Day ${input.day} · Year ${input.year}`, 100, CARD_HEIGHT - 60);

  ctx.font = "bold 16px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = theme.footerWordmark;
  ctx.fillText("KingdomOS · jonathanabarnett.github.io/kingdomos", 100, CARD_HEIGHT - 32);

  // Top-right ornament — three dots in the banner color (works on every bg).
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(CARD_WIDTH - 86 + i * 16, 35, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Background painters ────────────────────────────────────────────────

function drawParchmentBackground(ctx: CanvasRenderingContext2D, input: KingdomCardInput): void {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGrad.addColorStop(0, "#fde68a");
  bgGrad.addColorStop(1, "#fbcf6e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Deterministic mottling — same kingdom + day always renders identically.
  const seed = hashSeed(`${input.kingdomName}|${input.day}|${input.year}`);
  const rng = mulberry32(seed);
  for (let i = 0; i < 80; i++) {
    const x = rng() * CARD_WIDTH;
    const y = rng() * CARD_HEIGHT;
    const w = 2 + rng() * 12;
    ctx.fillStyle = `rgba(120, 53, 15, ${0.03 + rng() * 0.06})`;
    ctx.fillRect(x, y, w, 1);
  }

  // Burned-edge vignette
  const vGrad = ctx.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT / 2, 100,
    CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH * 0.65,
  );
  vGrad.addColorStop(0, "rgba(0,0,0,0)");
  vGrad.addColorStop(1, "rgba(80, 40, 15, 0.45)");
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Banner stripe
  const stripeY = 60;
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  ctx.fillRect(60, stripeY, CARD_WIDTH - 120, 8);
  ctx.fillStyle = "rgba(40, 20, 10, 0.18)";
  ctx.fillRect(60, stripeY + 8, CARD_WIDTH - 120, 2);
}

function drawHeraldicBackground(ctx: CanvasRenderingContext2D, input: KingdomCardInput): void {
  // Deep navy → slate gradient.
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGrad.addColorStop(0, "#0f172a");
  bgGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Diagonal hatch — subtle, deterministic per kingdom.
  const seed = hashSeed(`heraldic|${input.kingdomName}|${input.day}|${input.year}`);
  const rng = mulberry32(seed);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const x = rng() * CARD_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 100, CARD_HEIGHT);
    ctx.stroke();
  }

  // Gold inner border, leaving a deep-navy margin.
  ctx.strokeStyle = safeHex(input.bannerColor, "#fbbf24");
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

  // Top-stripe replaced by a centered "banner" cross-piece in gold.
  ctx.fillStyle = safeHex(input.bannerColor, "#fbbf24");
  ctx.fillRect(60, 64, CARD_WIDTH - 120, 4);
  ctx.fillRect(60, 84, CARD_WIDTH - 120, 1);
}

function drawModernBackground(ctx: CanvasRenderingContext2D, input: KingdomCardInput): void {
  // Off-white background with a banner-color left rail. Clean, app-store-y.
  ctx.fillStyle = "#fafaf9";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Left rail — full-height column in the kingdom's banner color.
  ctx.fillStyle = safeHex(input.bannerColor, "#b45309");
  ctx.fillRect(0, 0, 20, CARD_HEIGHT);

  // Subtle horizontal hairline under the title region.
  ctx.fillStyle = "rgba(28, 25, 23, 0.06)";
  ctx.fillRect(60, 264, CARD_WIDTH - 120, 1);

  // Bottom-edge brand stripe.
  ctx.fillStyle = "rgba(28, 25, 23, 0.04)";
  ctx.fillRect(60, CARD_HEIGHT - 78, CARD_WIDTH - 120, 1);
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Coerce a hex color string into a #RRGGBB; fall back if it's invalid. */
function safeHex(hex: string, fallback: string): string {
  if (typeof hex !== "string") return fallback;
  const t = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    // Expand #abc → #aabbcc
    return "#" + t.slice(1).split("").map((c) => c + c).join("");
  }
  return fallback;
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
