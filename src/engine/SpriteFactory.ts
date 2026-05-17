import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Texture,
  RenderTexture,
} from "pixi.js";
import type { TileKind } from "../sim/types";
import { TILE_COLORS } from "./Palette";
import type { CharacterSpec } from "./CharacterSpec";
import { drawCharacter, PixiSurface } from "./CharacterRenderer";
import type { PetSpec } from "./PetSpec";
import { drawPet } from "./PetSpec";

interface SpriteManifest {
  version: number;
  tiles: Partial<Record<TileKind, string[]>>;
  structures: Partial<Record<string, string | null>>;
  characters: Partial<
    Record<
      string,
      {
        sheet: string | null;
        directions: number;
        frames: number;
        frameW: number;
        frameH: number;
      }
    >
  >;
  props: Partial<Record<string, string | null>>;
}

/**
 * Generates 32×32 placeholder textures by drawing them into an offscreen
 * RenderTexture. Real pixel-art tilesets can replace this layer at runtime
 * via `public/sprites/manifest.json` — anything missing from the manifest
 * falls back to procedural placeholder art, so you can swap sprites in one
 * at a time without breaking the world.
 */
export class SpriteFactory {
  readonly tiles = new Map<TileKind, Texture[]>();
  readonly waterFrames = new Map<TileKind, Texture[]>();
  /** Seasonal overrides: key = `"${season}:${kind}"`, value = 4 variant textures. */
  readonly seasonTiles = new Map<string, Texture[]>();
  readonly structures = new Map<string, Texture>();
  readonly characters = new Map<string, Texture[]>();
  readonly props = new Map<string, Texture>();

  static readonly TILE_SIZE = 32;
  private manifest: SpriteManifest | null = null;

  constructor(private app: Application) {}

  async build() {
    await this.loadManifest();
    const kinds: TileKind[] = ["ocean","coast","river","plain","forest","hill","mountain","snow"];
    for (const k of kinds) {
      const override = await this.loadTileOverrides(k);
      if (override && override.length > 0) {
        this.tiles.set(k, override);
        continue;
      }
      const variants: Texture[] = [];
      for (let v = 0; v < 4; v++) variants.push(this.buildTile(k, v));
      this.tiles.set(k, variants);
    }
    this.buildWaterFrames();
    this.buildSeasonalTiles();
    this.structures.set("castle", (await this.loadStructure("castle")) ?? this.buildCastle("#dc2626"));
    this.structures.set("town", (await this.loadStructure("town")) ?? this.buildTown());
    this.structures.set("library", (await this.loadStructure("library")) ?? this.buildLibrary());
    this.structures.set("forge", (await this.loadStructure("forge")) ?? this.buildForge());
    this.structures.set("mine", (await this.loadStructure("mine")) ?? this.buildMine());
    this.structures.set("watchtower", (await this.loadStructure("watchtower")) ?? this.buildWatchtower());
    this.structures.set("mill", (await this.loadStructure("mill")) ?? this.buildMill());
    this.structures.set("shrine", (await this.loadStructure("shrine")) ?? this.buildShrine());
    // Spontaneous landmarks discovered by the NarrativeDirector
    this.structures.set("standing_stones", (await this.loadStructure("standing_stones")) ?? this.buildStandingStones());
    this.structures.set("ruin", (await this.loadStructure("ruin")) ?? this.buildRuin());
    this.structures.set("camp", (await this.loadStructure("camp")) ?? this.buildCamp());
    this.structures.set("wellspring", (await this.loadStructure("wellspring")) ?? this.buildWellspring());
    this.structures.set("obelisk", (await this.loadStructure("obelisk")) ?? this.buildObelisk());
    this.structures.set("astronomers_tower", (await this.loadStructure("astronomers_tower")) ?? this.buildAstronomersTower());

    const roles = ["villager", "courier", "scholar", "blacksmith", "miner", "guard"];
    for (const r of roles) {
      const override = await this.loadCharacterSheet(r);
      this.characters.set(r, override ?? this.buildCharacterFrames(r));
    }
    // Monarch starts with a placeholder; real spec is plugged in by the
    // character creator via setSpecCharacter("monarch", spec).
    this.characters.set("monarch", this.buildCharacterFrames("villager"));
    // Pets — two builtin breeds, both 24x16 stubby creatures
    this.characters.set("pet_dog", this.buildPetFrames("dog"));
    this.characters.set("pet_cat", this.buildPetFrames("cat"));
    this.props.set("airship", (await this.loadProp("airship")) ?? this.buildAirship());
    this.props.set("monster", (await this.loadProp("monster")) ?? this.buildMonster());
    this.props.set("rain_drop", (await this.loadProp("rain_drop")) ?? this.buildRainDrop());
    this.props.set("snow_flake", (await this.loadProp("snow_flake")) ?? this.buildSnowflake());
    this.props.set("spark", (await this.loadProp("spark")) ?? this.buildSpark());
    this.props.set("smoke", (await this.loadProp("smoke")) ?? this.buildSmoke());
    this.props.set("firework", (await this.loadProp("firework")) ?? this.buildFirework());
    this.props.set("cloud", (await this.loadProp("cloud")) ?? this.buildCloud());
  }

  private rt(g: Graphics, w: number, h: number): Texture {
    const tex = RenderTexture.create({ width: w, height: h, resolution: 1, antialias: false });
    this.app.renderer.render({ container: g, target: tex });
    g.destroy();
    return tex;
  }

  // ── manifest loaders ────────────────────────────────────────────────────
  //
  // Asset URLs honor the Vite base path so the same fetches work in three
  // deployment shapes:
  //   - Local dev / Tauri / itch.io HTML5 → base "/" → "/sprites/..."
  //   - GitHub Pages (subpath deploy)     → base "/kingdomos/" → "/kingdomos/sprites/..."
  //
  // `import.meta.env.BASE_URL` is set at build time by vite.config.ts's
  // `base` option (gated on the GITHUB_PAGES_BASE env var). It always ends
  // with "/" so the concat is safe.

