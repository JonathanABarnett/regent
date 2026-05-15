//! System monitor: samples CPU and network usage; emits "mining" / "airship"
//! events when thresholds are crossed. Cheap; runs on a 4-second interval.

use std::sync::Arc;
use std::time::Duration;
use sysinfo::{Networks, System};
use tauri::{AppHandle, Emitter};
use tokio::time;

use crate::events::KingdomEvent;
use crate::state::AppState;

const TICK_INTERVAL_SEC: u64 = 4;
const CPU_HIGH_THRESHOLD: f32 = 70.0;
const NET_BURST_THRESHOLD_KB: u64 = 1024 * 4;

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let mut sys = System::new();
    let mut nets = Networks::new_with_refreshed_list();
    let mut sustained_high = 0u32;
    let mut prev_total_in = total_bytes_in(&nets);
    loop {
        time::sleep(Duration::from_secs(TICK_INTERVAL_SEC)).await;
        let cfg = state.integrations.read().await.clone();
        if !cfg.system {
            continue;
        }
        sys.refresh_cpu_usage();
        let cpu = sys.global_cpu_usage();
        nets.refresh(true);
        let now_in = total_bytes_in(&nets);
        let delta = now_in.saturating_sub(prev_total_in);
        prev_total_in = now_in;

        if cpu > CPU_HIGH_THRESHOLD {
            sustained_high += 1;
            if sustained_high >= 2 {
                let _ = app.emit(
                    "kingdom:event",
                    KingdomEvent::new("mining", "system")
                        .intensity((cpu / 100.0).clamp(0.0, 1.0))
                        .duration(20_000)
                        .structure("deeprock")
                        .label(format!("cpu {:.0}%", cpu)),
                );
                sustained_high = 0;
            }
        } else {
            sustained_high = 0;
        }

        if delta > NET_BURST_THRESHOLD_KB * 1024 {
            let _ = app.emit(
                "kingdom:event",
                KingdomEvent::new("airship", "system")
                    .intensity(0.7)
                    .duration(25_000)
                    .label(format!("network burst {} KB", delta / 1024)),
            );
        }
    }
}

fn total_bytes_in(nets: &Networks) -> u64 {
    let mut total = 0u64;
    for (_, data) in nets.iter() {
        total = total.saturating_add(data.total_received());
    }
    total
}
