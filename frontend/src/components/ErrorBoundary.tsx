import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
  info?: ErrorInfo;
  copied?: boolean;
}

/**
 * Keeps a render failure from turning the whole window black. The fallback is
 * intentionally plain: it must not depend on the stores or components that may
 * have failed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error("Unhandled render error", error, info.componentStack);
  }

  private details() {
    const { error, info } = this.state;
    return [
      error ? `${error.name}: ${error.message}` : "Unknown error",
      error?.stack ?? "",
      info?.componentStack ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1500);
    } catch {
      // Clipboard access can be denied outside the Wails runtime.
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-6 overflow-auto bg-bg-base px-6 py-12 text-center text-text-base"
      >
        <div className="flex max-w-xl flex-col gap-2">
          <h1 className="text-row font-semibold">Something went wrong</h1>
          <p className="text-body text-text-muted">
            The window hit an unexpected error. Reloading usually fixes it.
          </p>
        </div>

        <pre className="max-h-64 w-full max-w-2xl overflow-auto rounded-lg border border-border-base bg-bg-layer-01 p-4 text-left font-mono text-caption leading-5 text-text-muted select-text">
          {this.details()}
        </pre>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void this.copy()}
            className="interactive inline-flex h-control-md items-center justify-center rounded-md border border-border-base px-3 text-body font-medium text-text-base"
          >
            {this.state.copied ? "Copied" : "Copy details"}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="interactive-inverse inline-flex h-control-md items-center justify-center rounded-md border border-transparent bg-bg-inverse px-3 text-body font-medium text-text-inverse"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
