//! JSON inbox: drop a file in `%APPDATA%/KingdomOS/inbox/`, the world reacts.
//! After parsing the file is moved to a `processed/` subfolder so the same
//! file isn't replayed on next launch.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time;

use crate::events::KingdomEvent;
use crate::state::AppState;

const POLL_INTERVAL_SEC: u64 = 1;

pub fn inbox_dir(app: &AppHandle) -> Option<PathBuf> {
    let base = app.path().app_data_dir().ok()?;
    Some(base.join("inbox"))
}

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let inbox = match inbox_dir(&app) {
        Some(p) => p,
        None => return,
    };
    let processed = inbox.join("processed");
    let _ = tokio::fs::create_dir_all(&inbox).await;
    let _ = tokio::fs::create_dir_all(&processed).await;

    loop {
        time::sleep(Duration::from_secs(POLL_INTERVAL_SEC)).await;
        if !state.integrations.read().await.inbox {
            continue;
        }
        let mut entries = match tokio::fs::read_dir(&inbox).await {
            Ok(e) => e,
            Err(_) => continue,
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw = match tokio::fs::read_to_string(&path).await {
                Ok(s) => s,
                Err(_) => continue,
            };
            match serde_json::from_str::<KingdomEvent>(&raw) {
                Ok(mut ev) => {
                    if ev.source.is_empty() {
                        ev.source = "inbox".to_string();
                    }
                    let _ = app.emit("kingdom:event", &ev);
                }
                Err(err) => {
                    tracing::warn!("inbox: failed to parse {}: {}", path.display(), err);
                }
            }
            let dest = processed.join(path.file_name().unwrap_or_default());
            let _ = tokio::fs::rename(&path, &dest).await;
        }
    }
}
