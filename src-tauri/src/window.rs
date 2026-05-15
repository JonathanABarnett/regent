//! Window-mode commands: overlay (transparent + click-through), secondary
//! fullscreen, exit-special-modes. Called from the frontend via `invoke`.

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime};

pub async fn toggle_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    let currently_overlay = window
        .is_decorated()
        .map(|b| !b)
        .unwrap_or(false);
    if currently_overlay {
        // restore
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_always_on_top(false).map_err(|e| e.to_string())?;
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
    } else {
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window
            .set_ignore_cursor_events(true)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn fullscreen_secondary<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().map_err(|e| e.to_string())?;
    let secondary = monitors
        .into_iter()
        .find(|m| match (&primary, m) {
            (Some(p), m) => p.position() != m.position() || p.size() != m.size(),
            _ => true,
        });

    let target = match secondary {
        Some(m) => m,
        None => {
            // only one display — fullscreen on it
            window.set_fullscreen(true).map_err(|e| e.to_string())?;
            return Ok(());
        }
    };
    let pos = target.position();
    let size = target.size();
    window
        .set_position(PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn exit_special_modes<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| e.to_string())?;
    Ok(())
}
