import { createSignal, Show } from "solid-js";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { t } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

interface Props {
  row: HomeSessionRowData;
  /** The session is already open in a tab, marked beside its avatar. */
  open: boolean;
  hideProjectName: boolean;
  onOpen: () => void;
  onRowContextMenu?: (row: HomeSessionRowData, x: number, y: number) => void;
}

/** One recent session in the home list. */
export function HomeSessionRow(props: Props) {
  const [hovered, setHovered] = createSignal(false);
  // Hover swaps the project name for the session's path, like the reference.
  const showingLocation = () => hovered();

  return (
    <div
      data-component="home-session-row-container"
      data-session-id={props.row.sessionID}
      data-project-name="true"
      class="group/session relative flex h-10 min-w-0 items-center rounded-[6px] outline-none focus:outline-none focus-visible:outline-none"
      onContextMenu={(event) => {
        if (!props.onRowContextMenu) return;
        event.preventDefault();
        props.onRowContextMenu(props.row, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        data-component="home-session-row"
        aria-haspopup="menu"
        onClick={() => props.onOpen()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        class="flex h-10 min-w-0 w-full flex-1 shrink-0 items-center gap-1.5 rounded-[6px] border-0 bg-transparent py-3 ps-1.5 pe-3 text-start text-text-muted font-[530] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-none md:ps-3"
      >
        <span class="relative flex shrink-0 items-center">
          <Show when={props.open}>
            <span
              aria-label={t("openInTab")}
              class="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-[2px] bg-bg-layer-04"
              style={{ right: "calc(100% + 4px)" }}
            />
          </Show>
          <ProjectAvatar name={props.row.workspaceName} icon={props.row.icon} color={props.row.color} />
        </span>
        <span data-slot="home-session-labels" class="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            data-component="home-session-title"
            dir="auto"
            class="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[530] tracking-[-0.04px] text-text-base"
          >
            {props.row.title}
          </span>
          <Show when={!props.hideProjectName}>
            <span
              data-component="home-session-project-name"
              dir="auto"
              aria-hidden={showingLocation() || undefined}
              class={`min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
                showingLocation() ? "max-w-0 opacity-0" : "max-w-[60%] opacity-100"
              }`}
            >
              {props.row.workspaceName}
            </span>
          </Show>
          <span
            data-slot="home-session-location"
            dir="ltr"
            aria-hidden={!showingLocation() || undefined}
            class={`flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
              showingLocation() ? "max-w-[60%] opacity-100" : "-ms-1.5 max-w-0 opacity-0"
            }`}
          >
            <span class="min-w-0 overflow-hidden text-ellipsis">{props.row.path}</span>
          </span>
        </span>
        <Show when={props.row.running}>
          <ActivityRing />
        </Show>
      </button>
    </div>
  );
}
