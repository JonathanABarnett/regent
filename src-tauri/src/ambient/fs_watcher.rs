//! File-system watcher: every watched path is observed via `notify`.
//! New file creation → courier event. Modification → research event.

use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::events::KingdomEvent;
use crate::state::AppState;

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let (tx, mut rx) = mpsc::unbounded_channel::<Event>();

    let mut watcher: RecommendedWatcher = match notify::recommended_watcher(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
    ) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!("fs_watcher: failed to init notify: {e}");
            return;
        }
    };

    let mut current: Vec<String> = Vec::new();

    loop {
        // resync watched paths every 5 seconds (or when receiving events)
        let resync = async {
            let cfg = state.integrations.read().await.clone();
            if !cfg.fs {
                return Vec::<String>::new();
            }
            state.watched_paths.read().await.clone()
        };

        let desired = resync.await;
        if desired != current {
            // simplest: stop and re-add. notify v6 has no clean "unwatch all".
            for p in current.iter() {
                let _ = watcher.unwatch(std::path::Path::new(p));
            }
            for p in desired.iter() {
                if let Err(e) = watcher.watch(std::path::Path::new(p), RecursiveMode::Recursive) {
                    tracing::warn!("fs_watcher: cannot watch {p}: {e}");
                }
            }
            current = desired;
        }

        // drain events for ~1s, then re-check toggles
        let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
        while let Ok(Some(ev)) = time::timeout_at(deadline, rx.recv()).await {
            handle_event(&app, ev).await;
        }
    }
}

async fn handle_event(app: &AppHandle, ev: Event) {
    let path = ev.paths.first().cloned();
    let label = path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "fs change".to_string());

    let kingdom = match ev.kind {
        EventKind::Create(_) => KingdomEvent::new("courier", "fs")
            .intensity(0.4)
            .from_to("rivermouth", "highkeep")
            .label(label),
        EventKind::Modify(_) => KingdomEvent::new("research", "fs")
            .intensity(0.3)
            .structure("scriptorium")
            .label(label),
        _ => return,
    };
    let _ = app.emit("kingdom:event", &kingdom);
}
