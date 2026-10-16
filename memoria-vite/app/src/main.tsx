import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/query-client";
import "./styles.css";
import "@xyflow/react/dist/style.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error">
          <strong>Memoria hit a rendering error.</strong>
          <span>{this.state.error.message}</span>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
