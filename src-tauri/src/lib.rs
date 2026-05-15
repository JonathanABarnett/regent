mod ambient;
mod events;
mod plugins;
mod state;
mod tray;
mod window;

use std::sync::Arc;
use tauri::{async_runtime, AppHandle, Manager, RunEvent, WindowEvent};

use crate::state::{AppState, IntegrationToggles};

#[tauri::command]
async fn set_integrations(
    integrations: IntegrationToggles,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    *state.integrations.write().await = integrations;
    Ok(())
}

#[tauri::command]
async fn set_watched_paths(
    paths: Vec<String>,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    *state.watched_paths.write().await = paths;
    Ok(())
}

#[tauri::command]
async fn toggle_overlay_mode(app: AppHandle) -> Result<(), String> {
    window::toggle_overlay(app).await
}

#[tauri::command]
async fn fullscreen_on_secondary(app: AppHandle) -> Result<(), String> {
    window::fullscreen_secondary(app).await
}

#[tauri::command]
async fn exit_special_modes(app: AppHandle) -> Result<(), String> {
    window::exit_special_modes(app).await
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn inbox_path(app: AppHandle) -> Result<String, String> {
    ambient::inbox::inbox_dir(&app)
        .map(|p| p.display().to_string())
        .ok_or_else(|| "no app data dir".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kingdomos=info,warn".into()),
        )
        .init();

    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            set_integrations,
            set_watched_paths,
            toggle_overlay_mode,
            fullscreen_on_secondary,
            exit_special_modes,
            quit_app,
            inbox_path,
        ])
        .setup({
            let state = app_state.clone();
            move |app| {
                let app_handle = app.app_handle().clone();
                if let Err(e) = tray::install(&app_handle) {
                    tracing::warn!("tray install failed: {e}");
                }

                async_runtime::spawn(ambient::system::run(app_handle.clone(), state.clone()));
                async_runtime::spawn(ambient::inbox::run(app_handle.clone(), state.clone()));
                async_runtime::spawn(ambient::fs_watcher::run(app_handle.clone(), state.clone()));
                async_runtime::spawn(ambient::git_watcher::run(app_handle.clone(), state.clone()));

                #[cfg(feature = "http-server")]
                async_runtime::spawn(plugins::http::serve(app_handle.clone(), state.clone(), 17820));

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // close → minimize to tray instead of exiting
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error building KingdomOS")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                tracing::info!("exit requested");
            }
        });
}
