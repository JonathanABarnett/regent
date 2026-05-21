# KingdomOS — itch.io Page Copy

---

## Short description (160 chars)
An ambient 16-bit fantasy kingdom that lives on your desktop — it ages in real time, reacts to your git commits, and tells its own stories.

---

## Full description

**KingdomOS** is an ambient desktop app that generates a living SNES-style fantasy kingdom and leaves it running in the corner of your screen while you work.

The kingdom moves on its own. NPCs are born, marry, grow old, and die. Blacksmiths forge named weapons. Scholars transcribe tomes. Couples walk to market together. Children grow up and choose their own trades. The forge runs late when work is busy. The seasons turn. Stars cross the sky. A usurper may challenge your throne in year two.

**You are the monarch.** You're not managing the economy or building a base — you're watching a world unfold and occasionally deciding things that matter: exile the usurper or negotiate? Seal the ancient cavern or excavate it? Spend grain stores during the drought?

The kingdom remembers everything in its **Chronicle** — an auto-generated prose history of every reign, every dynasty, and every notable soul who lived there.

---

### What makes it different

**It reacts to what you're actually doing.** Point it at your git repositories. When you commit code, a scholar inscribes a tome. When you push to main, a courier rides from the scriptorium to the castle. When you spike the CPU running a build, the mines glow red — overtime shift. You can ignore all of this and the kingdom runs perfectly on its own. But if you wire it up, your work becomes part of the world's history.

**It ages while you're away.** The calendar runs on real wall-clock time. Come back after a week: the kingdom is a week older, with a week's worth of events, births, deaths, and weather in the journal. The steward meets you at the door with a briefing.

**Every kingdom is unique.** Procedurally generated 96×64 tile map, seeded NPCs with persistent names and relationships, and a sim that runs from different starting conditions each time. The story of your kingdom is genuinely yours — no two look the same.

---

### The world

- **Living NPCs** — villagers, scholars, blacksmiths, miners, guards, couriers, and a monarch. They have names, ages, partners, children, traits (curious, stoic, joyful, ambitious), and daily schedules. When they die, their passing is mourned in the journal by those they left behind.
- **Political intrigue** — usurpers challenge for the throne; peasants rise up when the treasury runs dry and population grows restless; diplomatic envoys arrive with demands; court conspiracies unfold over several days.
- **Dynasty tracking** — how many consecutive natural successions has your line maintained? A dynasty broken by an uprising resets the streak.
- **25+ story arcs** — wandering prophets, underground caverns, legendary heroes born among your citizens, foreign tribute negotiations, plague scares, legendary beasts, elder councils. New arcs unlock as the kingdom ages.
- **Seasonal world** — spring flowers, summer fireflies, autumn leaves, winter snow. Each season changes the tile appearance, ambient particles, and the kingdom's narrative texture.

---

### Keyboard & UI

- **Click any NPC** to open their life story: age, trait, family tree, journal entries mentioning them
- **Click any NPC name in the journal** to open their profile
- **J** to open the Kingdom Journal (searchable chronicle with NPC name linkification)
- **S** to open Settings
- **F12** to capture a clean screenshot (saves to your Downloads folder)
- **X** to toggle dollhouse / cutaway mode (see inside buildings)
- **R** to resume autopilot camera drift
- **Space** to follow a random NPC
- **WASD / Arrow keys** to pan manually
- **Scroll wheel / Pinch** to zoom

---

### Settings & integrations

Toggle from the Settings panel:
- **Retro 16-bit mode** (480×270 virtual canvas, CSS upscale to screen) — enabled by default for the authentic pixel feel; disable for high-res rendering
- **CRT scanlines overlay**
- **Ambient drone pad** (quiet background hum)
- **Ambient melody** (sparse phrases over the pad)
- **Sim speed** (0.25× to 3×)
- **Git integration** — add repository paths; commits, pushes, and branch changes become world events
- **File system watcher** — a new file in a watched folder arrives as a caravan
- **System monitor** — CPU load drives the mines; network bursts launch airships; idle time fills the tavern

---

### Requirements

- Windows 10/11 (x64)
- WebView2 runtime (included in Windows 10 Oct 2018 update and later; installer will prompt if missing)
- 200 MB RAM at idle (~50 MB base + procgen map)
- Any GPU with WebGL 2 support (integrated graphics fine)

---

### Roadmap / known limitations

- **Art**: the current release uses procedurally-drawn placeholder sprites. Real 16-bit pixel art is in progress; the asset pipeline is ready and sprites will be updated in a future patch.
- **macOS / Linux**: Tauri builds cross-platform but these are untested and not officially supported yet.
- **Save slots**: 3 save slots; kingdoms can be exported/imported as JSON.

---

## Tags (itch.io)
`ambient`, `desktop-app`, `pixel-art`, `fantasy`, `simulation`, `idle`, `snes`, `rpg`, `16bit`, `procedural-generation`, `life-sim`, `windows`

## Genre
Simulation, Ambient

## Classification
Application / Interactive Experience

## Pricing recommendation
**$4.99** launch price — pay-what-you-want floor of $1.99. The "I want to support this" tier is $9.99. Justify upgrade: you're paying for ongoing development toward real pixel art.

---

## Devlog post #1 (launch announcement)

**KingdomOS 0.2 — a kingdom that lives beside your work**

I've been building an ambient desktop app for the past several months that I've been wanting to make for years: a tiny SNES-style fantasy kingdom that runs in a window while I code.

The premise is simple. Leave it open. It runs on its own — NPCs have daily schedules, seasons turn, dynasties rise and fall, usurpers occasionally challenge the throne. Come back after a day away and there's a steward's briefing waiting: *"The kingdom now numbers 22 souls. The treasury holds 94 gold. While you were away, a child was born."*

But optionally, it also reacts to what you're doing. Point it at a git repository. When you push a commit, a courier rides across the map. Merge to main and the forge fires. CPU spike from a build run and the mines glow red — overtime shift. None of this is required. The kingdom tells its own stories. But if you wire it up, your work becomes part of the world's history.

The current release uses procedurally-drawn placeholder art — the world runs on pure code sprites. Real pixel art is coming. The asset pipeline is complete (TexturePacker atlas support, 4-directional animation, manifest-based drop-in); I'm working on the art itself.

Try it. It's $4.99, pay-what-you-want. Tell me what happens in your kingdom.
