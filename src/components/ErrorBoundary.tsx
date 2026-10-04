/**
 * ErrorBoundary — isolates unexpected PDF/render failures from crashing the
 * whole app, with friendly recovery options.
 */
import { Component, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { discardSession } from "../storage/autosave";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(): void {
    // Intentionally quiet: the UI below is the user-facing report.
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-zinc-200 p-8 text-center">
            <CircleAlert className="w-10 h-10 text-red-500 mx-auto" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">Something went wrong.</h1>
            <p className="mt-2 text-sm text-zinc-600 break-words">{error.message}</p>
            <div className="mt-6 flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Reload page
              </button>
              <button
                type="button"
                onClick={() => {
                  void discardSession().finally(() => window.location.reload());
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
