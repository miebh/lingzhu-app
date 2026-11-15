import React from "react";
import ReactDOM from "react-dom/client";
import App from "@lingzhu/app/App";
import { ErrorBoundary } from "@lingzhu/app/components/ErrorBoundary";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import "@lingzhu/ui/theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Development builds only: hold Control to name the component under the pointer
// and click to copy its name. A release build inlines this condition, so the
// inspector module is dropped from the bundle.
if (import.meta.env.MODE === "development") {
  void import("@lingzhu/devtools/inspector").then(({ mountInspector }) => {
    mountInspector();
  });
}
