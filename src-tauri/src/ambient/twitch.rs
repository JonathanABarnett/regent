//! Twitch EventSub adapter (WebSocket variant — no public ingress required).
//!
//! Flow:
//!   1. User pastes a User Access Token from twitch.tv → app dashboard into
//!      Settings. (We deliberately don't do OAuth in-app — that needs a
//!      hosted redirect URL and is overkill for a single-user desktop app.)
//!   2. The adapter connects to `wss://eventsub.wss.twitch.tv/ws` and reads
//!      the welcome message to grab the session id.
//!   3. It calls Helix `POST /eventsub/subscriptions` for each event type
//!      we care about (channel.follow, channel.subscribe, channel.cheer,
//!      channel.raid) referencing the session id.
//!   4. Subsequent `notification` messages get translated into our
//!      KingdomEvent shape and emitted on the `kingdom:event` channel.
//!   5. Reconnect messages and keepalive timeouts are handled by reopening
//!      the WS and re-subscribing.
//!
//! This file COMPILES against the existing src-tauri deps but is not yet
//! wired into `mod.rs` or `lib.rs::setup`. To enable:
//!   1. Add `tokio-tungstenite = "0.21"` and `reqwest = { version = "0.12",
//!      features = ["json"] }` to Cargo.toml.
//!   2. Add `pub mod twitch;` to src-tauri/src/ambient/mod.rs.
//!   3. Spawn `tokio::spawn(ambient::twitch::run(app.clone(), state.clone()))`
//!      from setup in lib.rs, gated on `state.integrations.read().twitch`.
//!
//! Twitch EventSub WebSocket docs:
//!   https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
//!
//! NOTE: this file is intentionally NOT included in `mod.rs` until the
//! dependencies above are added — keeping it dormant prevents the workspace
//! from breaking on a stock checkout.

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::time;

use crate::events::KingdomEvent;
use crate::state::AppState;

// Twitch endpoints
const WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const HELIX_SUBS: &str = "https://api.twitch.tv/helix/eventsub/subscriptions";

#[derive(Debug, Clone)]
pub struct TwitchConfig {
    /// Twitch OAuth user access token (with required scopes).
    pub access_token: String,
    /// Twitch app client id (paired with the access token).
    pub client_id: String,
    /// The broadcaster's user id (NOT login name — get this via Helix /users).
    pub broadcaster_id: String,
}

