# Audio source files

Today, **all KingdomOS audio is procedural** — generated at runtime by
`src/engine/Audio.ts` using Web Audio API oscillators. No `.wav` or
`.mp3` files are loaded. The procedural pad shifts by season + time of
day, event SFX trigger on courier arrivals / forge work / festivals,
and (recently added) menu blips fire on button hover/click.

This directory exists for when you decide to author real chiptune
tracks or bespoke SFX to replace specific procedural sounds.

---

## Working format conventions

```
assets/audio/
├── music/
│   ├── dawn.bps          ← BeepBox project file
│   ├── day.bps
│   ├── dusk.bps
│   └── night.bps
└── sfx/
    ├── menu_blip.jsfxr   ← jsfxr parameter file
    ├── menu_confirm.jsfxr
    ├── courier_arrive.jsfxr
    └── ...

public/audio/             ← exported playable formats (loaded at runtime)
├── music/
│   └── *.wav (or .ogg)
└── sfx/
    └── *.wav
```

Note: `public/audio/` doesn't exist yet. Create it when you ship your
first authored track. The engine doesn't currently load from
`public/audio/` either — you'd extend `src/engine/Audio.ts` to look
there first and fall back to procedural.

---

## Recommended tools

### Music — BeepBox  (free, web-based, https://www.beepbox.co)

Six-channel chiptune sequencer in the browser. Save songs as `.bps`
JSON files (small, git-friendly). Export as `.wav` for runtime.

**Workflow:**
1. Compose at https://www.beepbox.co
2. **Song → Export** → choose `.wav` or `.mp3`
3. **Song → Save as JSON file** (this is the source — commit it)
4. Copy `.wav` to `public/audio/music/`
5. (Future) update `Audio.ts` to load from path instead of synthesise

### SFX — jsfxr  (free, web-based, https://sfxr.me)

Procedural SFX generator. Generates "pickup", "laser", "explosion",
"hit", "powerup", "blip" style sounds with sliders. Save the parameter
JSON as the source of truth — re-running it produces the same `.wav`.

**Workflow:**
1. Tweak sliders at https://sfxr.me
2. Click "Export Sound" → `.wav`
3. Save parameter JSON as `.jsfxr` (commit it)
4. Copy `.wav` to `public/audio/sfx/`

### Music — Bosca Ceoil  (free, desktop, https://boscaceoil.net)

Heavier than BeepBox but lets you compose 8-bit songs with multiple
patterns and a more familiar DAW-style timeline. Use this if BeepBox
feels limiting.

---

## What's most worth authoring

If you spend a weekend on audio, prioritise:

1. **Four-track day cycle** (dawn, day, dusk, night) — replaces the
   procedural pad with proper chiptune. Biggest "this feels like a
   real game" upgrade. ~3 hours per track in BeepBox if you're not
   precious.
2. **Decision-prompt sting** — a brief 1-2 second cue when a major
   decision appears. Currently there's no audio signal at all; the
   player can miss it entirely.
3. **Founding fanfare** — plays once when a new kingdom is founded.
   Sets the tone for the whole session.
4. **Death / succession dirge** — when a monarch dies. The procedural
   "monster" sound is wrong for this moment.

Don't bother replacing the menu blip — it's already procedural,
already tuned, and a one-shot 40ms sample isn't going to beat the
oscillator on disk-size grounds.

---

## Integration sketch

When you do wire authored audio in, the lightest-touch pattern:

```ts
// src/engine/Audio.ts
async function loadTrack(name: string): Promise<AudioBuffer | null> {
  try {
    const url = `./audio/music/${name}.wav`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await ctx.decodeAudioData(await resp.arrayBuffer());
  } catch {
    return null; // fall through to procedural
  }
}
```

Keep the procedural pad as a fallback for missing files — same
pattern as the sprite manifest.
