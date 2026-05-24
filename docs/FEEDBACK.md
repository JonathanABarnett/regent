# In-app feedback system

Players can send bug reports, ideas, love letters, and questions from
**Settings → Send feedback** or via the "Tell the dev →" link in the
Help overlay (`?` / `H` keys).

The submission flow is **local-first**: every entry is saved to
localStorage (`kingdomos.feedback.drafts.v1`, capped at 20 entries) so
nothing is lost if the remote POST fails. If no remote endpoint is
configured, every submission becomes a local draft the player can
export from Settings → Diagnostics.

For player-facing copy and policy framing, see
[`MARKETING.md`](MARKETING.md). This doc is about *the backend*: how
to actually receive the submissions when you ship.

---

## Architecture

```
Player clicks "Send" in FeedbackPanel
        ↓
src/lib/feedback.ts → submitFeedback()
        ↓
   ┌────┴────┐
   ↓         ↓
localStorage  fetch(VITE_FEEDBACK_ENDPOINT)
(always)      (only if endpoint configured)
              ↓
        YOUR backend (Cloudflare Worker / Formspree / custom)
              ↓
        ┌─────┼─────┐
        ↓     ↓     ↓
       Discord  Email  Database
       webhook  (you)  (KV/D1)
```

Each submission posts a JSON envelope:

```jsonc
{
  "v": 1,
  "category": "bug" | "idea" | "love" | "question" | "other",
  "message": "string, ≤ 4000 chars",
  "contact": "optional string, ≤ 200 chars",
  "snapshot": {              // optional, only if player opted in
    "day": 47,
    "year": 1,
    "season": "summer",
    "npcs": 12,
    "mood": "the kingdom is content",
    "recentCrashes": 0,
    "buildId": "0.3.0"
  },
  "version": "0.3.0",
  "ts": 1716557400000
}
```

Configure via build-time env var:

```bash
# .env.local (gitignored)
VITE_FEEDBACK_ENDPOINT=https://kingdomos-feedback.your-worker.workers.dev
VITE_APP_VERSION=0.3.0
```

If unset, the in-app form still works — submissions just stay local.

---

## Option 1 — Cloudflare Worker → Discord webhook  (recommended)

Free tier handles 100k requests/day. ~10 minutes to deploy. The
combination gives you near-zero ops + a real-time notification stream
in a private Discord channel.

### 1. Create a Discord webhook

In your dev/community Discord, create a channel called `#feedback` →
Edit channel → Integrations → Webhooks → New Webhook → copy URL.

Looks like:
`https://discord.com/api/webhooks/<id>/<token>`

### 2. Worker code

Create `worker.js`:

```js
const DISCORD_WEBHOOK_URL = "PASTE_YOUR_WEBHOOK_URL_HERE";

export default {
  async fetch(req) {
    // CORS preflight — feedback comes from a browser
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }
    if (req.method !== "POST") {
      return new Response("Use POST", { status: 405, headers: corsHeaders() });
    }
    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders() });
    }

    // Validate shape — drop anything malformed
    if (typeof payload?.message !== "string" || !payload.message.trim()) {
      return new Response("Missing message", { status: 400, headers: corsHeaders() });
    }
    if (payload.message.length > 4000) {
      return new Response("Message too long", { status: 413, headers: corsHeaders() });
    }

    // Format for Discord — embed gives nice color-coded categories
    const colors = {
      bug:      0xef4444,
      idea:     0xfbbf24,
      love:     0xf472b6,
      question: 0x60a5fa,
      other:    0x94a3b8,
    };
    const cat = payload.category ?? "other";
    const snap = payload.snapshot;
    const fields = [];
    if (payload.contact) {
      fields.push({ name: "Contact", value: payload.contact, inline: true });
    }
    if (payload.version) {
      fields.push({ name: "Version", value: payload.version, inline: true });
    }
    if (snap) {
      fields.push({
        name: "Kingdom",
        value: `Y${snap.year} · day ${snap.day} · ${snap.season} · ${snap.npcs} npcs${snap.mood ? ` · ${snap.mood}` : ""}${snap.recentCrashes ? ` · ${snap.recentCrashes} recent crashes` : ""}`,
        inline: false,
      });
    }

    const discordBody = {
      embeds: [{
        title: `${cat.toUpperCase()} feedback`,
        description: payload.message,
        color: colors[cat] ?? colors.other,
        fields,
        timestamp: new Date().toISOString(),
      }],
    };

    const r = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordBody),
    });

    if (!r.ok) {
      console.error("Discord webhook failed:", r.status);
      return new Response("Discord rejected", { status: 502, headers: corsHeaders() });
    }
    return new Response("ok", { status: 200, headers: corsHeaders() });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // tighten in production
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
```

