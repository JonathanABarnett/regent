//! Tray icon + menu. The menu emits Tauri events that the frontend
//! TrayMenuBindings.ts listens to.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let overlay = MenuItem::with_id(app, "overlay", "Overlay mode", true, None::<&str>)?;
    let fullscreen = MenuItem::with_id(app, "fullscreen2", "Fullscreen on display 2", true, None::<&str>)?;
    let windowed = MenuItem::with_id(app, "windowed", "Windowed", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &hide, &sep, &overlay, &fullscreen, &windowed, &sep, &quit],
    )?;

    let _tray = TrayIconBuilder::with_id("kingdomos-tray")
        .tooltip("KingdomOS")
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
            // load from icons/icon.png as fallback (synchronous load via include_bytes! avoided to keep build flexible)
            tauri::image::Image::new(&[0u8; 4], 1, 1)
        }))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let cmd = match id {
                "show" => Some("show"),
                "hide" => Some("hide"),
                "overlay" => Some("toggle-overlay"),
                "fullscreen2" => Some("fullscreen-secondary"),
                "windowed" => Some("windowed"),
                "quit" => Some("quit"),
                _ => None,
            };
            if let Some(cmd) = cmd {
                let _ = app.emit("tray:command", cmd);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
