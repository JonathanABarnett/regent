import React from "react";

interface State {
  err: unknown;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: unknown) {
    return { err };
  }

  componentDidCatch(err: unknown) {
    console.error("[ErrorBoundary]", err);
  }

  render() {
    if (this.state.err) {
      const e = this.state.err as Error;
      return (
        <div style={{
          color: "#fca5a5",
          background: "#0c0a09",
          padding: 24,
          fontFamily: "monospace",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          height: "100vh",
          overflow: "auto",
        }}>
          <h2 style={{ color: "#fbbf24" }}>KingdomOS crashed</h2>
          <strong>{e?.name}: {e?.message}</strong>
          <pre style={{ marginTop: 16 }}>{e?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
