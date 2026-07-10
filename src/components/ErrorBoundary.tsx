import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled UI error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-surface-dark px-4 text-center">
          <div className="rounded-full bg-red-50 dark:bg-red-900/30 p-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h1>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            An unexpected error occurred. You can try going back to the dashboard — your data is safe.
          </p>
          <button onClick={this.handleReset} className="btn-primary mt-5">
            Back to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
