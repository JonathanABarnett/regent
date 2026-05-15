# Integrations

KingdomOS runs an autonomous kingdom on its own. **Every integration below is optional** — toggle them in Settings as you go.

## Built-in (no code on your end)

### Narrative director

Always on by default. Periodically injects flavor events when the world has been quiet — traveling merchants, evening tavern gatherings, distant monster sightings.

### System monitor

Samples CPU and network usage every ~4s.

| Real signal              | Fantasy event                                |
| ------------------------ | -------------------------------------------- |
| CPU > 70% for 8s         | Mines glow + miners overtime                 |
| Network burst > 4 MB/4s  | Airship crosses the map                      |

### File watcher

Watch any folders you list in **Settings → Watched paths**.

| Filesystem signal | Fantasy event                  |
| ----------------- | ------------------------------ |
| File created      | Caravan arrives at Rivermouth  |
| File modified     | Scholar studies at scriptorium |

### Git watcher

Same `Watched paths` list. Polls each `.git` HEAD every ~8s.

| Git signal                    | Fantasy event                           |
| ----------------------------- | --------------------------------------- |
| Branch switched               | Courier rides scriptorium → highkeep   |
| New commit on `main`/`master` | Blacksmith forges at Ironhearth        |
| New commit on other branch    | Scholar inscribes a tome               |

### Inbox (JSON file drop)

Drop any KingdomOS-shaped JSON file in the inbox folder (Settings shows the path). The file is consumed within ~1s and moved to `processed/`.

```json
{ "v": 1, "id": "build-7", "ts": 1715212800,
  "kind": "celebration", "source": "inbox", "intensity": 0.9,
  "duration_ms": 8000,
  "payload": { "structure": "highkeep", "label": "build ✓" } }
```

A common pattern: have your build / deploy / test scripts write a JSON file at the end:

```sh
# inside scripts/notify-kingdomos.sh
INBOX="$APPDATA/com.jonat.kingdomos/inbox"
cat > "$INBOX/$(uuidgen).json" <<EOF
{ "v":1, "id":"$(uuidgen)", "ts":$(date +%s),
  "kind":"forge", "source":"inbox", "intensity":0.8,
  "payload":{"structure":"ironhearth","label":"$1"} }
EOF
```

## Opt-in extras

### Local HTTP server

Build with the feature:

```sh
cd src-tauri && cargo build --features http-server
```

Then enable it in Settings. The server binds 127.0.0.1:17820 (loopback only) and accepts `POST /events`.

```sh
curl -X POST http://127.0.0.1:17820/events \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"id":"x","ts":1715212800,"kind":"storm","source":"http","intensity":0.8,"payload":{"label":"prod alarm"}}'
```

## Dev console (always available)

In the running app press `Ctrl+Shift+I` to open devtools, then:

```js
const w = window.kingdomos;
w.publish({ v: 1, id: crypto.randomUUID(), ts: Math.floor(Date.now()/1000),
            kind: "festival", payload: { structure: "highkeep", label: "test" } });
```

## Twitch EventSub (WebSocket — scaffold present, activation required)

The frontend already handles `twitch_follow`, `twitch_sub`, `twitch_bits`, and `twitch_raid` events fully. The Rust adapter that subscribes to live Twitch events is **scaffolded** in `src-tauri/src/ambient/twitch.rs` but not yet active.

### Activation (≈30 minutes)

1. **Add WebSocket + HTTP deps** to `src-tauri/Cargo.toml`:
   ```toml
   tokio-tungstenite = { version = "0.21", features = ["native-tls"] }
   futures-util = "0.3"
   reqwest = { version = "0.12", features = ["json"] }
   ```

2. **Declare the module** in `src-tauri/src/ambient/mod.rs`:
   ```rust
   pub mod twitch;
   ```

3. **Fill in `run_once`** — the function body is currently a stub returning `TwitchError::NotImplemented`. The full WebSocket loop is in a comment block right above it (lines ~95-130 of `twitch.rs`). Uncomment + adapt.

4. **Spawn from `setup`** in `lib.rs`:
   ```rust
   let twitch_cfg = ambient::twitch::TwitchConfig {
       access_token: settings.twitch_token.clone(),
       client_id: env!("TWITCH_CLIENT_ID").to_string(), // build-time env
       broadcaster_id: settings.twitch_broadcaster_id.clone(),
   };
   tokio::spawn(ambient::twitch::run(app.clone(), state.clone(), twitch_cfg));
   ```

5. **Get a Twitch token**. Easiest path: [twitchtokengenerator.com](https://twitchtokengenerator.com) with these scopes:
   - `moderator:read:followers`
   - `channel:read:subscriptions`
   - `bits:read`

   (Raids don't need a scope — just the broadcaster id in the condition.)

6. **Find your broadcaster id**:
   ```sh
   curl -H "Client-Id: $CLIENT_ID" -H "Authorization: Bearer $TOKEN" \
     "https://api.twitch.tv/helix/users?login=yourname"
   ```

The frontend then receives events on the `kingdom:event` channel exactly as if they came from the inbox — no further wiring needed.

### What you'll see in-world

| Twitch event | In-world reaction |
|---|---|
| Follow | A courier rides from Rivermouth → Highkeep with the follower's name |
| Subscription | A new villager spawns named after the subscriber, with a backstory line in the journal |
| Bits | Gold appears in the treasury; a small celebration at the castle |
| Raid | An airship arrives + companion villagers settle in towns |

## See also

- [docs/EVENT_SCHEMA.md](EVENT_SCHEMA.md) — full event schema reference
- `scripts/seed-events.ps1` — sample events to throw at the inbox
