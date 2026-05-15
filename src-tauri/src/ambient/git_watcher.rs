//! Git watcher: polls watched paths' .git directories for new HEAD/branch state.
//! Lightweight — reads HEAD ref + remembered SHA, no libgit2 to keep build small.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time;

use crate::events::KingdomEvent;
use crate::state::AppState;

const POLL_INTERVAL_SEC: u64 = 8;

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let mut last_sha: HashMap<PathBuf, String> = HashMap::new();
    let mut last_branch: HashMap<PathBuf, String> = HashMap::new();
    loop {
        time::sleep(Duration::from_secs(POLL_INTERVAL_SEC)).await;
        let cfg = state.integrations.read().await.clone();
        if !cfg.git {
            continue;
        }
        let paths = state.watched_paths.read().await.clone();
        for p in paths {
            let path = PathBuf::from(&p);
            let git_dir = path.join(".git");
            if !git_dir.exists() {
                continue;
            }
            let (branch, sha) = match read_head(&git_dir).await {
                Some(v) => v,
                None => continue,
            };
            let prev_sha = last_sha.get(&path).cloned();
            let prev_branch = last_branch.get(&path).cloned();
            let repo_label = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "repo".to_string());

            if prev_branch.as_deref() != Some(&branch) && prev_branch.is_some() {
                let _ = app.emit(
                    "kingdom:event",
                    KingdomEvent::new("courier", "github")
                        .intensity(0.5)
                        .from_to("scriptorium", "highkeep")
                        .label(format!("{repo_label} → {branch}")),
                );
            }
            if prev_sha.as_deref() != Some(&sha) && prev_sha.is_some() {
                let kind = if branch == "main" || branch == "master" {
                    "forge"
                } else {
                    "research"
                };
                let mut ev = KingdomEvent::new(kind, "github")
                    .intensity(if kind == "forge" { 0.8 } else { 0.4 })
                    .label(format!("{repo_label}: new commit on {branch}"));
                ev.payload.structure = Some(if kind == "forge" {
                    "ironhearth".to_string()
                } else {
                    "scriptorium".to_string()
                });
                let _ = app.emit("kingdom:event", &ev);
            }
            last_sha.insert(path.clone(), sha);
            last_branch.insert(path, branch);
        }
    }
}

async fn read_head(git_dir: &Path) -> Option<(String, String)> {
    let head_path = git_dir.join("HEAD");
    let head_raw = tokio::fs::read_to_string(&head_path).await.ok()?;
    let head = head_raw.trim();
    if let Some(rest) = head.strip_prefix("ref: ") {
        // ref: refs/heads/<branch>
        let branch = rest.rsplit('/').next().unwrap_or("HEAD").to_string();
        let ref_path = git_dir.join(rest);
        let sha = tokio::fs::read_to_string(&ref_path)
            .await
            .ok()
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "0".to_string());
        Some((branch, sha))
    } else {
        // detached HEAD; head IS the sha
        Some(("DETACHED".to_string(), head.to_string()))
    }
}
