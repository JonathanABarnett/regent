/**
 * Tray menu wiring: the Rust side fires Tauri events when the user picks a
 * menu item. We listen here and translate them into world / window actions.
 */
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export type TrayCommand =
  | "show"
  | "hide"
  | "toggle-overlay"
  | "fullscreen-secondary"
  | "windowed"
  | "quit";

export async function bindTrayMenu(): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  // Tauri may not be available in plain `vite dev` (browser preview).
  // The dynamic check keeps the React shell renderable in the browser.
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (!isTauri) return () => {};

  const unlistens: Array<Promise<() => void>> = [];

  unlistens.push(
    listen<TrayCommand>("tray:command", async (e) => {
      const cmd = e.payload;
      const w = getCurrentWindow();
      switch (cmd) {
        case "show":
          await w.show();
          await w.unminimize();
          await w.setFocus();
          break;
        case "hide":
          await w.hide();
          break;
        case "toggle-overlay":
          await invoke("toggle_overlay_mode");
          break;
        case "fullscreen-secondary":
          await invoke("fullscreen_on_secondary");
          break;
        case "windowed":
          await invoke("exit_special_modes");
          break;
        case "quit":
          await invoke("quit_app");
          break;
      }
    }),
  );

  // Wait for all listeners to attach so we can return a synchronous teardown.
  const offs = await Promise.all(unlistens);
  return () => {
    for (const off of offs) off();
  };
}
