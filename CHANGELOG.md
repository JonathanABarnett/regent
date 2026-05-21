# Changelog

All notable changes to KingdomOS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] — 2026-05-xx

### New systems
- **Usurper challenges** — court figures accumulate power and challenge the throne from year 2+. Four player choices: exile, negotiate, imprison, or yield. Ignored decisions auto-resolve in the usurper's favour.
- **Peasant uprisings** — when gold runs low and population grows, an agitator rises among the villagers. Address grievances, suppress, or yield to the people.
- **Dynasty streak** — tracks consecutive natural successions. Resets on usurper or uprising takeover. Displayed in the chronicle.
- **Reputation system** — a -10..+10 benevolent/feared axis updated by every decision. Flavours journal prose and anniversary entries.
- **Factions** — three power blocs (Merchants, Scholars, Guard) with loyalty scores. Pleased factions grant passive bonuses; displeased factions write journal complaints.
- **LifeCycle system** — children born in the kingdom grow up and choose careers based on their parents' roles. Workers over 65 retire. Occasional friendship bonds form between co-located NPCs.
- **Treasury pressure** — near-bankruptcy fires warnings and causes NPC departures; sustained prosperity fires a celebration.
- **Monarch Legacy** — when any monarch leaves the throne (by death, usurper, or uprising), a reign-summary scroll is placed in the royal vault.

### Story content
- 25+ quest arcs total; added: plague scare, trade caravan, legendary beast, diplomatic marriage, comet sighting, elder council, succession crisis, court conspiracy, foreign envoy, reform movement
- 3 rare year-5+ events: legendary hero born among citizens, wandering prophet, underground cavern with 3-path decision
- Late-game decision pool: royal pardon, spy report, noble alliance
- Year 5 / 10 / 20 / 50 anniversary milestones with unique prose
- Marriage anniversaries: every 90 in-world days a couple's anniversary is noted in the chronicle

### NPC depth
- **NPC Profile Panel** — click any NPC sprite or journal name to open their full life story: age, trait, family tree, journal entries, backstory, "Find on map" button
- **Journal linkification** — NPC names in journal entries are now clickable links
- **Activity indicators** — floating icons above NPCs: ZZZ (sleeping), spark (forge work), lantern (mine work), heart (partners nearby), ! (monarch during crisis)
- Rich death prose includes surviving partner and children by name
- Trait-aware marriage prose (8 pairing pools: joyful+grim, curious+wise, etc.)
- Birth blessings drawn from parents' combined traits

### Graphics & rendering
- **Retro 16-bit mode** — renders at 480×270 virtual canvas, CSS-upscaled with nearest-neighbour; chunky pixel feel at any resolution (default on; toggle in Settings)
- **Seasonal tile variations** — autumn turns forest crowns orange/rust, plains golden; winter adds snow patches and crowns to forest/plain/hill
- **Road layer** — BFS-computed dirt paths connecting all structures
- **Decoration layer** — boulders on hills; spring flowers; summer grass tufts; autumn leaf clusters; winter snow drifts
- **Night lights layer** — building window and forge glows keyed to in-world hour; forge flickers with blacksmith-activity intensity
- **Edge transitions** — shadow gradients at biome boundaries with viewport caching
- **Stars + moon** — 80 seeded stars that twinkle; crescent moon arcs across the sky between hours 19–6
- **Seasonal particles** — spring pollen, summer fireflies, autumn falling leaves
- **Animated water** — 4-frame ripple cycle on ocean and river tiles
- **Redesigned procedural characters** — 16×22px figures with proper alternating-leg walk cycles, 1px outlines, 3-shade colour ramps, role-specific silhouettes (guard helmet, blacksmith apron, scholar robe, miner hard hat, courier saddlebag)
- **4-directional animation** pipeline ready for real sprite sheets
- **TexturePacker atlas loader** — drop in `atlas.json + atlas.png`, list in manifest
- **Lightning flash** — brief white bloom during storms
- **Cinematic camera** — priority-weighted autopilot gravitates toward active events (festivals, forge, couriers) not random structures

### UI & UX
- **Vault Browser** — Settings → "◆ Royal Vault" shows all artifacts with full provenance
- **Kingdom Chronicle** — auto-generated prose history panel; downloadable as Markdown
- **3 save slots** — title screen slot picker; backward-compatible (slot 0 = legacy key)
- **Achievement toast** — category-coloured icons, 6-second auto-dismiss, "View in journal" button
- **Journal share button** — 📋 copies any entry to clipboard
- **F12 screenshot** — captures Pixi canvas as PNG download
- **Touch controls** — pinch-to-zoom on mobile/tablet

### Infrastructure
- **Git integration now works** — integration toggles and watched paths are synced to the Rust side on boot and on every change; git watcher fires courier/forge/research events on commit/push/merge
- **Tauri bundle config** — Windows NSIS installer block, WebView2 embed, bundle descriptions
- **GitHub Actions** — release workflow: test → Windows installer → itch.io HTML5 upload

---

## [0.1.0] — 2025-xx-xx

Initial release.

- Procedurally generated 96×64 overworld map (simplex noise, biome thresholds)
- NPCs with daily schedules, home/work pathfinding, marriage, births, deaths
- Day/night cycle, weather (clear/cloud/rain/storm/snow), seasons
- Internal economy: ore → ironwork, books → tomes
- Narrative Director: couriers, forge events, research, festivals, celebrations
- 15 quest arcs: traveler, festival, rival banner, lost child, drought, and more
- Court appointments: Advisor, Captain, Scholar with passive effects
- Royal Edicts: 4 types, 7-day window
- Royal Vault with artifact accumulation
- Aspirations and Achievements systems
- Kingdom Card shareable PNG
- Tray menu: show/hide, overlay mode, fullscreen secondary monitor
- Minimize-to-tray on close, low-CPU mode when hidden
- Inbox folder (drop a JSON file, world reacts)
- Twitch integration: follow/sub/bits/raid events spawn NPCs and effects
