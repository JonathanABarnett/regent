import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { installCrashHandlers } from "./lib/crashLog";
import "./styles.css";

// Install global crash handlers *before* React mounts so we catch the
// "blank screen on first render" case too.
installCrashHandlers();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
