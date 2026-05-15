# KingdomOS Event Schema (v1)

External integrations talk to the world through a single JSON envelope.

```jsonc
{
  "v": 1,
  "id": "uuid-or-any-unique-string",
  "ts": 1715212800,
  "kind": "courier",
  "source": "github",
  "intensity": 0.6,
  "duration_ms": 30000,
  "payload": {
    "from": "scriptorium",
    "to": "highkeep",
    "label": "PR #142"
  }
}
```

## Fields

| field         | type                      | required | notes |
| ------------- | ------------------------- | -------- | ----- |
| `v`           | `1`                       | yes      | schema version |
| `id`          | string                    | yes      | unique per event; UUIDs are ideal |
| `ts`          | unix-seconds              | yes      | display time in the event log |
| `kind`        | enum (see below)          | yes      | what the world should *do* |
| `source`      | enum                      | no       | who sent it; defaults to `internal` |
| `intensity`   | `0.0..1.0`                | no       | scales animation/duration; default `0.5` |
| `duration_ms` | int ms                    | no       | optional override; sim picks a default per kind |
| `payload`     | object                    | no       | kind-specific arguments |

### Event kinds

| kind          | what shows up in-world                                    | typical payload                       |
| ------------- | ---------------------------------------------------------- | ------------------------------------- |
| `courier`     | rider travels between two landmarks                       | `from`, `to`, `label`                 |
| `forge`       | sparks + smoke at the forge                               | `structure` (default `ironhearth`)    |
| `research`    | scholar inscribes a tome at a library                     | `structure` (default `scriptorium`)   |
| `mining`      | mine glows; miners switch to overtime                     | `structure` (default `deeprock`)      |
| `storm`       | storm cell rolls in (forces weather to storm)             | (none)                                |
| `celebration` | fireworks + speech bubble at a structure                  | `structure`, `label`                  |
| `airship`     | airship drifts across the map                             | (none)                                |
| `monster`     | distant monster moves across the edge                     | (none)                                |
| `festival`    | longer-running celebration with NPC clustering           | `structure`, `label`                  |
| `custom`      | added to the event log only — visualization is on you    | anything                              |

### Sources

| source      | meaning                                       |
| ----------- | --------------------------------------------- |
| `github`    | from a watched git repo                        |
| `fs`        | from a watched folder                          |
| `system`    | from CPU/network/idle monitoring               |
| `http`      | from the optional local HTTP receiver          |
| `ws`        | from the optional websocket receiver           |
| `inbox`     | from a JSON file dropped into the inbox       |
| `narrative` | from the in-world narrative director          |
| `internal`  | from the simulation itself                    |

## Submitting events

### From a JSON file (no integration code needed)

Drop a `.json` file in the inbox directory. Find it from the app via
the Tauri command `inbox_path` or the default location:

- Windows: `%APPDATA%\com.jonat.kingdomos\inbox`

The file is consumed and moved to `inbox/processed/`.

### From local HTTP (when the `http-server` feature is built)

```sh
curl -X POST http://127.0.0.1:17820/events \
  -H "Content-Type: application/json" \
  -d '{"v":1,"id":"evt-1","ts":1715212800,"kind":"celebration",
        "source":"http","intensity":0.9,"duration_ms":8000,
        "payload":{"structure":"highkeep","label":"deploy ✓"}}'
```

### From the dev console

When the app is running, open devtools and:

```js
window.kingdomos.publish({
  v: 1, id: crypto.randomUUID(), ts: Math.floor(Date.now()/1000),
  kind: "courier", source: "internal", intensity: 0.7,
  payload: { from: "rivermouth", to: "highkeep", label: "test" }
});
```
