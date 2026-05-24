# Phase 1 — recruiting your first 10-20 testers

This is the unskippable step from [`V1_ROADMAP.md`](V1_ROADMAP.md). Below: ready-to-post copy for each channel, a structured feedback form, and the watch list for what to actually look for.

The live demo at <https://jonathanabarnett.github.io/kingdomos/> auto-deploys on every push to main. **Verify the latest build is up before recruiting** (open in an incognito window, founding a kingdom should fire the FoundingDay sequence within 30 seconds).

---

## Bluesky / X / Mastodon — short post

> just shipped a pre-alpha of KingdomOS — an ambient SNES-style fantasy kingdom that lives on your desktop. NPCs walk schedules, the chronicle writes itself, your choices ripple weeks later. looking for 10-20 testers willing to do a 30-min session and tell me what's bad about it. free in browser, no signup. boost appreciated 🏰
>
> ▶ https://jonathanabarnett.github.io/kingdomos/

Variants for hashtags / community tags:
- `#indiegamedev #pixelart #screenshotsaturday`
- `#tinygames #cozygames`
- `#solodev #gamedev`

Time-of-day: post Tuesday or Wednesday morning (US Pacific) for best indie-gamedev engagement. Reply to your own thread with a 15-second WebM clip (use the in-game record button) about 30 minutes after posting — that's what makes people click.

---

## Reddit — r/Tinygames or r/incremental_games

**Title**: `[Pre-alpha] KingdomOS — an ambient SNES-style kingdom that lives on your desktop, looking for ~15 testers`

```
Hey r/Tinygames,

I've been building KingdomOS for the past few months: a 16-bit
ambient fantasy kingdom that you found, name, and then mostly
just watch. NPCs walk daily schedules. Couriers ride between
towns. The chronicle writes itself. Seasons turn. When you do
make a choice (a petition arrives, a cult forms, war breaks
out), the consequences echo through the journal for weeks
in-world.

Think: FF6 town pacing × RimWorld emergent storytelling, but
ambient — you can leave it open in a window while you work
and come back to a story.

It's nowhere near done. Before I do any more polish, I need
to know if the core loop actually lands for 30 minutes. So
I'm looking for ~15 testers willing to:

  1. Boot it (browser, no signup, free)
  2. Found a kingdom
  3. Play for 30 minutes (you can speed up time to 3×)
  4. Tell me what was good, what was confusing, and the
     moment you almost closed the tab

Live build: https://jonathanabarnett.github.io/kingdomos/

Feedback form: [link to your Google Form or just say "DM me"]

If you're in: thanks. I'll send you the credits-page mention
when 1.0 ships. If you're not: a comment about why is also
useful.
```

Don't post in r/gaming, r/indiegames, or r/indiegaming as your first move — they're too broad and too cynical for a pre-alpha. r/Tinygames and r/incremental_games are sized for actual conversations.

---

## Friends + family — direct message template

Personalized, short, low-pressure.

```
Hey — I've been building a little fantasy-kingdom thing for
fun. It's at a point where I need to know whether it's
actually any good. Would you spend 30 minutes with it this
week and tell me what you think? It's free in the browser:

https://jonathanabarnett.github.io/kingdomos/

No signup. Just click BEGIN, name your kingdom, and see how
long you stay. Even if you close it in 5 minutes that tells
me something — you'd be doing me a real favor.
```

For each person, follow up 3 days later with one specific question — *"what made you close the tab?"* or *"did you find the Stats panel?"* or *"did your kingdom make it to year 5?"* Specific questions get specific answers.

---

## Discord — small communities only

Skip the giant servers. Post in:
- The Tauri discord (#showcase channel) — devs who'll appreciate the stack
- /r/incremental_games discord — your actual audience
- Any small server you're already a member of

Don't drop the link cold. Lead with: "I've been working on this for a few months and I'd value 30 minutes of anyone's time — context: …"

---

## The feedback form

Use a Google Form with these exact questions. Don't add more. Long forms get abandoned.

```
1. How long did you actually play?
   ○ Less than 5 minutes
   ○ 5-15 minutes
   ○ 15-30 minutes
   ○ 30+ minutes

2. At minute 5, what were you feeling?
   ○ Excited / curious
   ○ Confused
   ○ Bored
   ○ Already closed it

3. What was the most interesting thing that happened?
   [Text]

4. What was the most confusing thing on screen?
   [Text]

5. Did you make a decision when one was offered? What did
   you choose, and did the choice feel meaningful?
   [Text]

6. Would you come back tomorrow without me asking?
   ○ Yes
   ○ Maybe
   ○ No

7. One thing that would make this better:
   [Text — optional]

8. (Optional) Permission to credit you on the launch page?
   [Text — name + how to spell it]
```

Form link template: `https://forms.gle/...`

---

## What to watch for (your private cheatsheet)

Across the responses, flag patterns. Not single complaints — patterns.

### Drop-off signals
- ≥30% closing under 5 minutes → the FoundingDay sequence isn't landing. Either the visual is too subtle or the world reads as empty even with fireworks
- ≥30% closing 5-15 minutes → the Welcome Petition might not be firing reliably, or the gap between it and the next thing is too long
- ≥30% answering "Maybe" or "No" to "come back tomorrow" → the core loop doesn't have the legs we thought it did

### Confusion signals
- Multiple mentions of "I didn't know what X meant" → microcopy / tooltips problem (easy fix)
- "What's the goal?" → the Aspirations panel needs to be more prominent
- "Why are there icons in the HUD?" → the chip labels need text not just emoji

### "Oh nice!" signals (collect these)
- Specific moments people loved → these become marketing copy verbatim
- Screenshots people took → ask permission to use them on the itch page
- Stories they tell about their kingdom → the proof the emergent narrative is working

### Bugs vs design issues
- Bug: "the game crashed when I clicked X" → fix in Phase 2 immediately
- Design issue: "I didn't like X" → log, look for patterns, don't react to one person

---

## Setting up the feedback channel

Easiest path:

1. Create a free Google Form with the 8 questions above
2. Make a single-page redirect on the existing site: `https://jonathanabarnett.github.io/kingdomos/playtest/` → link to the form
3. Add a small "feedback?" link in the in-game Settings panel pointing at the same URL (one CSS line + a `<a href>` in Settings)
4. Pin the form link in any Discord/Reddit thread you're active in
5. Reply to everyone who submits within 24 hours, even just "thank you, this is exactly what I needed"

The replies are what turn 10 one-off testers into 10 people who tell their friends.

---

## Realistic timeline

| Week | Activity |
|---|---|
| 1 | Set up form. Verify live demo is current. Post to Bluesky + 1 Reddit + DM 5 friends. |
| 2 | DM 5 more friends. Reply to every comment. Iterate on the form if questions need clarifying. |
| 3 | Pause posting. Read every response. Look for patterns. Start Phase 2 backlog. |
| 4 | Optional: post a "thank you, here's what's changing" devlog. |

**Target**: 10-20 thoughtful responses by end of week 3. More is better but isn't required — past 20, the marginal new information drops sharply.

---

## What you do NOT do during Phase 1

- Ship new features (Phase 2 work, not Phase 1)
- Argue with feedback ("but the cutaway view is obvious!" — if 3 people miss it, it's not obvious)
- Sweat individual negative reactions — the patterns are the signal, not the outliers
- Promise specific fixes in replies (you don't know yet what the Phase 2 budget will absorb)

Just: collect, listen, look for patterns, and trust the process.
