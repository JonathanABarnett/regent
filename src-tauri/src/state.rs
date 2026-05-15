use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IntegrationToggles {
    pub narrative: bool,
    pub system: bool,
    pub fs: bool,
    pub git: bool,
    pub inbox: bool,
    pub http: bool,
}

/// Shared state held by the Tauri runtime. Each ambient source reads the
/// toggles each iteration and skips work when disabled.
#[derive(Default)]
pub struct AppState {
    pub integrations: RwLock<IntegrationToggles>,
    pub watched_paths: RwLock<Vec<String>>,
    pub low_power: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            integrations: RwLock::new(IntegrationToggles {
                narrative: true,
                system: true,
                inbox: true,
                ..IntegrationToggles::default()
            }),
            watched_paths: RwLock::new(Vec::new()),
            low_power: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn is_low_power(&self) -> bool {
        self.low_power.load(Ordering::Relaxed)
    }
    pub fn set_low_power(&self, v: bool) {
        self.low_power.store(v, Ordering::Relaxed);
    }
}