### 3. Deploy

```bash
npm install -g wrangler
wrangler login
wrangler init kingdomos-feedback
# Replace src/index.js with worker.js above
wrangler deploy
```

Wrangler prints the deployed URL (`https://kingdomos-feedback.<your-subdomain>.workers.dev`).

### 4. Wire it

```bash
# .env.local
VITE_FEEDBACK_ENDPOINT=https://kingdomos-feedback.<your-subdomain>.workers.dev
```

Rebuild (`npm run build`), deploy, send a test feedback from the live
site — it should appear in your `#feedback` channel within seconds.

### Hardening for production

- Replace `Access-Control-Allow-Origin: *` with your actual domain
- Add rate limiting (Cloudflare's built-in rate-limit rules cost $5/mo)
- Add basic spam detection (length, repeated submissions, link patterns)
- Optional: log everything to a KV store as a backup

---

## Option 2 — Formspree  (no code, $0-$10/mo)

If you don't want to maintain even a Worker:

1. Sign up at [formspree.io](https://formspree.io)
2. Create a new form → copy the endpoint URL
3. Set `VITE_FEEDBACK_ENDPOINT` to that URL
4. Submissions arrive in your Formspree dashboard + email

Free tier: 50 submissions/month. $10/mo for 1,000. Easiest possible
backend — no devops at all — but limited customization and you're
locked to their UI for browsing submissions.

---

## Option 3 — Sentry feedback  (if you already use Sentry)

If you stand up Sentry for crash reporting (see `lib/crashLog.ts`),
their **User Feedback** product accepts the same envelope shape. Cuts
your services down to one. Free tier covers 1,000 events/month.

---

## Option 4 — Email-only  (deferred, not great UX)

Worst case: change `submitFeedback` to use `mailto:` URLs. The
player's email client opens with prefilled subject/body. The downside
is that ~30% of players (Chromebooks, mobile browsers, no configured
client) bounce — that's why we don't make this the default.

---

## Triage: what to do with the submissions

Once feedback starts flowing, you need a routine. Most indie devs
fail at this step — feedback accumulates, none of it gets acted on,
and players stop sending because they sense the void.

### Weekly cadence

- **Monday**: read everything from the prior week. No replies yet,
  just absorb.
- **Tuesday**: group submissions by theme — what are 3+ people saying?
  These are signal. Outliers are noise (for now).
- **Wednesday**: reply individually to *every single submission*,
  even just "thank you, I'm thinking about this." A reply within a
  week dramatically improves the chance the player sends another.
- **Thursday**: triage signal-themes into the project backlog. Tag
  with category (UX / content / bug / refactor).
- **Friday**: write a public devlog covering 1 piece of feedback that
  shipped a change. Builds trust.

### Categories to triage into

- **Ship now** (under 1 day of work, clearly improves the game) →
  v1.0.x patch
- **Ship soon** (1-3 days of work, clearly improves) → next minor
- **Investigate** (interesting but unclear ROI) → write a devlog post
  exploring it; let the comments guide you
- **Defer** (interesting but expensive or off-vision) → tag and forget
  until the same theme appears 3+ more times
- **Reject** (off-vision, doesn't fit the game) → reply with a kind
  "thanks but this isn't a direction I'm going" — players respect
  this more than silence

### What NOT to do

- Don't promise specific fixes in your reply ("yes I'll add that
  next week"). You don't know your Phase 2 budget yet.
- Don't react to single complaints. Wait for patterns.
- Don't engage with hostility. One screenshot of a defensive reply
  ruins more than any feature ships.
- Don't auto-respond. Auto-replies feel worse than no reply at all.

---

## Privacy posture

The feedback system is built privacy-respecting by default. When you
publish the privacy policy required by app stores:

- We collect: the message text, optional contact info, optional
  kingdom snapshot (day/year/season/NPC count/mood/crash count) — all
  only on explicit submission
- We do NOT collect: NPC names, journal entries, monarch identity,
  IP address (the Worker doesn't log), any persistent identifier
- We retain: as long as the dev needs to act on it; no automated
  expiration
- We do NOT share with third parties beyond the Discord/Formspree
  channel the player can see is configured (the endpoint URL is in
  the JS bundle and auditable)

The "show what gets sent" disclosure in the panel reinforces this —
players can read the exact JSON before they submit.