  private get spritesBase(): string {
    return `${import.meta.env.BASE_URL}sprites/`;
  }

  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${this.spritesBase}manifest.json`, { cache: "no-cache" });
      if (!res.ok) return;
      this.manifest = (await res.json()) as SpriteManifest;
    } catch (err) {
      console.warn("[SpriteFactory] manifest load failed; using programmatic art", err);
    }
  }

  private async loadPng(path: string): Promise<Texture | null> {
    const url = `${this.spritesBase}${path}`;
    try {
      const tex = await Assets.load<Texture>(url);
      if (tex && tex.source) {
        // ensure nearest-neighbor sampling for pixel-art crispness
        tex.source.scaleMode = "nearest";
      }
      return tex ?? null;
    } catch (err) {
      console.warn(`[SpriteFactory] failed to load ${url}`, err);
      return null;
    }
  }

  private async loadTileOverrides(kind: TileKind): Promise<Texture[] | null> {
    const files = this.manifest?.tiles?.[kind];
    if (!files || files.length === 0) return null;
    const out: Texture[] = [];
    for (const f of files) {
      const t = await this.loadPng(`tiles/${f}`);
      if (t) out.push(t);
    }
    return out.length ? out : null;
  }

  private async loadStructure(kind: string): Promise<Texture | null> {
    const file = this.manifest?.structures?.[kind];
    if (!file) return null;
    return this.loadPng(`structures/${file}`);
  }

  private async loadProp(name: string): Promise<Texture | null> {
    const file = this.manifest?.props?.[name];
    if (!file) return null;
    return this.loadPng(`props/${file}`);
  }

  private async loadCharacterSheet(role: string): Promise<Texture[] | null> {
    const cfg = this.manifest?.characters?.[role];
    if (!cfg?.sheet) return null;
    const sheet = await this.loadPng(`characters/${cfg.sheet}`);
    if (!sheet) return null;
    // Slice into individual frames. We use the south-facing row (row 0) as
    // the default cycle the entity layer reads; future work can pick per
    // direction via npc.facing.
    const frames: Texture[] = [];
    const { frameW, frameH, frames: cols } = cfg;
    for (let i = 0; i < cols; i++) {
      const sub = new Texture({
        source: sheet.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      });
      frames.push(sub);
    }
    return frames;
  }

  private buildWaterFrames(): void {
    const T = SpriteFactory.TILE_SIZE;
    const waterKinds: TileKind[] = ["ocean", "river"];
    for (const kind of waterKinds) {
      const colors = TILE_COLORS[kind];
      const [base, c1, c2] = colors;
      const frames: Texture[] = [];
      for (let frame = 0; frame < 4; frame++) {
        const g = new Graphics();
        // base fill
        g.rect(0, 0, T, T).fill(base);

        // seeded random for deterministic highlight placement
        let s = (kind.length * 31 + frame * 7919) >>> 0;
        const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

        // 3 wave dash lines, y positions shift by frame * 2 (wrapping within tile)
        const offset = frame * 2;
        const waveRows = [6, 18, 24];
        const waveColors = [c2, c1, c2];
        const waveWidths = [6, 8, 10];
        const waveXs = [4, 18, 10];
        for (let i = 0; i < 3; i++) {
          const wy = ((waveRows[i] + offset) % T) as number;
          g.rect(waveXs[i], wy, waveWidths[i], 1).fill(waveColors[i]);
        }

        // small highlight pixels at random-but-seeded positions
        for (let i = 0; i < 5; i++) {
          const hx = Math.floor(rand() * T);
          const hy = Math.floor(rand() * T);
          g.rect(hx, hy, 1, 1).fill(c1);
        }

        // subtle shimmer: every other frame, lighten a few extra pixels by ~15%
        if (frame % 2 === 0) {
          for (let i = 0; i < 4; i++) {
            const sx = Math.floor(rand() * T);
            const sy = Math.floor(rand() * T);
            g.rect(sx, sy, 1, 1).fill(lightenHex(base, 0.15));
          }
        }

        frames.push(this.rt(g, T, T));
      }
      this.waterFrames.set(kind, frames);
    }
  }

  /**
   * Generate seasonal tile overrides for the tiles that visually change across
   * seasons. Autumn turns forest crowns orange/rust; winter adds snow patches
   * to plains and hilltops and white-crowns the trees. Spring and summer use
   * the base procedural tiles unchanged.
   *
   * Stored in `seasonTiles` as `"${season}:${kind}"` → 4-variant array.
   * TileRenderer checks this map and falls back to the base tiles if absent.
   */
  private buildSeasonalTiles(): void {
    const T = SpriteFactory.TILE_SIZE;
    const SEASONS = ["autumn", "winter"] as const;
    const AFFECTED: TileKind[] = ["forest", "plain", "hill"];

    for (const season of SEASONS) {
      for (const kind of AFFECTED) {
        const variants: Texture[] = [];
        for (let v = 0; v < 4; v++) {
          variants.push(this._buildSeasonalTile(kind, v, season, T));
        }
        this.seasonTiles.set(`${season}:${kind}`, variants);
      }
    }
  }

  private _buildSeasonalTile(
    kind: TileKind,
    variant: number,
    season: "autumn" | "winter",
    T: number,
  ): Texture {
    const g = new Graphics();
    const seed = variant * 7919 + kind.length * 31 + (season === "winter" ? 99991 : 44449);
    let s = seed >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    if (kind === "forest") {
      const AUTUMN_CROWN  = ["#c2410c", "#d97706", "#b45309", "#92400e"];
      const WINTER_CROWN  = ["#dbeafe", "#bfdbfe", "#e0f2fe", "#cffafe"];
      const WINTER_GROUND = "#d1d5db";
      const trunk = "#3c1f0a";

      // Ground
      if (season === "winter") {
        g.rect(0, 0, T, T).fill(WINTER_GROUND);
        for (let i = 0; i < 8; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 2, 1).fill("#ffffff");
        }
      } else {
        // Autumn ground — dry dark soil
        g.rect(0, 0, T, T).fill("#78350f");
        for (let i = 0; i < 6; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 1).fill("#92400e");
        }
      }

      // Trunk
      const tx = 8 + variant * 4;
      const ty = 6;
      g.rect(tx + 6, ty + 12, 4, 8).fill(trunk);
      g.rect(tx + 6, ty + 12, 1, 8).fill(lightenHex(trunk, 0.25));

      // Crown
      const palette = season === "winter" ? WINTER_CROWN : AUTUMN_CROWN;
      const [c0, c1, c2] = palette;
      g.rect(tx + 2, ty, 12, 12).fill(c0);
      g.rect(tx + 4, ty - 2, 8, 4).fill(c1);
      g.rect(tx, ty + 2, 4, 8).fill(c1);
      g.rect(tx + 12, ty + 2, 4, 8).fill(c1);
      // highlight
      g.rect(tx + 3, ty + 1, 4, 1).fill(lightenHex(c2, 0.3));
      if (season === "winter") {
        // snow drip on crown tip
        g.rect(tx + 5, ty - 3, 6, 2).fill("#ffffff");
        g.rect(tx + 5, ty - 1, 2, 2).fill("#e0f2fe");
      }

    } else if (kind === "plain") {
      if (season === "winter") {
        // Snow-covered plain
        g.rect(0, 0, T, T).fill("#d1d5db");
        // Snow patches
        for (let i = 0; i < 12; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 2 + Math.floor(rand() * 3), 1).fill("#ffffff");
        }
        // Dead grass poking through
        for (let i = 0; i < 6; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 2).fill("#9ca3af");
        }
      } else {
        // Autumn plain — dry golden-brown
        g.rect(0, 0, T, T).fill("#92400e");
        for (let i = 0; i < 14; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 2).fill("#b45309");
        }
        for (let i = 0; i < 8; i++) {
          g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 1).fill("#d97706");
        }
      }

    } else { // hill
      const base = season === "winter" ? "#9ca3af" : TILE_COLORS["hill"][0];
      g.rect(0, 0, T, T).fill(base);
      // Mound
      for (let y = 0; y < 8; y++) {
        g.rect(6 + y, 4 + y, 20 - y * 2, 1).fill(season === "winter" ? "#d1d5db" : TILE_COLORS["hill"][1]);
      }
      if (season === "winter") {
        // Snow cap
        g.rect(10, 3, 12, 3).fill("#ffffff");
        g.rect(13, 4, 6, 1).fill("#f0f9ff");
      } else {
        g.rect(13, 4, 6, 1).fill(TILE_COLORS["hill"][2]);
      }
      // Second mound
      const m2x = 18 + variant;
      g.rect(m2x, 18, 8, 4).fill(season === "winter" ? "#d1d5db" : TILE_COLORS["hill"][1]);
      // Noise speckle
      for (let i = 0; i < 10; i++) {
        g.rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 1).fill(
          season === "winter" ? "#e5e7eb" : darkenHex(base, 0.08),
        );
      }
    }

    return this.rt(g, T, T);
  }

  private buildTile(kind: TileKind, variant: number): Texture {
    const T = SpriteFactory.TILE_SIZE;
    const colors = TILE_COLORS[kind];
    const [base, c1, c2, edge] = colors;
    const g = new Graphics();
    // base fill
    g.rect(0, 0, T, T).fill(base);
    // simple deterministic dither so tiles don't look flat
    const seed = variant * 7919 + (kind.length * 31);
    let s = seed >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    if (kind === "ocean" || kind === "river") {
      // wave dashes
      g.rect(4, 6 + variant, 6, 1).fill(c2);
      g.rect(18, 18 - variant, 8, 1).fill(c1);
      g.rect(10, 24, 10, 1).fill(c2);
    } else if (kind === "coast") {
      // More sand/shell-fleck speckle so each variant looks distinct.
      for (let i = 0; i < 20; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 1).fill(c1);
      }
      // Occasional 2px highlight crystal — picks up the sun.
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(rand() * (T - 1));
        const y = Math.floor(rand() * (T - 1));
        g.rect(x, y, 2, 1).fill(lightenHex(base, 0.18));
      }
    } else if (kind === "plain") {
      // grass tufts — denser pass + a darker noise band for depth
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 2).fill(c1);
      }
      // Subtle darker noise — pixels of darken(base, 0.1) — gives a worn-grass feel
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 1).fill(darkenHex(base, 0.10));
      }
    } else if (kind === "forest") {
      // base grass — denser
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 1).fill("#14532d");
      }
      // dappled light through the canopy
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 1).fill(lightenHex(c1, 0.22));
      }
      // tree
      const tx = 8 + variant * 4;
      const ty = 6;
      // trunk — darkened further so the silhouette survives night tint
      const trunk = "#3c1f0a";
      g.rect(tx + 6, ty + 12, 4, 8).fill(trunk);
      // crown — main mass + side bushes + top crest. We push a bright
      // accent pixel cluster so the green stays distinguishable from the
      // trunk under heavy color-multiplier tinting.
      g.rect(tx + 2, ty, 12, 12).fill(c1);
      g.rect(tx + 4, ty - 2, 8, 4).fill(c2);
      g.rect(tx, ty + 2, 4, 8).fill(c2);
      g.rect(tx + 12, ty + 2, 4, 8).fill(c2);
      // Crown highlight crescent (upper-left, lit by implicit sun)
      g.rect(tx + 3, ty + 1, 4, 1).fill(lightenHex(c2, 0.35));
      g.rect(tx + 3, ty + 2, 2, 2).fill(lightenHex(c2, 0.35));
      // Trunk highlight + base shadow
      g.rect(tx + 6, ty + 12, 1, 8).fill(lightenHex(trunk, 0.25));
      g.rect(tx + 5, ty + 19, 6, 1).fill("#000000");
    } else if (kind === "hill") {
      g.rect(0, 0, T, T).fill(base);
      // Mound highlight — bigger, with a brighter crest row so it still
      // reads as a hill after the night-palette tint multiplies it down.
      for (let y = 0; y < 8; y++) {
        g.rect(6 + y, 4 + y, 20 - y * 2, 1).fill(c1);
      }
      // Crest row — single brighter line at the top of the mound
      g.rect(13, 4, 6, 1).fill(c2);
      // A second smaller mound to the right, offset by variant
      const m2x = 18 + variant;
      g.rect(m2x, 18, 8, 4).fill(c1);
      g.rect(m2x + 2, 17, 4, 1).fill(c2);
      // Some grass speckle on the slopes — keeps the tile from looking
      // like a flat color block
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rand() * T);
        const y = Math.floor(rand() * T);
        g.rect(x, y, 1, 1).fill(darkenHex(base, 0.08));
      }
    } else if (kind === "mountain") {
      g.rect(0, 0, T, T).fill(base);
      // peak triangle
      for (let y = 0; y < 16; y++) {
        g.rect(16 - y, 28 - y, y * 2, 1).fill(c2);
      }
    } else if (kind === "snow") {
      g.rect(0, 0, T, T).fill(base);
      for (let y = 0; y < 12; y++) {
        g.rect(16 - y, 28 - y, y * 2, 1).fill(c1);
      }
    }
    // The hard 1px frame on every tile was what made the map read as a
    // *checkerboard* rather than terrain. Only the geological tiles
    // (hill/mountain/snow) keep a frame, and even then we soften it with
    // alpha so adjacent tiles blend more cleanly.
    if (kind === "hill" || kind === "mountain" || kind === "snow") {
      g.rect(0, 0, T, 1).fill({ color: edge, alpha: 0.6 });
      g.rect(0, T - 1, T, 1).fill({ color: edge, alpha: 0.6 });
      g.rect(0, 0, 1, T).fill({ color: edge, alpha: 0.6 });
      g.rect(T - 1, 0, 1, T).fill({ color: edge, alpha: 0.6 });
    }
    return this.rt(g, T, T);
  }

  private buildCastle(bannerColor: string = "#dc2626"): Texture {
    const W = 32 * 4, H = 32 * 3;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });

    // Palette — proper 3-tone stone gives the silhouette real volume rather
    // than the original flat gray block.
    const stoneLight = "#c0c8d0";
    const stone = "#9ca3af";
    const stoneDark = "#5a6573";
    const stoneShadow = "#374151";
    const door = "#3f2616";
    const doorEdge = "#1a0e07";
    const window = "#1a2a3a";
    const windowGlow = "#fde68a"; // warm light through the window slits
    const bannerShade = this.darken(bannerColor, 0.7);

    // ── Main keep (the big block) ──────────────────────────────────────
    // top shadow band
    g.rect(8, 32, W - 16, H - 32).fill(stone);
    g.rect(8, 32, W - 16, 3).fill(stoneLight);     // sun-side highlight
    g.rect(8, 33, 2, H - 33).fill(stoneLight);     // left edge highlight
    g.rect(W - 10, 33, 2, H - 33).fill(stoneShadow); // right edge shadow
    g.rect(8, H - 4, W - 16, 4).fill(stoneShadow); // ground shadow

    // Stone-block courses — thin horizontal lines suggesting masonry
    for (let y = 44; y < H - 8; y += 10) {
      g.rect(10, y, W - 20, 1).fill(stoneDark);
    }
    // Vertical seams every 12 px, staggered
    for (let y = 36; y < H - 8; y += 10) {
      const offset = ((y - 36) / 10) % 2 === 0 ? 0 : 6;
      for (let x = 14 + offset; x < W - 14; x += 12) {
        g.rect(x, y, 1, 8).fill(stoneDark);
      }
    }

    // Keep windows — narrow arrow-slits with a warm glow inside
    for (const wx of [W * 0.25, W * 0.75]) {
      g.rect(wx - 2, 44, 4, 8).fill(window);
      g.rect(wx, 46, 1, 1).fill(windowGlow);
      g.rect(wx - 2, 60, 4, 6).fill(window);
      g.rect(wx, 62, 1, 1).fill(windowGlow);
    }

    // Crenellations across the keep top
    for (let i = 0; i < 7; i++) {
      const x = 8 + i * 16;
      g.rect(x, 24, 8, 8).fill(stone);
      g.rect(x, 24, 8, 2).fill(stoneLight);
      g.rect(x, 30, 8, 2).fill(stoneShadow);
    }

    // ── Side towers (smaller, flanking) ─────────────────────────────────
    for (const tx of [12, W - 24]) {
      g.rect(tx, 18, 12, H - 18).fill(stone);
      g.rect(tx, 18, 12, 2).fill(stoneLight);
      g.rect(tx, 20, 2, H - 20).fill(stoneLight);
      g.rect(tx + 10, 20, 2, H - 20).fill(stoneShadow);
      // narrow window
      g.rect(tx + 5, 30, 2, 5).fill(window);
      g.rect(tx + 6, 31, 1, 1).fill(windowGlow);
      // conical cap
      g.rect(tx - 1, 14, 14, 4).fill(stoneShadow);
      g.rect(tx + 2, 10, 8, 4).fill(stone);
      g.rect(tx + 4, 6, 4, 4).fill(stone);
    }

    // ── Central tower (bigger, in the middle, holds the banner) ─────────
    g.rect(W / 2 - 12, 8, 24, H - 8).fill(stone);
    g.rect(W / 2 - 12, 8, 24, 3).fill(stoneLight);
    g.rect(W / 2 - 12, 10, 2, H - 10).fill(stoneLight);
    g.rect(W / 2 + 10, 10, 2, H - 10).fill(stoneShadow);
    // Central tower window — bigger, also lit, with proper 4-pane mullion
    g.rect(W / 2 - 3, 30, 6, 8).fill(window);
    g.rect(W / 2 - 2, 31, 4, 6).fill(windowGlow);
    g.rect(W / 2, 33, 1, 1).fill("#fff7d6");
    // 4-pane cross + arch curve hint
    g.rect(W / 2, 31, 1, 6).fill(window);
    g.rect(W / 2 - 2, 34, 4, 1).fill(window);
    g.rect(W / 2 - 2, 31, 4, 1).fill(stoneShadow);
    // Wall halo cast by the central window
    g.rect(W / 2 - 5, 29, 10, 1).fill({ color: windowGlow, alpha: 0.2 });
    g.rect(W / 2 - 5, 38, 10, 1).fill({ color: windowGlow, alpha: 0.15 });
    // Crenellations on the central tower
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 12 + i * 8 + 2;
      g.rect(x, 0, 4, 8).fill(stone);
      g.rect(x, 0, 4, 1).fill(stoneLight);
    }
    // The top "battlement floor"
    g.rect(W / 2 - 12, 8, 24, 2).fill(stoneShadow);

    // ── Banner (player-customizable color, shaded) ──────────────────────
    g.rect(W / 2 - 1, -10, 2, 14).fill("#1f2937"); // pole
    g.rect(W / 2, -10, 1, 1).fill("#fbbf24");      // brass finial
    // banner cloth with light/dark shading
    g.rect(W / 2 + 1, -8, 9, 6).fill(bannerColor);
    g.rect(W / 2 + 1, -8, 9, 1).fill(this.lighten(bannerColor, 0.3));
    g.rect(W / 2 + 1, -3, 9, 1).fill(bannerShade);
    // tiny dagged edge
    g.rect(W / 2 + 10, -2, 1, 1).fill(bannerShade);

    // ── Gatehouse door ──────────────────────────────────────────────────
    // archway shadow
    g.rect(W / 2 - 8, H - 22, 16, 22).fill(stoneShadow);
    // door itself
    g.rect(W / 2 - 6, H - 20, 12, 20).fill(door);
    g.rect(W / 2 - 6, H - 20, 12, 2).fill(doorEdge);
    g.rect(W / 2 - 6, H - 20, 1, 20).fill(doorEdge);
    g.rect(W / 2 + 5, H - 20, 1, 20).fill(doorEdge);
    // plank seam
    g.rect(W / 2 - 1, H - 20, 1, 20).fill(doorEdge);
    // iron studs
    for (const sy of [H - 17, H - 11, H - 5]) {
      g.rect(W / 2 - 3, sy, 1, 1).fill("#1a1a1a");
      g.rect(W / 2 + 3, sy, 1, 1).fill("#1a1a1a");
    }
    // archway keystone
    g.rect(W / 2 - 1, H - 24, 2, 4).fill(stoneLight);

    return this.rt(g, W, H);
  }

  /** Brighten a hex color by mixing with white. */
  private lighten(hex: string, t: number): string {
    return this.mix(hex, "#ffffff", t);
  }

  /** Darken a hex color by mixing with black. */
  private darken(hex: string, t: number): string {
    return this.mix(hex, "#000000", t);
  }

  private mix(a: string, b: string, t: number): string {
    const pa = this.hex(a);
    const pb = this.hex(b);
    const r = Math.round(pa[0] * (1 - t) + pb[0] * t);
    const g = Math.round(pa[1] * (1 - t) + pb[1] * t);
    const bl = Math.round(pa[2] * (1 - t) + pb[2] * t);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
  }

  private hex(c: string): [number, number, number] {
    const s = c.replace("#", "");
    const v = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  }

  /**
   * Rebuild the castle texture with a new banner color and dispose the old.
   * Existing castle Sprites pick this up on next frame because the renderer
   * looks up textures by key each tick.
   *
   * NOTE: StructureLayer currently snapshots the texture once at construction
   * time, so we also need to refresh sprites in the structure layer when
   * called from App.tsx.
   */
  rebuildCastle(bannerColor: string): Texture {
    const prev = this.structures.get("castle");
    const tex = this.buildCastle(bannerColor);
    this.structures.set("castle", tex);
    if (prev) {
      setTimeout(() => {
        try {
          prev.destroy(true);
        } catch {
          /* ignore */
        }
      }, 100);
    }
    return tex;
  }

  private buildTown(): Texture {
    const W = 32 * 3, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    // Palette — warm plaster with terracotta roofs + dark door wood.
    const wallLight = "#ecd9b9";
    const wall = "#d6c0a3";
    const wallShade = "#8b6f47";
    const wallShadow = "#5e4a2a";
    const roof = "#b91c1c";
    const roofLight = "#dc2626";
    const roofDark = "#7f1d1d";
    const door = "#3f2616";
    const doorEdge = "#1a0e07";
    const windowGlow = "#fde68a";
    const windowGlowBright = "#fff7d6";
    const stoneChimney = "#78716c";
    const chimneyDark = "#44403c";
    const smokeA = "#9ca3af";
    const smokeB = "#cbd5e1";

    for (let i = 0; i < 3; i++) {
      const x = i * 32;
      const wallY = 24;

      // ── House body ─────────────────────────────────────────────────────
      g.rect(x + 4, wallY, 24, 32).fill(wall);
      g.rect(x + 4, wallY, 2, 32).fill(wallLight);    // left edge highlight
      g.rect(x + 6, wallY, 22, 2).fill(wallShade);    // top shade band
      g.rect(x + 26, wallY, 2, 32).fill(wallShade);   // right edge shadow

      // Wall texture — faint horizontal "plaster" hint
      for (let py = wallY + 6; py < wallY + 30; py += 8) {
        g.rect(x + 5, py, 22, 1).fill(wallShade);
      }

      // ── Roof: peaked triangle with two-tone shading ────────────────────
      for (let y = 0; y < 12; y++) {
        const fill = y < 4 ? roofLight : y < 9 ? roof : roofDark;
        g.rect(x + 4 + y, wallY - y - 1, 24 - y * 2, 1).fill(fill);
      }
      // Roof tile-line hints
      for (let y = 1; y < 11; y += 3) {
        g.rect(x + 4 + y, wallY - y - 1, 24 - y * 2, 1).fill(roofDark);
      }
      // Roof ridge highlight
      g.rect(x + 14, wallY - 12, 4, 1).fill(roofLight);

      // ── Chimney + smoke ────────────────────────────────────────────────
      // Chimneys staggered by index for variety
      const chimneyX = i === 1 ? x + 8 : x + 22;
      g.rect(chimneyX, wallY - 18, 4, 16).fill(stoneChimney);
      g.rect(chimneyX, wallY - 18, 4, 2).fill(chimneyDark);
      g.rect(chimneyX, wallY - 19, 6, 1).fill(chimneyDark);     // chimney cap
      // Chimney brick courses — 1px shadow lines every few rows
      g.rect(chimneyX, wallY - 14, 4, 1).fill(chimneyDark);
      g.rect(chimneyX, wallY - 9, 4, 1).fill(chimneyDark);
      // Chimney left-edge highlight (light source up-left)
      g.rect(chimneyX, wallY - 17, 1, 14).fill("#a8a29e");
      // Warm glow inside the chimney opening
      g.rect(chimneyX + 1, wallY - 18, 2, 1).fill({ color: "#fb923c", alpha: 0.6 });
      // Smoke wisps
      g.rect(chimneyX + 1, wallY - 22, 2, 2).fill(smokeA);
      g.rect(chimneyX, wallY - 24, 3, 1).fill(smokeB);
      g.rect(chimneyX + 2, wallY - 26, 2, 1).fill(smokeB);

      // ── Door ────────────────────────────────────────────────────────────
      g.rect(x + 13, wallY + 16, 6, 16).fill(door);
      g.rect(x + 13, wallY + 16, 6, 2).fill(doorEdge);   // top edge
      g.rect(x + 13, wallY + 16, 1, 16).fill(doorEdge);  // left edge
      g.rect(x + 18, wallY + 16, 1, 16).fill(doorEdge);  // right edge
      g.rect(x + 15, wallY + 16, 1, 16).fill(doorEdge);  // plank seam
      g.rect(x + 17, wallY + 16, 1, 16).fill(doorEdge);  // plank seam
      // Door knob — brass with a tiny highlight pip
      g.rect(x + 17, wallY + 23, 1, 1).fill("#fbbf24");
      g.rect(x + 16, wallY + 23, 1, 1).fill({ color: "#ffffff", alpha: 0.6 });
      // Door-frame stone lintel — slim arch shadow above the door
      g.rect(x + 12, wallY + 14, 8, 2).fill(wallShadow);
      g.rect(x + 13, wallY + 14, 6, 1).fill(wallShade);
      // Door step — a thin stone slab at the threshold
      g.rect(x + 11, wallY + 30, 10, 2).fill(stoneChimney);
      g.rect(x + 11, wallY + 30, 10, 1).fill("#a8a29e");

      // ── Windows: shuttered, warm glow ──────────────────────────────────
      // Window frame (darker recess)
      g.rect(x + 7, wallY + 6, 6, 6).fill(wallShadow);
      g.rect(x + 19, wallY + 6, 6, 6).fill(wallShadow);
      // Glass with warm glow
      g.rect(x + 8, wallY + 7, 4, 4).fill(windowGlow);
      g.rect(x + 20, wallY + 7, 4, 4).fill(windowGlow);
      // Window cross-bar (4-pane look)
      g.rect(x + 9, wallY + 7, 1, 4).fill(wallShade);
      g.rect(x + 8, wallY + 8, 4, 1).fill(wallShade);
      g.rect(x + 21, wallY + 7, 1, 4).fill(wallShade);
      g.rect(x + 20, wallY + 8, 4, 1).fill(wallShade);
      // Tiny bright spot in one pane (lamp inside)
      g.rect(x + 10, wallY + 9, 1, 1).fill(windowGlowBright);
      g.rect(x + 22, wallY + 9, 1, 1).fill(windowGlowBright);

      // ── Ground shadow under the house ──────────────────────────────────
      g.rect(x + 4, H - 2, 24, 2).fill(wallShadow);
    }

    // Connecting cobblestone path between houses
    g.rect(W / 2 - 8, H - 4, 16, 4).fill("#857569");
    for (let cx = W / 2 - 7; cx < W / 2 + 7; cx += 3) {
      g.rect(cx, H - 3, 1, 1).fill("#a8998b");
    }

    return this.rt(g, W, H);
  }

  private buildLibrary(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });

    // Palette — warm stone walls + cool dome contrast
    const wallLight = "#92492a";
    const wall = "#7c2d12";
    const wallDark = "#451a03";
    const wallShadow = "#1c0900";
    const domeLight = "#c4b5fd";
    const dome = "#a78bfa";
    const domeDark = "#5b21b6";
    const accent = "#fde047";
    const accentDark = "#ca8a04";
    const door = "#3f2616";
    const doorEdge = "#1a0e07";
    const windowGlow = "#fde68a";
    const windowFrame = "#451a03";
    const lanternLight = "#fef3c7";

    // ── Stone body ─────────────────────────────────────────────────────
    g.rect(2, 16, W - 4, H - 16).fill(wall);
    g.rect(2, 16, W - 4, 2).fill(wallDark);          // top shade
    g.rect(2, 16, 2, H - 16).fill(wallLight);        // left edge highlight
    g.rect(W - 4, 16, 2, H - 16).fill(wallDark);     // right edge shadow
    g.rect(2, H - 2, W - 4, 2).fill(wallShadow);     // ground shadow
    // Faint stone-block courses
    for (let y = 22; y < H - 2; y += 8) {
      g.rect(4, y, W - 8, 1).fill(wallDark);
    }

    // ── Dome ──────────────────────────────────────────────────────────
    g.circle(W / 2, 16, 14).fill(dome);
    g.circle(W / 2, 16, 14).stroke({ width: 2, color: domeDark });
    // Highlight crescent on dome (suggest light source from upper-left)
    g.circle(W / 2 - 3, 14, 5).fill(domeLight);
    // Dome base ring
    g.rect(W / 2 - 14, 14, 28, 2).fill(domeDark);

    // ── Spire with finial ─────────────────────────────────────────────
    g.rect(W / 2 - 1, 0, 2, 6).fill(accent);
    g.rect(W / 2 - 1, 0, 2, 2).fill(accentDark);
    // Tiny cross-piece at top
    g.rect(W / 2 - 2, 1, 4, 1).fill(accentDark);

    // ── Arched windows with warm glow ─────────────────────────────────
    // Left window
    g.rect(8, 24, 6, 12).fill(windowFrame);
    g.rect(9, 26, 4, 10).fill(windowGlow);
    g.rect(9, 26, 4, 1).fill(domeDark);              // arch top hint
    g.rect(11, 25, 1, 1).fill(windowFrame);          // arch curve
    g.rect(10, 30, 1, 1).fill(lanternLight);         // bright spot

    // Right window
    g.rect(W - 14, 24, 6, 12).fill(windowFrame);
    g.rect(W - 13, 26, 4, 10).fill(windowGlow);
    g.rect(W - 13, 26, 4, 1).fill(domeDark);
    g.rect(W - 12, 25, 1, 1).fill(windowFrame);
    g.rect(W - 12, 30, 1, 1).fill(lanternLight);

    // Wall halo cast by each window — warm glow bleeds onto the surrounding
    // stone. Tiny detail, but the building feels lived-in instead of dark.
    g.rect(7, 23, 8, 1).fill({ color: windowGlow, alpha: 0.25 });
    g.rect(7, 36, 8, 1).fill({ color: windowGlow, alpha: 0.18 });
    g.rect(W - 15, 23, 8, 1).fill({ color: windowGlow, alpha: 0.25 });
    g.rect(W - 15, 36, 8, 1).fill({ color: windowGlow, alpha: 0.18 });
    // Window mullion cross-bars — proper 4-pane lattice for both windows
    g.rect(11, 26, 1, 10).fill(windowFrame);
    g.rect(9, 30, 4, 1).fill(windowFrame);
    g.rect(W - 11, 26, 1, 10).fill(windowFrame);
    g.rect(W - 13, 30, 4, 1).fill(windowFrame);

    // ── Door (recessed archway) ───────────────────────────────────────
    g.rect(W / 2 - 6, H - 16, 12, 16).fill(wallShadow);   // archway shadow
    g.rect(W / 2 - 5, H - 14, 10, 14).fill(door);
    g.rect(W / 2 - 5, H - 14, 10, 1).fill(doorEdge);      // top edge
    g.rect(W / 2 - 5, H - 14, 1, 14).fill(doorEdge);      // left
    g.rect(W / 2 + 4, H - 14, 1, 14).fill(doorEdge);      // right
    g.rect(W / 2, H - 14, 1, 14).fill(doorEdge);          // center seam
    g.rect(W / 2 + 2, H - 7, 1, 1).fill(accent);          // brass handle

    // ── Two small lanterns flanking the door ──────────────────────────
    g.rect(W / 2 - 9, H - 12, 2, 4).fill("#1a1a1a");      // bracket
    g.rect(W / 2 - 10, H - 10, 4, 4).fill(accentDark);    // lantern body
    g.rect(W / 2 - 9, H - 9, 2, 2).fill(lanternLight);    // glow
    g.rect(W / 2 + 7, H - 12, 2, 4).fill("#1a1a1a");
    g.rect(W / 2 + 6, H - 10, 4, 4).fill(accentDark);
    g.rect(W / 2 + 7, H - 9, 2, 2).fill(lanternLight);

    return this.rt(g, W, H);
  }

  private buildForge(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });

    // Palette — soot-stained dark stone with hot orange/yellow fire glow
    const stoneLight = "#52525b";
    const stone = "#3f3f46";
    const stoneDark = "#27272a";
    const stoneShadow = "#0c0a09";
    const chimney = "#52525b";
    const chimneyDark = "#27272a";
    const sootStreak = "#1c1917";
    const fireDeep = "#7f1d1d";
    const fireMid = "#dc2626";
    const fireOrange = "#f97316";
    const fireYellow = "#fde047";
    const fireWhite = "#fff7d6";
    const anvilDark = "#27272a";
    const anvilLight = "#52525b";
    const smokeA = "#6b7280";
    const smokeB = "#9ca3af";

    // ── Building body ─────────────────────────────────────────────────
    g.rect(2, 18, W - 4, H - 18).fill(stone);
    g.rect(2, 18, W - 4, 2).fill(stoneDark);
    g.rect(2, 18, 2, H - 18).fill(stoneLight);
    g.rect(W - 4, 18, 2, H - 18).fill(stoneDark);
    g.rect(2, H - 2, W - 4, 2).fill(stoneShadow);

    // Stone-block courses
    for (let y = 22; y < H - 4; y += 7) {
      g.rect(4, y, W - 8, 1).fill(stoneDark);
    }
    // Soot streaks rising up the wall around the fire opening
    for (let sy = 30; sy >= 20; sy -= 2) {
      g.rect(9 + Math.floor((30 - sy) / 4), sy, 1, 1).fill(sootStreak);
      g.rect(20 - Math.floor((30 - sy) / 4), sy, 1, 1).fill(sootStreak);
    }

    // ── Chimney with rising smoke ─────────────────────────────────────
    g.rect(W - 14, 0, 8, 22).fill(chimney);
    g.rect(W - 14, 0, 8, 2).fill(chimneyDark);
    g.rect(W - 16, 0, 12, 3).fill(chimneyDark);      // cap flare
    g.rect(W - 14, 0, 2, 22).fill(stoneLight);       // left edge highlight
    g.rect(W - 8, 0, 2, 22).fill(chimneyDark);       // right edge shadow
    // Smoke plume
    g.rect(W - 11, -4, 4, 3).fill(smokeA);
    g.rect(W - 13, -8, 5, 3).fill(smokeB);
    g.rect(W - 10, -12, 3, 2).fill(smokeA);

    // ── Fire opening (huge, glowing) ──────────────────────────────────
    // Outer recess (darker than wall)
    g.rect(6, 28, 18, 18).fill(stoneShadow);
    // Fire layers — deepest red to brightest yellow
    g.rect(8, 30, 14, 14).fill(fireDeep);
    g.rect(9, 31, 12, 12).fill(fireMid);
    g.rect(10, 32, 10, 10).fill(fireOrange);
    g.rect(12, 34, 6, 6).fill(fireYellow);
    g.rect(14, 36, 2, 2).fill(fireWhite);
    // Asymmetric flame tongues — break the symmetry of the nested rects
    // so the fire reads as living flame instead of stacked rectangles.
    g.rect(11, 32, 1, 4).fill(fireOrange);
    g.rect(13, 31, 1, 2).fill(fireYellow);
    g.rect(17, 33, 1, 5).fill(fireOrange);
    g.rect(19, 34, 1, 3).fill(fireMid);
    // Flickering "embers" at the top (more of them, varied colors)
    g.rect(11, 29, 1, 1).fill(fireYellow);
    g.rect(13, 28, 1, 1).fill(fireOrange);
    g.rect(15, 29, 1, 1).fill(fireWhite);
    g.rect(17, 29, 1, 1).fill(fireOrange);
    g.rect(19, 28, 1, 1).fill(fireYellow);
    // Warm glow leaking onto the wall just above the opening
    g.rect(7, 27, 16, 1).fill({ color: fireOrange, alpha: 0.45 });
    g.rect(8, 26, 14, 1).fill({ color: fireOrange, alpha: 0.22 });
    // Wall-shadow underneath the fire — pools light downward
    g.rect(4, 46, 22, 1).fill({ color: fireOrange, alpha: 0.3 });

    // ── Anvil to the right of the opening ──────────────────────────────
    // Base
    g.rect(W / 2 + 4, H - 8, 10, 6).fill(anvilDark);
    // Horn + top
    g.rect(W / 2 + 4, H - 12, 12, 4).fill(anvilDark);
    g.rect(W / 2 + 4, H - 12, 12, 1).fill(anvilLight);
    g.rect(W / 2 + 14, H - 11, 2, 2).fill(anvilDark);
    // Sparks above the anvil — three tiny yellow pixels
    g.rect(W / 2 + 8, H - 14, 1, 1).fill(fireYellow);
    g.rect(W / 2 + 10, H - 15, 1, 1).fill(fireWhite);
    g.rect(W / 2 + 11, H - 13, 1, 1).fill(fireYellow);

    // ── Tools on the wall (suggestion only) ──────────────────────────
    // Hammer
    g.rect(W - 12, 22, 1, 4).fill("#1a1a1a");        // handle
    g.rect(W - 13, 22, 3, 2).fill(anvilLight);        // head
    // Tongs
    g.rect(W - 6, 24, 1, 5).fill("#1a1a1a");
    g.rect(W - 8, 23, 2, 2).fill(stoneLight);

    return this.rt(g, W, H);
  }

  private buildMine(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });

    // Palette — warm brown rock, dark cave interior, weathered wooden beams
    const rockLight = "#a8a29e";
    const rock = "#78716c";
    const rockDark = "#57534e";
    const rockShadow = "#292524";
    const caveDeep = "#0c0a09";
    const caveMid = "#1c1917";
    const beamWood = "#78350f";
    const beamShade = "#451a03";
    const beamLight = "#92492a";
    const trackMetal = "#a8a29e";
    const trackDark = "#57534e";
    const cartWood = "#92492a";
    const cartDark = "#451a03";
    const lanternBracket = "#1c1917";
    const lanternBody = "#854d0e";
    const lanternLight = "#fef3c7";
    const ore = "#a16207";

    // ── Hillside backdrop with rocky texture ───────────────────────────
    for (let y = 0; y < 32; y++) {
      const shade = y < 8 ? rockLight : y < 20 ? rock : rockDark;
      g.rect(2 + Math.floor(y / 2), 16 + Math.floor(y / 2), W - 4 - y, 1).fill(shade);
    }
    // Loose stones / rocks scattered on the hillside
    for (const [rx, ry] of [[8, 22], [12, 32], [W - 14, 20], [W - 18, 38]]) {
      g.rect(rx, ry, 3, 2).fill(rockLight);
      g.rect(rx, ry + 2, 3, 1).fill(rockShadow);
    }

    // ── Cave mouth ────────────────────────────────────────────────────
    // Outer dark recess
    g.rect(W / 2 - 9, H - 24, 18, 24).fill(caveDeep);
    // Inner shadow gradient (deeper as you go in)
    g.rect(W / 2 - 7, H - 22, 14, 22).fill(caveMid);
    g.rect(W / 2 - 5, H - 20, 10, 20).fill(caveDeep);
    // Top arch shadow
    g.rect(W / 2 - 9, H - 24, 18, 3).fill(rockShadow);

    // ── Support beams (frame) ──────────────────────────────────────────
    // Left vertical
    g.rect(W / 2 - 11, H - 24, 3, 24).fill(beamWood);
    g.rect(W / 2 - 11, H - 24, 1, 24).fill(beamLight);
    g.rect(W / 2 - 9, H - 24, 1, 24).fill(beamShade);
    // Right vertical
    g.rect(W / 2 + 8, H - 24, 3, 24).fill(beamWood);
    g.rect(W / 2 + 8, H - 24, 1, 24).fill(beamLight);
    g.rect(W / 2 + 10, H - 24, 1, 24).fill(beamShade);
    // Top horizontal beam
    g.rect(W / 2 - 11, H - 26, 22, 4).fill(beamWood);
    g.rect(W / 2 - 11, H - 26, 22, 1).fill(beamLight);
    g.rect(W / 2 - 11, H - 23, 22, 1).fill(beamShade);
    // Beam plank seams
    for (let bx = W / 2 - 9; bx < W / 2 + 10; bx += 4) {
      g.rect(bx, H - 26, 1, 4).fill(beamShade);
    }
    // Wood-grain knots on the support beams — tiny dark specks at semi-
    // random spots. Reads as aged timber instead of painted lumber.
    g.rect(W / 2 - 10, H - 31, 1, 1).fill(beamShade);
    g.rect(W / 2 - 6, H - 28, 1, 1).fill(beamShade);
    g.rect(W / 2 + 5, H - 30, 1, 1).fill(beamShade);
    g.rect(W / 2 + 8, H - 26, 1, 1).fill(beamShade);
    // Iron strap bracket where vertical beams meet the cross beam
    g.rect(W / 2 - 11, H - 24, 1, 2).fill(trackMetal);
    g.rect(W / 2 + 10, H - 24, 1, 2).fill(trackMetal);

    // ── Hanging lantern ────────────────────────────────────────────────
    g.rect(W / 2 - 1, H - 22, 2, 4).fill(lanternBracket);   // hanging chain
    g.rect(W / 2 - 2, H - 18, 4, 4).fill(lanternBody);
    g.rect(W / 2 - 1, H - 17, 2, 2).fill(lanternLight);
    // Lantern frame highlight + glass-pane glints
    g.rect(W / 2 - 2, H - 18, 1, 4).fill({ color: "#fde047", alpha: 0.5 });
    g.rect(W / 2 - 1, H - 18, 1, 1).fill("#fff7d6");
    // Light bloom on the beams above the lantern
    g.rect(W / 2 - 4, H - 24, 8, 1).fill(beamLight);
    // Lower glow halo — soft warm pool on the cave floor area
    g.rect(W / 2 - 6, H - 13, 12, 1).fill({ color: lanternLight, alpha: 0.18 });
    g.rect(W / 2 - 4, H - 14, 8, 1).fill({ color: lanternLight, alpha: 0.28 });

    // ── Mining cart tracks leading out ─────────────────────────────────
    g.rect(W / 2 - 8, H - 4, 16, 1).fill(trackMetal);
    g.rect(W / 2 - 8, H - 2, 16, 1).fill(trackMetal);
    // Wooden ties beneath the rails
    for (let tx = W / 2 - 8; tx < W / 2 + 8; tx += 4) {
      g.rect(tx, H - 3, 2, 1).fill(beamShade);
    }
    // Slight shadow on the tracks
    g.rect(W / 2 - 8, H - 1, 16, 1).fill(rockShadow);

    // ── Small mining cart half-loaded with ore ─────────────────────────
    g.rect(W / 2 - 8, H - 9, 8, 5).fill(cartWood);
    g.rect(W / 2 - 8, H - 9, 8, 1).fill(beamLight);
    g.rect(W / 2 - 8, H - 5, 8, 1).fill(cartDark);
    // Wheels
    g.rect(W / 2 - 8, H - 4, 2, 2).fill(rockShadow);
    g.rect(W / 2 - 2, H - 4, 2, 2).fill(rockShadow);
    // Ore inside the cart (chunks of warm brown-yellow)
    g.rect(W / 2 - 7, H - 11, 2, 2).fill(ore);
    g.rect(W / 2 - 4, H - 12, 2, 3).fill(ore);
    g.rect(W / 2 - 2, H - 11, 1, 2).fill(ore);

    return this.rt(g, W, H);
  }

  private buildCharacterFrames(role: string): Texture[] {
    const ROLES: Record<string, { skin: string; body: string; accent: string; boot: string; hair: string }> = {
      villager:   { skin: "#fde68a", body: "#1d4ed8", accent: "#fbbf24", boot: "#7c2d12", hair: "#92400e" },
      courier:    { skin: "#fde68a", body: "#166534", accent: "#4ade80", boot: "#1a2e1a", hair: "#78350f" },
      scholar:    { skin: "#fde68a", body: "#4c1d95", accent: "#a78bfa", boot: "#2e1065", hair: "#c8a84b" },
      blacksmith: { skin: "#fcd34d", body: "#7c2d12", accent: "#c2410c", boot: "#1c1917", hair: "#1c1917" },
      miner:      { skin: "#fde68a", body: "#44403c", accent: "#a16207", boot: "#292524", hair: "#292524" },
      guard:      { skin: "#fde68a", body: "#1e3a5f", accent: "#c8a84b", boot: "#111827", hair: "#374151" },
    };
    const c = ROLES[role] ?? ROLES.villager;
    const frames: Texture[] = [];

    for (let f = 0; f < 4; f++) {
      const T = 32;
      const g = new Graphics();
      g.rect(0, 0, T, T).fill({ alpha: 0 });
      const bob = f % 2 === 0 ? 0 : 1;

      // Shadow
      g.ellipse(T / 2, T - 3, 6, 2).fill({ color: "#000000", alpha: 0.32 });

      // ── Role-specific lower body ──────────────────────────────────────────
      if (role === "scholar") {
        // Long robe — covers legs entirely, slight sway
        g.rect(9, 18, 14, 10 + bob).fill(c.body);
        g.rect(9, 25, 14, 3).fill(darkenHex(c.body, 0.15)); // robe hem
      } else {
        // Legs
        g.rect(11, 22 + bob, 4, 6).fill(c.boot);
        g.rect(17, 22 - bob, 4, 6).fill(c.boot);
        // Boot sole shadow
        g.rect(11, 27 + bob, 4, 1).fill(darkenHex(c.boot, 0.3));
        g.rect(17, 27 - bob, 4, 1).fill(darkenHex(c.boot, 0.3));
      }

      // Body
      g.rect(10, 14, 12, 10).fill(c.body);
      // Collar / accent stripe
      g.rect(10, 14, 12, 2).fill(c.accent);
      // Body shading (right-side shadow)
      g.rect(20, 15, 2, 8).fill(darkenHex(c.body, 0.18));

      // ── Role-specific accessories ──────────────────────────────────────────
      if (role === "guard") {
        // Chest plate gleam
        g.rect(13, 16, 6, 6).fill(lightenHex(c.body, 0.25));
        g.rect(15, 16, 2, 5).fill(c.accent);
        // Shield on left arm
        g.rect(6, 16, 4, 5).fill(c.accent);
        g.rect(7, 17, 2, 3).fill(lightenHex(c.accent, 0.25));
      } else if (role === "blacksmith") {
        // Leather apron overlay
        g.rect(11, 16, 10, 8).fill(darkenHex(c.boot, 0.1));
        g.rect(11, 16, 10, 1).fill(lightenHex(c.boot, 0.15));
        // Hammer suggestion in right hand
        if (f % 2 === 0) {
          g.rect(23, 14 + bob, 3, 2).fill("#78716c"); // hammer head
          g.rect(24, 16 + bob, 1, 4).fill("#7c2d12"); // handle
        }
      } else if (role === "scholar") {
        // Book in left hand
        g.rect(6, 16, 4, 5).fill("#c8a84b");
        g.rect(7, 17, 2, 3).fill("#fde68a");
        g.rect(7, 17, 2, 1).fill("#c8a84b");
      } else if (role === "miner") {
        // Belt + tool loops
        g.rect(10, 20, 12, 2).fill(c.accent);
        // Pickaxe over shoulder
        if (f % 2 === 0) {
          g.rect(7, 10 + bob, 1, 6).fill("#7c2d12"); // handle
          g.rect(5, 10 + bob, 4, 2).fill("#78716c"); // pick head
        }
      } else if (role === "courier") {
        // Saddlebag on side
        g.rect(5, 17, 4, 4).fill(darkenHex(c.body, 0.2));
        g.rect(6, 18, 2, 2).fill(lightenHex(c.body, 0.1));
        // Cloak hem behind body
        g.rect(8, 18, 2, 8 + bob).fill(darkenHex(c.body, 0.15));
      }

      // Arms
      g.rect(7, 16, 3, 6).fill(c.body);
      g.rect(22, 16, 3, 6).fill(c.body);

      // Head
      g.rect(11, 6, 10, 8).fill(c.skin);
      // Hair / headgear
      if (role === "guard") {
        // Metal helmet
        g.rect(10, 5, 12, 4).fill("#6b7280");
        g.rect(10, 5, 12, 1).fill(lightenHex("#6b7280", 0.3));
        g.rect(10, 8, 2, 3).fill("#6b7280"); // cheek guard
        g.rect(20, 8, 2, 3).fill("#6b7280");
      } else if (role === "miner") {
        // Hard hat
        g.rect(9, 5, 14, 3).fill("#fbbf24");
        g.rect(9, 5, 14, 1).fill(lightenHex("#fbbf24", 0.3));
        // Lamp on hat
        g.rect(14, 4, 4, 2).fill("#fed7aa");
        g.rect(15, 3, 2, 2).fill({ color: "#fbbf24", alpha: 0.7 });
      } else {
        // Normal hair (color per role)
        g.rect(11, 6, 10, 2).fill(c.hair);
      }

      // Eyes + catchlights
      g.rect(13, 10, 2, 2).fill("#0c0a09");
      g.rect(17, 10, 2, 2).fill("#0c0a09");
      g.rect(13, 10, 1, 1).fill({ color: "#ffffff", alpha: 0.8 });
      g.rect(17, 10, 1, 1).fill({ color: "#ffffff", alpha: 0.8 });

      frames.push(this.rt(g, T, T));
    }
    return frames;
  }

  /**
   * Build 4 frames from a CharacterSpec, replace the named character set, and
   * dispose the old textures. Used by the monarch creator to live-update the
   * in-game sprite when the player tweaks their design.
   */
  /** Build 4 frames for a pet spec under the given key. */
  setSpecPet(key: string, spec: PetSpec): void {
    const T = SpriteFactory.TILE_SIZE;
    const frames: Texture[] = [];
    for (let f = 0; f < 4; f++) {
      const g = new Graphics();
      g.rect(0, 0, T, T).fill({ alpha: 0 });
      drawPet(new PixiSurface(g), spec, f);
      frames.push(this.rt(g, T, T));
    }
    const prev = this.characters.get(key);
    this.characters.set(key, frames);
    if (prev) {
      setTimeout(() => {
        for (const tex of prev) {
          try {
            tex.destroy(true);
          } catch {
            /* ignore */
          }
        }
      }, 100);
    }
  }

  setSpecCharacter(role: string, spec: CharacterSpec): void {
    const T = SpriteFactory.TILE_SIZE;
    const frames: Texture[] = [];
    for (let f = 0; f < 4; f++) {
      const g = new Graphics();
      g.rect(0, 0, T, T).fill({ alpha: 0 }); // ensure full bounds
      drawCharacter(new PixiSurface(g), spec, f, "s");
      frames.push(this.rt(g, T, T));
    }
    const prev = this.characters.get(role);
    this.characters.set(role, frames);
    // dispose previous textures next frame so any in-flight renders complete
    if (prev) {
      setTimeout(() => {
        for (const tex of prev) {
          try {
            tex.destroy(true);
          } catch {
            /* ignore */
          }
        }
      }, 100);
    }
  }

  private buildWatchtower(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });

    // Palette — slightly warmer stone than the castle so towers read as
    // separate sub-buildings rather than miniature castles.
    const stoneLight = "#a8a29e";
    const stone = "#78716c";
    const stoneShade = "#57534e";
    const stoneShadow = "#292524";
    const woodLight = "#92492a";
    const wood = "#78350f";
    const woodDark = "#451a03";
    const window = "#1c1917";
    const windowGlow = "#fde68a";
    const flag = "#dc2626";
    const flagShade = "#7f1d1d";

    // ── Wider stone base ──────────────────────────────────────────────
    g.rect(W / 2 - 10, H - 14, 20, 14).fill(stone);
    g.rect(W / 2 - 10, H - 14, 20, 2).fill(stoneShade);
    g.rect(W / 2 - 10, H - 14, 2, 14).fill(stoneLight);
    g.rect(W / 2 + 8, H - 14, 2, 14).fill(stoneShade);
    g.rect(W / 2 - 10, H - 2, 20, 2).fill(stoneShadow);
    // Base door
    g.rect(W / 2 - 3, H - 10, 6, 10).fill(wood);
    g.rect(W / 2 - 3, H - 10, 6, 1).fill(woodDark);
    g.rect(W / 2 - 3, H - 10, 1, 10).fill(woodDark);
    g.rect(W / 2 + 2, H - 10, 1, 10).fill(woodDark);

    // ── Tall central shaft ────────────────────────────────────────────
    g.rect(W / 2 - 7, 10, 14, H - 24).fill(stone);
    g.rect(W / 2 - 7, 10, 14, 2).fill(stoneShade);
    g.rect(W / 2 - 7, 10, 2, H - 24).fill(stoneLight);
    g.rect(W / 2 + 5, 10, 2, H - 24).fill(stoneShade);
    // Stone block courses on the shaft
    for (let y = 18; y < H - 14; y += 6) {
      g.rect(W / 2 - 5, y, 10, 1).fill(stoneShade);
    }
    // Vertical seams (staggered)
    for (let y = 12; y < H - 14; y += 6) {
      const offset = ((y - 12) / 6) % 2 === 0 ? 0 : 4;
      g.rect(W / 2 - 4 + offset, y, 1, 5).fill(stoneShade);
    }
    // Arrow-slit windows up the shaft (two of them, both lit at dusk)
    g.rect(W / 2 - 1, 20, 2, 5).fill(window);
    g.rect(W / 2, 21, 1, 2).fill(windowGlow);
    g.rect(W / 2 - 1, 32, 2, 4).fill(window);
    g.rect(W / 2, 33, 1, 2).fill(windowGlow);
    // Faint wall halo around each slit
    g.rect(W / 2 - 3, 20, 5, 1).fill({ color: windowGlow, alpha: 0.18 });
    g.rect(W / 2 - 3, 25, 5, 1).fill({ color: windowGlow, alpha: 0.12 });
    g.rect(W / 2 - 3, 32, 5, 1).fill({ color: windowGlow, alpha: 0.18 });

    // ── Wooden battlement balcony at the top ──────────────────────────
    // Floor that sticks out
    g.rect(W / 2 - 9, 8, 18, 2).fill(woodDark);
    g.rect(W / 2 - 9, 8, 18, 1).fill(woodLight);
    // Railing/posts
    for (let rx = W / 2 - 8; rx <= W / 2 + 8; rx += 3) {
      g.rect(rx, 6, 1, 2).fill(woodDark);
    }
    g.rect(W / 2 - 8, 5, 17, 1).fill(wood);

    // ── Guard silhouette at the lookout (tiny but visible) ────────────
    // Head + body squished into a 3×4 silhouette
    g.rect(W / 2 - 1, 1, 2, 2).fill(stoneShadow);    // head
    g.rect(W / 2 - 2, 3, 4, 2).fill(stoneShadow);    // shoulders/cape

    // ── Conical wood-shingle roof ─────────────────────────────────────
    // Two-tone for shading
    g.rect(W / 2 - 10, 4, 20, 1).fill(woodDark);     // eave shadow
    g.rect(W / 2 - 8, 0, 16, 4).fill(wood);
    g.rect(W / 2 - 6, -2, 12, 2).fill(woodLight);
    g.rect(W / 2 - 3, -4, 6, 2).fill(woodLight);
    g.rect(W / 2 - 1, -6, 2, 2).fill(woodLight);

    // ── Tall flag pole + cloth ────────────────────────────────────────
    g.rect(W / 2 - 1, -10, 1, 6).fill("#1f2937");    // pole
    g.rect(W / 2, -10, 1, 1).fill("#fbbf24");        // brass finial
    // Flag cloth with shading + dagged edge
    g.rect(W / 2, -10, 6, 4).fill(flag);
    g.rect(W / 2, -10, 6, 1).fill("#ef4444");
    g.rect(W / 2, -7, 6, 1).fill(flagShade);
    g.rect(W / 2 + 6, -8, 1, 1).fill(flagShade);

    return this.rt(g, W, H);
  }

  private buildMill(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const wall = "#d6c0a3";
    const wallShade = "#8b6f47";
    const roof = "#7c2d12";
    // body
    g.rect(8, 24, W - 16, H - 24).fill(wall);
    g.rect(8, 24, W - 16, 2).fill(wallShade);
    // peaked roof
    for (let y = 0; y < 14; y++) {
      g.rect(8 + y, 24 - y - 1, W - 16 - y * 2, 1).fill(roof);
    }
    // door
    g.rect(W / 2 - 3, H - 12, 6, 12).fill("#3f2616");
    // windmill blades (X)
    g.rect(W / 2 - 1, 4, 2, 12).fill("#451a03");
    g.rect(W / 2 - 6, 9, 12, 2).fill("#451a03");
    g.rect(W / 2 - 5, 5, 2, 2).fill("#fef3c7"); // blade tip
    g.rect(W / 2 + 3, 13, 2, 2).fill("#fef3c7");
    g.rect(W / 2 - 5, 13, 2, 2).fill("#fef3c7");
    g.rect(W / 2 + 3, 5, 2, 2).fill("#fef3c7");
    return this.rt(g, W, H);
  }

  private buildShrine(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stone = "#a8a29e";
    const shade = "#57534e";
    const accent = "#fde047";
    // base platform
    g.rect(8, H - 6, W - 16, 6).fill(stone);
    g.rect(8, H - 6, W - 16, 2).fill(shade);
    // 4 pillars
    g.rect(11, H - 22, 3, 16).fill(stone);
    g.rect(W - 14, H - 22, 3, 16).fill(stone);
    g.rect(20, H - 22, 3, 16).fill(stone);
    g.rect(W - 23, H - 22, 3, 16).fill(stone);
    // roof slab
    g.rect(6, H - 24, W - 12, 4).fill(stone);
    g.rect(6, H - 24, W - 12, 1).fill(shade);
    // small pediment with gem
    g.rect(W / 2 - 4, H - 28, 8, 4).fill(stone);
    g.rect(W / 2 - 1, H - 27, 2, 2).fill(accent);
    // floor altar with flame
    g.rect(W / 2 - 2, H - 10, 4, 4).fill(shade);
    g.rect(W / 2 - 1, H - 12, 2, 2).fill("#f97316");
    return this.rt(g, W, H);
  }

  /**
   * Astronomer's Tower. Tall slim build (2×3 footprint, drawn at native
   * pixel size) — stone shaft, narrow windows, copper dome with a small
   * opening notch on top. Reads as "tower with a telescope dome" at
   * tile-scale.
   */
  private buildAstronomersTower(): Texture {
    const W = 32 * 2, H = 32 * 3;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stoneDark = "#52525b";
    const stone = "#71717a";
    const stoneLight = "#a1a1aa";
    const copper = "#c2410c";
    const copperShine = "#fb923c";
    const star = "#fde68a";
    // Ground plinth (base + shadow)
    g.rect(14, H - 8, W - 28, 8).fill(stoneDark);
    g.rect(16, H - 8, W - 32, 2).fill(stone);
    // Main shaft — 18px wide, runs from H-8 up to dome base
    const shaftX = (W - 18) / 2;
    const shaftTop = 18;
    g.rect(shaftX, shaftTop, 18, H - 8 - shaftTop).fill(stone);
    // Left-edge lighter highlight column (implicit light source upper-left)
    g.rect(shaftX, shaftTop, 2, H - 8 - shaftTop).fill(stoneLight);
    // Right-edge shadow column
    g.rect(shaftX + 16, shaftTop, 2, H - 8 - shaftTop).fill(stoneDark);
    // Stone-course horizontal seams every 8px
    for (let y = shaftTop + 8; y < H - 8; y += 8) {
      g.rect(shaftX, y, 18, 1).fill(stoneDark);
    }
    // Three narrow arched windows up the shaft
    const winY = [shaftTop + 14, shaftTop + 30, shaftTop + 46];
    for (const wy of winY) {
      if (wy + 5 > H - 10) break;
      g.rect(shaftX + 8, wy, 2, 5).fill("#1c1917");
      // window inner light glow
      g.rect(shaftX + 8, wy + 1, 2, 1).fill({ color: "#fbbf24", alpha: 0.6 });
    }
    // Battlement ring at top of shaft — crenellations
    g.rect(shaftX - 2, shaftTop - 2, 22, 4).fill(stone);
    for (let x = shaftX - 2; x <= shaftX + 18; x += 4) {
      g.rect(x, shaftTop - 4, 2, 2).fill(stone);
    }
    // Dome — copper, slightly wider than shaft
    g.rect(shaftX - 2, shaftTop - 12, 22, 8).fill(copper);
    // Dome highlight (top-left rim)
    g.rect(shaftX - 1, shaftTop - 11, 6, 1).fill(copperShine);
    g.rect(shaftX - 2, shaftTop - 9, 2, 4).fill(copperShine);
    // Opening notch — the dome rolls back; a thin black slit in the top
    g.rect(shaftX + 7, shaftTop - 12, 6, 2).fill("#000000");
    // Star pip — implies what they're watching for
    g.rect(shaftX + 9, shaftTop - 16, 2, 2).fill(star);
    g.rect(shaftX + 8, shaftTop - 15, 4, 1).fill(star);
    g.rect(shaftX + 10, shaftTop - 14, 1, 1).fill(star);
    return this.rt(g, W, H);
  }

  // ── Landmark sprites — placed at runtime by the NarrativeDirector ────

  private buildStandingStones(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stone = "#9ca3af";
    const stoneShade = "#4b5563";
    const grass = "#3a4d2d";
    // Grass patch beneath the stones
    g.ellipse(W / 2, H - 6, W / 2 - 4, 6).fill(grass);
    // Five upright stones forming a small ring
    const slots: Array<[number, number, number, number]> = [
      [10, H - 22, 5, 16],
      [22, H - 26, 5, 20],
      [W / 2 - 2, H - 28, 6, 22],
      [W - 27, H - 24, 5, 18],
      [W - 14, H - 22, 5, 16],
    ];
    for (const [x, y, w, h] of slots) {
      g.rect(x, y, w, h).fill(stone);
      g.rect(x, y, w, 1).fill(stoneShade);
      g.rect(x, y, 1, h).fill("#c0c8d0");
      g.rect(x + w - 1, y, 1, h).fill(stoneShade);
    }
    return this.rt(g, W, H);
  }

  private buildRuin(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stone = "#78716c";
    const shade = "#44403c";
    const moss = "#3a4d2d";
    // Crumbling base wall — only some sections survive
    g.rect(6, H - 16, 12, 12).fill(stone);
    g.rect(6, H - 16, 12, 1).fill(shade);
    g.rect(22, H - 12, 8, 8).fill(stone);
    g.rect(W - 18, H - 18, 10, 14).fill(stone);
    g.rect(W - 18, H - 18, 10, 1).fill(shade);
    // Partial doorway arch
    g.rect(W / 2 - 4, H - 22, 2, 12).fill(stone);
    g.rect(W / 2 + 2, H - 22, 2, 12).fill(stone);
    g.rect(W / 2 - 4, H - 22, 8, 2).fill(stone);
    // Moss/grass spreading over the rubble
    g.rect(7, H - 5, 4, 2).fill(moss);
    g.rect(W - 16, H - 5, 4, 2).fill(moss);
    g.rect(W / 2 - 3, H - 5, 4, 2).fill(moss);
    return this.rt(g, W, H);
  }

  private buildCamp(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const tent = "#854d0e";
    const tentLight = "#a16207";
    const tentShade = "#451a03";
    const fire = "#f97316";
    const fireBright = "#fde047";
    const log = "#3f2616";
    // Two small triangle tents
    for (let y = 0; y < 12; y++) {
      g.rect(8 + y, H - 18 + y, 14 - y * 2, 1).fill(y < 4 ? tentLight : tent);
    }
    g.rect(7, H - 7, 1, 1).fill(tentShade);
    g.rect(21, H - 7, 1, 1).fill(tentShade);
    for (let y = 0; y < 10; y++) {
      g.rect(W - 22 + y, H - 16 + y, 12 - y * 2, 1).fill(y < 3 ? tentLight : tent);
    }
    // Campfire between tents
    g.rect(W / 2 - 4, H - 8, 8, 2).fill(log);
    g.rect(W / 2 - 2, H - 10, 4, 3).fill(fire);
    g.rect(W / 2 - 1, H - 11, 2, 2).fill(fireBright);
    return this.rt(g, W, H);
  }

  private buildWellspring(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stone = "#9ca3af";
    const stoneShade = "#4b5563";
    const water = "#3b82f6";
    const waterLight = "#93c5fd";
    const wood = "#854d0e";
    // Round stone well base
    g.ellipse(W / 2, H - 8, 12, 6).fill(stone);
    g.ellipse(W / 2, H - 8, 12, 6).stroke({ width: 2, color: stoneShade });
    // Water at top of well
    g.ellipse(W / 2, H - 10, 9, 4).fill(water);
    g.rect(W / 2 - 4, H - 11, 8, 1).fill(waterLight);
    // Wooden frame + bucket rope
    g.rect(W / 2 - 12, H - 26, 2, 18).fill(wood);
    g.rect(W / 2 + 10, H - 26, 2, 18).fill(wood);
    g.rect(W / 2 - 12, H - 28, 24, 2).fill(wood);
    g.rect(W / 2 - 1, H - 26, 2, 8).fill("#1c1917"); // rope
    g.rect(W / 2 - 2, H - 18, 4, 3).fill(wood); // bucket
    return this.rt(g, W, H);
  }

  private buildObelisk(): Texture {
    const W = 32 * 2, H = 32 * 2;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    const stone = "#52525b";
    const stoneLight = "#71717a";
    const stoneShade = "#27272a";
    const accent = "#fde047";
    // Stepped base
    g.rect(W / 2 - 10, H - 6, 20, 6).fill(stone);
    g.rect(W / 2 - 10, H - 6, 20, 1).fill(stoneLight);
    g.rect(W / 2 - 7, H - 10, 14, 4).fill(stone);
    g.rect(W / 2 - 7, H - 10, 14, 1).fill(stoneLight);
    // Tall obelisk shaft, tapering
    for (let y = 0; y < 24; y++) {
      const w = Math.max(4, 10 - Math.floor(y / 3));
      g.rect(W / 2 - w / 2, H - 10 - y, w, 1).fill(stone);
      g.rect(W / 2 - w / 2, H - 10 - y, 1, 1).fill(stoneLight);
      g.rect(W / 2 + w / 2 - 1, H - 10 - y, 1, 1).fill(stoneShade);
    }
    // Glyph mark near the middle
    g.rect(W / 2 - 1, H - 22, 2, 4).fill(accent);
    // Pyramidion at top
    g.rect(W / 2 - 2, H - 36, 4, 2).fill(stoneLight);
    g.rect(W / 2 - 1, H - 38, 2, 2).fill(accent);
    return this.rt(g, W, H);
  }

  private buildPetFrames(kind: "dog" | "cat"): Texture[] {
    const palette = kind === "dog"
      ? { body: "#a16207", belly: "#fde68a", nose: "#1c1917", ear: "#78350f", eye: "#0c0a09" }
      : { body: "#52525b", belly: "#d4d4d8", nose: "#1c1917", ear: "#27272a", eye: "#fde047" };
    const frames: Texture[] = [];
    for (let f = 0; f < 4; f++) {
      const T = 32;
      const g = new Graphics();
      g.rect(0, 0, T, T).fill({ alpha: 0 });
      const bob = f % 2 === 0 ? 0 : 1;
      // shadow
      g.ellipse(T / 2, T - 4, 7, 2).fill({ color: "#000000", alpha: 0.4 });
      // body (low, stocky)
      g.rect(8, 16 + bob, 16, 8).fill(palette.body);
      // belly
      g.rect(10, 22 + bob, 12, 2).fill(palette.belly);
      // head — front (left side of body)
      g.rect(5, 14 + bob, 8, 8).fill(palette.body);
      // ears
      if (kind === "cat") {
        g.rect(5, 12 + bob, 2, 3).fill(palette.ear);
        g.rect(11, 12 + bob, 2, 3).fill(palette.ear);
      } else {
        g.rect(4, 14 + bob, 2, 4).fill(palette.ear); // floppy ear
      }
      // eye
      g.rect(9, 17 + bob, 2, 2).fill(palette.eye);
      // nose
      g.rect(5, 18 + bob, 2, 2).fill(palette.nose);
      // legs
      g.rect(10, 24 + bob, 2, 4).fill(palette.body);
      g.rect(20, 24 + bob, 2, 4).fill(palette.body);
      // tail (kind-specific)
      if (kind === "cat") {
        g.rect(24, 14 + bob, 2, 8).fill(palette.body);
      } else {
        g.rect(24, 18 + bob, 4, 2).fill(palette.body);
      }
      frames.push(this.rt(g, T, T));
    }
    return frames;
  }

  private buildAirship(): Texture {
    const W = 64, H = 32;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    // balloon
    g.ellipse(W / 2, 12, W / 2 - 2, 10).fill("#dc2626");
    g.ellipse(W / 2, 12, W / 2 - 6, 6).fill("#fca5a5");
    // gondola
    g.rect(16, 18, W - 32, 8).fill("#78350f");
    g.rect(16, 18, W - 32, 2).fill("#451a03");
    // ropes
    g.rect(20, 12, 1, 8).fill("#1c1917");
    g.rect(W - 21, 12, 1, 8).fill("#1c1917");
    // propeller
    g.rect(W - 12, 22, 4, 1).fill("#1c1917");
    g.rect(W - 10, 20, 1, 5).fill("#1c1917");
    return this.rt(g, W, H);
  }

  private buildMonster(): Texture {
    const W = 32, H = 32;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill({ alpha: 0 });
    // shadow body
    g.ellipse(W / 2, 24, 12, 5).fill({ color: "#000000", alpha: 0.4 });
    g.rect(8, 14, 16, 12).fill("#581c87");
    g.rect(8, 14, 16, 2).fill("#3b0764");
    // eyes
    g.rect(11, 18, 3, 3).fill("#fde047");
    g.rect(18, 18, 3, 3).fill("#fde047");
    // teeth
    g.rect(12, 22, 2, 2).fill("#ffffff");
    g.rect(15, 22, 2, 2).fill("#ffffff");
    g.rect(18, 22, 2, 2).fill("#ffffff");
    // claws
    g.rect(6, 24, 2, 4).fill("#1c1917");
    g.rect(24, 24, 2, 4).fill("#1c1917");
    return this.rt(g, W, H);
  }

  private buildRainDrop(): Texture {
    const g = new Graphics();
    // Raindrop with a slight gradient — bright head, dimmer trail. Reads
    // as motion-blurred rain instead of a uniform stripe.
    g.rect(0, 0, 1, 1).fill({ color: "#dbeafe", alpha: 0.95 });
    g.rect(0, 1, 1, 1).fill({ color: "#93c5fd", alpha: 0.85 });
    g.rect(0, 2, 1, 1).fill({ color: "#60a5fa", alpha: 0.7 });
    g.rect(0, 3, 1, 1).fill({ color: "#3b82f6", alpha: 0.5 });
    return this.rt(g, 1, 4);
  }
  private buildSnowflake(): Texture {
    const g = new Graphics();
    // Tiny crystal — center pixel + four arms, with a faint glow halo.
    // At sprite-scale this reads as "snowflake" not "white block".
    g.rect(1, 1, 1, 1).fill({ color: "#ffffff", alpha: 0.25 });
    g.rect(0, 1, 3, 1).fill({ color: "#ffffff", alpha: 0.9 });
    g.rect(1, 0, 1, 3).fill({ color: "#ffffff", alpha: 0.9 });
    return this.rt(g, 3, 3);
  }
  private buildSpark(): Texture {
    const g = new Graphics();
    // Cross-shaped spark with a hot core — reads as ember, not as a block
    g.rect(1, 0, 1, 3).fill({ color: "#fde047", alpha: 0.95 });
    g.rect(0, 1, 3, 1).fill({ color: "#fde047", alpha: 0.95 });
    g.rect(1, 1, 1, 1).fill("#fff7ed");
    return this.rt(g, 3, 3);
  }
  private buildSmoke(): Texture {
    const g = new Graphics();
    // 3-stop smoke puff — outer warm haze, mid grey, dark core. Reads as
    // a volumetric puff instead of a flat circle as it scales up.
    g.circle(4, 4, 4).fill({ color: "#d6d3d1", alpha: 0.18 });
    g.circle(4, 4, 3).fill({ color: "#a8a29e", alpha: 0.55 });
    g.circle(4, 4, 2).fill({ color: "#78716c", alpha: 0.7 });
    return this.rt(g, 8, 8);
  }
  private buildFirework(): Texture {
    const g = new Graphics();
    g.circle(8, 8, 6).fill({ color: "#fbbf24", alpha: 0.6 });
    g.circle(8, 8, 3).fill("#ffffff");
    return this.rt(g, 16, 16);
  }
  private buildCloud(): Texture {
    const W = 64, H = 24;
    const g = new Graphics();
    // Layered cloud — back layer is a soft blue-grey shadow, mid layer is
    // white, front edge is a thin bright highlight. Gives a 3-tone roundness
    // a single flat ellipse can't carry.
    g.ellipse(22, 16, 20, 9).fill({ color: "#94a3b8", alpha: 0.32 });
    g.ellipse(42, 14, 22, 10).fill({ color: "#94a3b8", alpha: 0.32 });
    g.ellipse(20, 14, 18, 8).fill({ color: "#ffffff", alpha: 0.6 });
    g.ellipse(40, 12, 22, 10).fill({ color: "#ffffff", alpha: 0.6 });
    g.ellipse(50, 16, 14, 6).fill({ color: "#ffffff", alpha: 0.6 });
    // bright top edge — implicit sun
    g.ellipse(40, 10, 18, 3).fill({ color: "#fef3c7", alpha: 0.32 });
    return this.rt(g, W, H);
  }
}

/**
 * Tiny color helpers used by the tile noise pass. We avoid pulling these
 * from CharacterRenderer to keep SpriteFactory free of cross-module imports.
 */
function darkenHex(hex: string, amount: number): string {
  const { r, g, b } = parseHexLocal(hex);
  return rgbHexLocal(
    Math.max(0, Math.floor(r * (1 - amount))),
    Math.max(0, Math.floor(g * (1 - amount))),
    Math.max(0, Math.floor(b * (1 - amount))),
  );
}
function lightenHex(hex: string, amount: number): string {
  const { r, g, b } = parseHexLocal(hex);
  return rgbHexLocal(
    Math.min(255, Math.floor(r + (255 - r) * amount)),
    Math.min(255, Math.floor(g + (255 - g) * amount)),
    Math.min(255, Math.floor(b + (255 - b) * amount)),
  );
}
function parseHexLocal(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  if (h.length === 6) return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  return { r: 0, g: 0, b: 0 };
}
function rgbHexLocal(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}
