import { render } from "solid-js/web";
import App from "@lingzhu/app/App";
import { ErrorBoundary } from "@lingzhu/app/components/shell/ErrorBoundary";
import "@lingzhu/ui/theme.css";

render(
  () => (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  ),
  document.getElementById("root") as HTMLElement,
);

// Development builds only: hold Control to name the component under the pointer
// and click to copy its name. A release build inlines this condition, so the
// inspector module is dropped from the bundle.
if (import.meta.env.MODE === "development") {
  void import("@lingzhu/devtools/inspector").then(({ mountInspector }) => {
    mountInspector();
  });
}
