import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * In-game canvas video capture for promotional material.
 *
 * Hits the Web Standard `HTMLCanvasElement.captureStream()` + `MediaRecorder`
 * APIs — no library, no native bridge, no ffmpeg. Records the live Pixi
 * canvas at 30 fps into VP9-encoded WebM (or VP8 / mp4 fallback depending
 * on what the browser supports) and triggers a download when stopped.
 *
 * WebM plays inline on Twitter, Bluesky, Discord, Mastodon, and the
 * itch.io page so this is THE go-to format for indie launch material.
 * Convert to GIF externally (CloudConvert, ffmpeg, ezgif.com) only when
 * you need a true static-loop GIF — which is increasingly rare.
 *
 * Hidden in streamer mode + while Photo Mode is open (those flows have
 * their own capture path). Hidden on init until the user opens any
 * panel — keeps the world view clean for ambient/screensaver use.
 */

const MIME_PREFERENCE = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4", // Safari may pick this; works for Twitter too
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function fileExtensionFor(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

function safeFilename(kingdomName: string | undefined, ext: string): string {
  const safe = (kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  return `${safe}-${ts}.${ext}`;
}

export function VideoCapture({ getCanvas }: { getCanvas: () => HTMLCanvasElement | null }) {
  const streamerMode = useGameStore((s) => s.settings.streamerMode);
  const identity = useGameStore((s) => s.identity);

  const [recording, setRecording] = useState(false);
  /** Elapsed time in seconds, refreshed every 500ms while recording. */
  const [elapsed, setElapsed] = useState(0);
  /** Error/status message shown briefly under the button. */
  const [status, setStatus] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Always stop on unmount so a dangling recorder doesn't keep the canvas pinned.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (tickerRef.current) clearInterval(tickerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Auto-clear the status message after 4s so it doesn't linger.
  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  function startRecording() {
    const canvas = getCanvas();
    if (!canvas) {
      setStatus("No canvas yet — try again in a moment.");
      return;
    }
    const mime = pickMimeType();
    if (!mime) {
      setStatus("Recording isn't supported in this browser.");
      return;
    }
    try {
      // 30fps is the indie launch-trailer sweet spot — small file, smooth
      // enough for sprite animation, doesn't overwhelm modest GPUs.
      const stream = canvas.captureStream(30);
      streamRef.current = stream;
      // Audio isn't mixed in — the procedural synth runs on a Web Audio
      // context that we'd need to bridge separately. Most game GIFs/clips
      // are watched muted on social anyway.
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        // ~6 Mbit/s — high enough for sharp pixel art, low enough for
        // a 30s clip to land around 20 MB before any compression.
        videoBitsPerSecond: 6_000_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = safeFilename(identity?.kingdomName, fileExtensionFor(mime));
          a.click();
          // Defer revoke so the browser has time to start the download.
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
          setStatus(`Saved ${a.download} (${sizeMb} MB)`);
        } catch (err) {
          console.warn("[VideoCapture] save failed", err);
          setStatus("Save failed — check console.");
        }
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      // 1s chunks let dataavailable fire periodically so chunks accumulate
      // even if the user crashes the tab mid-recording.
      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setElapsed(0);
      setRecording(true);
      tickerRef.current = setInterval(() => {
        setElapsed(Math.floor((performance.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.warn("[VideoCapture] start failed", err);
      setStatus("Couldn't start recording.");
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    try {
      recorderRef.current.stop();
    } catch (err) {
      console.warn("[VideoCapture] stop failed", err);
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setRecording(false);
  }

  if (streamerMode) return null;

  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="video-capture" data-no-sound>
      <button
        type="button"
        className={`video-capture-btn${recording ? " recording" : ""}`}
        onClick={recording ? stopRecording : startRecording}
        title={
          recording
            ? "Stop recording — saves as .webm (plays inline on Twitter/Discord/itch.io)"
            : "Start recording the kingdom — saves as .webm for sharing"
        }
        aria-label={recording ? "Stop recording" : "Start recording"}
      >
        {recording ? (
          <>
            <span className="video-capture-dot" aria-hidden="true" />
            <span className="video-capture-time">{mm}:{ss}</span>
            <span className="video-capture-label">Stop</span>
          </>
        ) : (
          <>
            <span className="video-capture-circle" aria-hidden="true" />
            <span className="video-capture-label">Rec</span>
          </>
        )}
      </button>
      {status && <div className="video-capture-status">{status}</div>}
    </div>
  );
}
