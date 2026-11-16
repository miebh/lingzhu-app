# lingzhu-app

Desktop client for the [lingzhu](../lingzhu) agent, built with Wails v3, React 19, Tailwind CSS and
shadcn/ui.

The app does not import the core. It starts `lingzhu serve` as a sidecar process (or reuses one that is
already running) and talks to it over HTTP + SSE. Only a core the app started is stopped when the app quits.

## Requirements

- Go 1.26+
- Node 20+ and npm
- Wails v3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0`

## Run

```sh
# from this directory; builds the core into ../lingzhu/bin and the app into bin/
wails3 task build    # production binaries
wails3 task dev      # hot reload against the core in ../lingzhu/bin

wails3 task package  # per-user installer that ships both binaries
```

All artifacts are build output and stay out of the repository:

```text
lingzhu/bin/lingzhu.exe          core server
lingzhu-app/bin/lingzhu-app.exe  desktop client
.dev/                            development data, state and logs (`task dev`)
```

Runtime state lives in the user profile, never in the source tree:

```text
%APPDATA%/lingzhu/config.json       core configuration
%APPDATA%/lingzhu/app/app.db        app preferences and workspaces
%LOCALAPPDATA%/lingzhu/data         session databases, one lock per directory
%LOCALAPPDATA%/lingzhu/cache/log    core.log, rotated at 5MB
```

A release install puts both binaries in one directory, so the app finds the core beside itself
without any environment variable. At startup the app looks for the core next to itself, at
`LINGZHU_CORE`, and on `PATH`, and for a config at `LINGZHU_CONFIG`, then a project `lingzhu.json`
found by walking up from the working directory, then the user config file. A project config makes
its directory the agent working directory; the user config leaves it at the process directory.

## Environment

| Variable | Meaning |
|---|---|
| `LINGZHU_CORE` | Path to the core binary |
| `LINGZHU_HOME` | Redirect data, state, cache and tmp under one directory (development) |
| `LINGZHU_ADDR` | Core address, default `127.0.0.1:8787` |
| `LINGZHU_WORKDIR` | Agent working directory |
| `LINGZHU_DATA_DIR` | Session data directory |
| `LINGZHU_CONFIG` | Core config file |
| `LINGZHU_CONFIG_DIR` | Directory holding the user config file |

Core stdout and stderr go to `%LOCALAPPDATA%\lingzhu\cache\log\core.log` on Windows
(`~/Library/Caches` / `~/.cache` elsewhere).

## Layout

```text
main.go              Wails app, window, service registration
internal/service     Desktop core service: lifecycle, session API, event forwarding
internal/core        HTTP/SSE client and sidecar process management
internal/global      Per-user config, data, state, cache and log roots
internal/appdb       App SQLite database (preferences, workspaces)
internal/version     Version injected by -ldflags from ../lingzhu/VERSION
tools/syncversion    Stamps the version into packaging metadata
tools/msix           Packages the app and its core sidecar into one MSIX
frontend/packages/ui          primitives, icons, theme tokens and shared UI helpers
frontend/packages/session-ui  transcript, tool renderers, diff and shell/execute cards
frontend/packages/app         shell, stores, API bridge, composer, settings and dialogs
frontend/packages/devtools    development-only component inspector; never bundled in a release
frontend/apps/desktop         entry, Vite configs, parity harness and Wails bindings
frontend/apps/desktop/bindings  Generated from Go; not committed, run `wails3 generate bindings -d frontend/apps/desktop/bindings .`
```

## Notes

- The UI uses a dark desktop design language by default: near-black surfaces, hairline borders, an
  emerald accent, 13–14px type, one-line expandable tool rows and a permission dock above the composer.
- `packages/ui/src/theme.css` is the single token source: OKLCH primitive scales feed semantic roles
  (`bg-*`, `fg-*`, `border-*`, `state-*`, overlays, `elevation-*`), and components only consume those
  roles. The app ships two `data-color-scheme` blocks: dark, and a light scheme built from white, gray
  and emerald alone (near-white page, gray chrome and layer ladder, emerald accent for primary controls,
  links, focus and selection). Spacing stays on the 4px ladder, control heights are 24/28/32, reading
  width is measured in characters, focus is a 2px outline, hover/press are translucent overlays, and
  variants/states are driven by `data-*` attributes.
- The conversation uses an ordered session view: the transcript and composer share the
  `--container-session` width axis (744px); user turns are right-aligned bubbles capped at
  `min(82%, 64ch)`, assistant turns are borderless Markdown (14px / 160%), tool calls are 28px compact
  triggers that expand along a hairline rail, and copy/metadata chrome only appears on hover or focus.
- The composer uses an elevated editor: no border, `rounded-xl` with `elevation-raised` (0.5px light
  stroke, two soft dark shadows, a bottom inner highlight), a 13px / weight-440 draft surface, a 180px
  scrollport without a visible scrollbar, and one 44px control row (`+`, context readings, 28px square
  submit key that turns into Stop while a turn runs).
- Components come from shadcn/ui (radix-nova preset). `packages/ui/src/theme.css` maps shadcn's semantic
  tokens (`--background`, `--border`, `--primary`, `--muted-foreground`…) onto the same roles, so
  `npx shadcn@latest add <component>` inherits the same look. Add new primitives under
  `packages/ui/src` and import them from `@lingzhu/ui/*`.
- Transient outcomes surface as a top-center `Toast`; surface-bound failures stay in place. Rename,
  delete and workspace removal use `Dialog` instead of `window.prompt` / `window.confirm`.
- Frontend state lives in Zustand stores under `packages/app/src/store` (notify, preferences, catalog,
  view, workspaces, chat). Stores are module singletons, so the tree has no provider chain; components
  subscribe to the slices they use, and one store reads another through `getState()`.
- Chrome (sidebar, header, tool triggers, permission dock, dialogs) is not selectable; message bodies,
  tool output, permission resources and inputs stay selectable.
- `LINGZHU_DEBUG=1` starts WebView2 with the DevTools endpoint on port 9222, so any CDP client
  (screenshots, console, DOM) can inspect the running window.
- Permission prompts arrive as `permission.asked` events and are answered through the core API, so the UI
  never talks to the core directly.
- Closing a connection does not stop a turn; the Stop button calls the interrupt endpoint.
- Sessions are durable in the core, so a client restart loses nothing.
