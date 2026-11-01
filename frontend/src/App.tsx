import { AppShell } from "./app/AppShell";
import { CatalogProvider } from "./app/CatalogProvider";
import { ChatProvider } from "./app/ChatProvider";
import { NotifyProvider } from "./app/NotifyProvider";
import { PreferencesProvider } from "./app/PreferencesProvider";
import { ViewProvider } from "./app/ViewProvider";
import { WorkspaceProvider } from "./app/WorkspaceProvider";

/**
 * Providers only. Each owns one domain and registers what the next one needs;
 * the window itself is AppShell.
 */
export default function App() {
  return (
    <NotifyProvider>
      <PreferencesProvider>
        <CatalogProvider>
          <ViewProvider>
            <WorkspaceProvider>
              <ChatProvider>
                <AppShell />
              </ChatProvider>
            </WorkspaceProvider>
          </ViewProvider>
        </CatalogProvider>
      </PreferencesProvider>
    </NotifyProvider>
  );
}