/// Subset of the welcome message we care about.
#[derive(Debug, Deserialize)]
struct WsMessage {
    metadata: WsMetadata,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct WsMetadata {
    message_type: String,
    #[serde(default)]
    subscription_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SessionPayload {
    session: SessionInfo,
}

#[derive(Debug, Deserialize)]
struct SessionInfo {
    id: String,
    #[serde(default)]
    reconnect_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct SubscriptionRequest<'a> {
    #[serde(rename = "type")]
    sub_type: &'a str,
    version: &'a str,
    condition: serde_json::Value,
    transport: TransportConfig<'a>,
}

#[derive(Debug, Serialize)]
struct TransportConfig<'a> {
    method: &'a str,
    session_id: &'a str,
}

/// Public entry point. Spawn this from `setup` in lib.rs once the user has
/// configured a Twitch access token. Loops forever — on disconnect it waits
/// briefly and reconnects.
#[allow(dead_code)]
pub async fn run(app: AppHandle, state: Arc<AppState>, cfg: TwitchConfig) {
    loop {
        // Defer to the toggle — if Twitch integration is disabled, sleep and re-check.
        // (You'll need to add `twitch: bool` to IntegrationToggles.)
        // if !state.integrations.read().await.twitch {
        //     time::sleep(Duration::from_secs(5)).await;
        //     continue;
        // }
        let _ = state; // silence unused warning until twitch toggle is added

        match run_once(&app, &cfg).await {
            Ok(()) => {
                tracing::info!("twitch: session ended cleanly, reconnecting in 3s");
            }
            Err(e) => {
                tracing::warn!("twitch: session error: {e:?}, reconnecting in 10s");
                time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        }
        time::sleep(Duration::from_secs(3)).await;
    }
}

/// One complete session — connect, subscribe, read until disconnect/error.
#[allow(dead_code)]
async fn run_once(_app: &AppHandle, _cfg: &TwitchConfig) -> Result<(), TwitchError> {
    // The actual WebSocket plumbing lives behind a feature flag because
    // tokio-tungstenite is not yet a dependency. Once added, replace this
    // block with:
    //
    //   use futures_util::{SinkExt, StreamExt};
    //   use tokio_tungstenite::connect_async;
    //
    //   let (ws, _resp) = connect_async(WS_URL).await
    //       .map_err(|e| TwitchError::WsConnect(e.to_string()))?;
    //   let (mut write, mut read) = ws.split();
    //
    //   // Read the welcome message
    //   let welcome = read.next().await.ok_or(TwitchError::EarlyClose)??;
    //   let msg: WsMessage = serde_json::from_str(welcome.to_text()?)?;
    //   if msg.metadata.message_type != "session_welcome" {
    //       return Err(TwitchError::Protocol("expected session_welcome".into()));
    //   }
    //   let session: SessionPayload = serde_json::from_value(msg.payload)?;
    //   let session_id = session.session.id;
    //
    //   // Subscribe to the four event types we care about
    //   subscribe_all(&cfg, &session_id).await?;
    //
    //   // Read forever
    //   while let Some(msg) = read.next().await {
    //       let msg = msg?;
    //       if msg.is_text() {
    //           let text = msg.to_text().unwrap();
    //           if let Ok(parsed) = serde_json::from_str::<WsMessage>(text) {
    //               if parsed.metadata.message_type == "notification" {
    //                   if let Some(ev) = translate(&parsed) {
    //                       let _ = _app.emit("kingdom:event", &ev);
    //                   }
    //               }
    //           }
    //       }
    //   }
    //   Ok(())

    // Until the deps are added, this scaffold returns immediately so the
    // binary still links. Replace this stub with the block above and the
    // adapter goes live.
    Err(TwitchError::NotImplemented)
}

/// Subscribe to the four event kinds via Helix REST. Each call sends the
/// session id so Twitch knows where to push events. Requires the token to
/// have these scopes:
///   moderator:read:followers
///   channel:read:subscriptions
///   bits:read
///   (raids only need the broadcaster_user_id condition — no scope)
#[allow(dead_code)]
async fn subscribe_all(cfg: &TwitchConfig, session_id: &str) -> Result<(), TwitchError> {
    let client = reqwest::Client::new();
    for (sub_type, version, condition) in [
        (
            "channel.follow",
            "2",
            serde_json::json!({
                "broadcaster_user_id": cfg.broadcaster_id,
                "moderator_user_id": cfg.broadcaster_id,
            }),
        ),
        (
            "channel.subscribe",
            "1",
            serde_json::json!({ "broadcaster_user_id": cfg.broadcaster_id }),
        ),
        (
            "channel.cheer",
            "1",
            serde_json::json!({ "broadcaster_user_id": cfg.broadcaster_id }),
        ),
        (
            "channel.raid",
            "1",
            serde_json::json!({ "to_broadcaster_user_id": cfg.broadcaster_id }),
        ),
    ] {
        let body = SubscriptionRequest {
            sub_type,
            version,
            condition,
            transport: TransportConfig {
                method: "websocket",
                session_id,
            },
        };
        let resp = client
            .post(HELIX_SUBS)
            .bearer_auth(&cfg.access_token)
            .header("Client-Id", &cfg.client_id)
            .json(&body)
            .send()
            .await
            .map_err(|e| TwitchError::HelixRequest(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::warn!("twitch: subscribe {sub_type} failed ({status}): {body}");
        }
    }
    Ok(())
}

/// Translate a Twitch EventSub notification into our KingdomEvent shape.
/// Mirrors the mappings in src/sim/events/EventMapper.ts so the same code
/// path handles either source.
#[allow(dead_code)]
fn translate(msg: &WsMessage) -> Option<KingdomEvent> {
    let sub_type = msg.metadata.subscription_type.as_deref()?;
    let event = msg.payload.get("event")?;
    match sub_type {
        "channel.follow" => {
            let user_name = event.get("user_name")?.as_str()?.to_string();
            let mut ev = KingdomEvent::new("twitch_follow", "twitch")
                .intensity(0.4)
                .label(format!("{user_name} followed"));
            ev.payload
                .meta
                .insert("user".to_string(), serde_json::Value::String(user_name));
            Some(ev)
        }
        "channel.subscribe" => {
            let user_name = event.get("user_name")?.as_str()?.to_string();
            let tier_str = event
                .get("tier")
                .and_then(|t| t.as_str())
                .unwrap_or("1000");
            // Twitch sub tiers: 1000=tier1, 2000=tier2, 3000=tier3
            let tier = match tier_str {
                "2000" => 2,
                "3000" => 3,
                _ => 1,
            };
            let mut ev = KingdomEvent::new("twitch_sub", "twitch")
                .intensity(0.6 + 0.1 * tier as f32)
                .label(format!("{user_name} subscribed (tier {tier})"));
            ev.payload
                .meta
                .insert("user".to_string(), serde_json::Value::String(user_name));
            ev.payload
                .meta
                .insert("tier".to_string(), serde_json::Value::from(tier));
            Some(ev)
        }
        "channel.cheer" => {
            let user_name = event
                .get("user_name")
                .and_then(|v| v.as_str())
                .unwrap_or("anonymous")
                .to_string();
            let bits = event.get("bits").and_then(|v| v.as_u64()).unwrap_or(0);
            let mut ev = KingdomEvent::new("twitch_bits", "twitch")
                .intensity((bits as f32 / 1000.0).clamp(0.3, 1.0))
                .label(format!("{user_name} cheered {bits} bits"));
            ev.payload
                .meta
                .insert("user".to_string(), serde_json::Value::String(user_name));
            ev.payload
                .meta
                .insert("bits".to_string(), serde_json::Value::from(bits));
            Some(ev)
        }
        "channel.raid" => {
            let from = event
                .get("from_broadcaster_user_name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let viewers = event.get("viewers").and_then(|v| v.as_u64()).unwrap_or(0);
            let mut ev = KingdomEvent::new("twitch_raid", "twitch")
                .intensity((viewers as f32 / 100.0).clamp(0.4, 1.0))
                .label(format!("{from} raided with {viewers} viewers"));
            ev.payload
                .meta
                .insert("user".to_string(), serde_json::Value::String(from));
            ev.payload
                .meta
                .insert("viewers".to_string(), serde_json::Value::from(viewers));
            Some(ev)
        }
        _ => None,
    }
}

#[derive(Debug)]
#[allow(dead_code)]
enum TwitchError {
    WsConnect(String),
    Protocol(String),
    EarlyClose,
    HelixRequest(String),
    /// Until the user enables `tokio-tungstenite` + `reqwest` in Cargo.toml
    /// and replaces `run_once`'s stub body, the adapter compiles but does
    /// not actually connect.
    NotImplemented,
}
