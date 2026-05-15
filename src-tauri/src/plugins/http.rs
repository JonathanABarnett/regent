//! Optional local HTTP receiver. Only loaded when the `http-server` feature
//! is enabled at build time. Listens on 127.0.0.1 only.
//!
//! POST /events with a KingdomEvent JSON body → broadcast on the kingdom event
//! channel.

use std::sync::Arc;
use axum::{routing::post, Json, Router};
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;

use crate::events::KingdomEvent;
use crate::state::AppState;

pub async fn serve(app: AppHandle, _state: Arc<AppState>, port: u16) {
    let app_router = Router::new().route(
        "/events",
        post({
            let app = app.clone();
            move |Json(payload): Json<KingdomEvent>| {
                let app = app.clone();
                async move {
                    let _ = app.emit("kingdom:event", &payload);
                    Json(serde_json::json!({"ok": true}))
                }
            }
        }),
    );
    let addr = format!("127.0.0.1:{port}");
    match TcpListener::bind(&addr).await {
        Ok(listener) => {
            tracing::info!("http: listening on {addr}");
            if let Err(e) = axum::serve(listener, app_router).await {
                tracing::warn!("http: serve error: {e}");
            }
        }
        Err(e) => tracing::warn!("http: bind {addr} failed: {e}"),
    }
}
