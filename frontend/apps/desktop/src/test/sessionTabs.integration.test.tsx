import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { SideTabs } from "@/components/shell/SideTabs";
import { planTabDelete, type SideTab, type StoredSessionTab } from "@/lib/sessionTabs";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type SessionInfo } from "@lingzhu/ui/types";

function Harness() {
  const durable: StoredSessionTab = { key: chatKey("/w", "s1"), path: "/w", sessionID: "s1" };
  const [tabs, setTabs] = createSignal<StoredSessionTab[]>([durable]);
  const [sessions, setSessions] = createSignal<SessionInfo[]>([{ id: "s1", title: "Only session", updated: "1" }]);
  const [chatState, setChatState] = createSignal<Record<string, { draft?: boolean }>>({ [durable.key]: { draft: false } });
  const [activeKey, setActiveKey] = createSignal<string | undefined>(durable.key);
  const [home, setHome] = createSignal(false);
  const [deleted, setDeleted] = createSignal<string[]>([]);

  const apply = (plan: ReturnType<typeof planTabDelete>) => {
    setTabs(plan.next);
    if (plan.removedActive) {
      setActiveKey(plan.target?.key);
      setHome(!plan.target);
    }
  };

  const sideTab = (entry: StoredSessionTab, label: string): SideTab => ({
    key: entry.key,
    label,
    subtitle: "lingzhu",
    kind: "chat",
    closable: true,
  });

  const deleteTab = (tab: SideTab) => {
    const entry = tabs().find((item) => item.key === tab.key);
    if (!entry) return;
    const plan = planTabDelete({
      tab,
      entry,
      tabs: tabs(),
      activeKey: activeKey(),
      sessions: sessions(),
      chats: chatState(),
    });
    if (plan.draft) {
      apply(plan);
      return;
    }
    setDeleted((items) => [...items, plan.session.id]);
    setSessions((items) => items.filter((item) => item.id !== plan.session.id));
    apply(plan);
  };

  const createDraft = () => {
    const entry: StoredSessionTab = { key: chatKey("/w", "draft-1"), path: "/w", sessionID: "draft-1" };
    setTabs((items) => [...items, entry]);
    setChatState((items) => ({ ...items, [entry.key]: { draft: true } }));
    setActiveKey(entry.key);
    setHome(false);
  };

  return (
    <div>
      <SideTabs
        tabs={tabs().map((entry) =>
          sideTab(entry, entry.sessionID === "s1" ? "Only session" : "New session"),
        )}
        activeKey={activeKey()}
        homeActive={home()}
        onHome={() => setHome(true)}
        onSelect={(tab) => {
          setActiveKey(tab.key);
          setHome(false);
        }}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
        onDeleteTab={deleteTab}
      />
      <button type="button" onClick={createDraft}>
        Create draft
      </button>
      <output data-testid="view">{home() ? "home" : "chat"}</output>
      <output data-testid="deleted">{deleted().join(",")}</output>
    </div>
  );
}

describe("delete the only session, create a new one, delete it", () => {
  test("the rail empties and Home takes over both times", async () => {
    const user = userEvent.setup();
    render(() => <Harness />);

    const homeButton = screen.getByRole("button", { name: "Home" });
    expect(homeButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("tab", { name: /Only session/ })).toBeTruthy();

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Only session/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete session…" }));

    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("view").textContent).toBe("home");
    expect(screen.getByTestId("deleted").textContent).toBe("s1");

    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(screen.getByRole("tab", { name: /New session/ })).toBeTruthy();
    expect(homeButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("view").textContent).toBe("chat");

    fireEvent.contextMenu(screen.getByRole("tab", { name: /New session/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete session…" }));

    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("view").textContent).toBe("home");
    // A draft never reaches the core, so only the durable session was deleted.
    expect(screen.getByTestId("deleted").textContent).toBe("s1");
  });
});
