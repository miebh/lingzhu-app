import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { ArrowUp, Bot, Sparkles, Square, Terminal, Undo2, XMarkFilled } from "@lingzhu/ui/icons";
import { Loader } from "@lingzhu/ui/loader";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { AgentPicker } from "./AgentPicker";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { ModelPicker } from "./ModelPicker";
import { VariantPicker } from "./VariantPicker";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { update, createReducer } from "@lingzhu/ui/solid";
import { api } from "../../lib/api";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  attachmentContextLabel,
  attachmentMimeForFile,
  attachmentName,
  encodeTextBase64,
  isSupportedAttachmentMime,
  readFileBase64,
} from "@lingzhu/ui/attachments";
import { findContextToken, replaceContextToken } from "../../lib/composerContext";
import { messageOf } from "../../lib/errors";
import {
  composerActiveIndex,
  composerSubmitMode,
  matchesComposerCommand,
  moveComposerSelection,
  slashQuery,
} from "../../lib/composer";
import { formatKeybind } from "../../lib/slash";
import { modelVariantID, orderedVariants, splitModelID } from "../../lib/models";
import { t, useT } from "@lingzhu/ui/i18n";
import { usePreferences } from "../../app/useApp";
import { createComposerState, transitionComposer } from "../../app/features/chat/composer-machine";
import type {
  AgentProfile,
  PickedAttachment,
  PromptAttachment,
  PromptReference,
  ProviderSettings,
  SkillSummary,
  SlashCommand,
} from "@lingzhu/ui/types";

/** Matches the core prompt attachment limit. */
const MAX_ATTACHMENTS = MAX_ATTACHMENT_COUNT;

type ContextEntry =
  | { kind: "agent"; agent: AgentProfile }
  | { kind: "skill"; skill: SkillSummary }
  | { kind: "file"; path: string };

interface Props {
  running: boolean;
  disabled: boolean;
  providers: ProviderSettings[];
  provider: string;
  model: string;
  commands: SlashCommand[];
  agents?: AgentProfile[];
  agent?: string;
  /** The new-session surface lets the prompt outgrow the 744px transcript column. */
  width?: "session" | "full";
  /** The session dock drops the raised shadow and uses layer-01 in dark mode. */
  borderUnderlay?: boolean;
  /** Appended by the transcript Quote action. */
  quote?: { text: string; nonce: number };
  /** Clears the quote after it lands so a remount cannot insert it twice. */
  onQuoteConsumed?: () => void;
  /** Replaces the draft, used when Undo returns a sent prompt for editing. */
  restore?: { text: string; nonce: number };
  /** Previous sent prompts, newest first, recalled with the arrow keys. */
  history?: string[];
  /** Previous shell commands, newest first, recalled in shell mode. */
  shellHistory?: string[];
  /** Workspace used to search files after an `@` mention. */
  workspace?: string;
  onSelectAgent?: (agentID: string) => void;
  onSelectModel: (providerID: string, modelID: string) => void;
  onManageModels: () => void;
  onAddProvider: () => void;
  onSend: (text: string, delivery: 'steer' | 'queue', attachments: PromptAttachment[], references?: PromptReference[]) => void;
  onStop: () => void;
  /** Opens the shell surface when `!` mode is unavailable. */
  onShell?: () => void;
  /** Runs `!` shell mode in the active session; undefined hides that mode. */
  onRunShell?: (command: string) => void;
}

/**
 * The session composer: an elevated card with a compact add menu, a 13px draft
 * surface that grows to a 180px scrollport, horizontal attachment cards, and a
 * 44px control row holding agent/model chips, delivery and submit.
 */
export function Composer(props: Props) {
  const tr = useT();
  const preferences = usePreferences();
  const currentModel = createMemo(() => splitModelID(props.model));
  const selectedModel = createMemo(() =>
    props.providers.find((item) => item.id === props.provider)?.models.find(
      (item) => item.id === currentModel().model,
    ),
  );
  const modelVariants = createMemo(() => orderedVariants(selectedModel()?.variants));
  const [composer, dispatch] = createReducer(transitionComposer, () =>
    createComposerState(preferences().followUpBehavior),
  );
  const shellMode = createMemo(() => composer().mode === "shell");
  const sending = createMemo(() => composer().submitting);
  const delivery = createMemo(() => composer().delivery);
  const attaching = createMemo(() => composer().attachment.busy);
  const attachmentError = createMemo(() => composer().attachment.error);
  const setShellMode = (value: boolean) =>
    dispatch({ type: "mode.set", mode: value ? "shell" : "prompt" });
  const setSending = (value: boolean) => dispatch({ type: value ? "submit.start" : "submit.settle" });
  const setDelivery = (value: "steer" | "queue") => dispatch({ type: "delivery.set", delivery: value });
  const setAttaching = (value: boolean) =>
    dispatch({ type: value ? "attachment.start" : "attachment.finish" });
  const setAttachmentError = (message: string) => dispatch({ type: "attachment.error", message });
  const [text, setText] = createSignal("");
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  const historyDraft = { current: "" };
  const [shellHistoryIndex, setShellHistoryIndex] = createSignal(-1);
  const shellHistoryDraft = { current: "" };
  createEffect(on(() => preferences().followUpBehavior, (value) => setDelivery(value)));
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [attachments, setAttachments] = createSignal<PickedAttachment[]>([]);
  const [dragging, setDragging] = createSignal(false);
  const [contextFiles, setContextFiles] = createSignal<string[]>([]);
  const [skills, setSkills] = createSignal<SkillSummary[]>([]);
  const [contextActive, setContextActive] = createSignal(0);
  const [contextDismissed, setContextDismissed] = createSignal(false);
  let area: HTMLTextAreaElement | undefined;
  let controls: HTMLDivElement | undefined;
  const [controlsOverflow, setControlsOverflow] = createSignal({ start: false, end: false });

  const updateControlsOverflow = () => {
    const element = controls;
    if (!element) return;
    const start = element.scrollLeft > 0;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    update(setControlsOverflow, controlsOverflow, (current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  };

  // Fade a control edge only while controls sit past it, as the reference strip does.
  onMount(() => {
    const element = controls;
    if (!element) return;
    updateControlsOverflow();
    const observer = new ResizeObserver(updateControlsOverflow);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    onCleanup(() => observer.disconnect());
  });

  // The draft surface grows with its content; the card's scrollport caps it.
  createEffect(() => {
    text();
    const element = area;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  });

  // The transcript Quote action appends a blockquote to the current draft.
  createEffect(
    on(() => props.quote?.nonce, () => {
      const quote = props.quote;
      if (!quote) return;
      // Consume immediately so switching tabs and remounting the composer does
      // not insert the same quote a second time.
      props.onQuoteConsumed?.();
      const source = quote.text.replace(/\s+$/, "");
      if (!source.trim()) return;
      const block = source
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      update(setText, text, (current) => (current.trim() ? `${current}\n\n${block}\n` : `${block}\n`));
      setHistoryIndex(-1);
      historyDraft.current = "";
      setDismissed(false);
      area?.focus();
    }),
  );

  // Undo puts the reverted prompt back so it can be edited and sent again.
  createEffect(
    on(() => props.restore?.nonce, () => {
      const restore = props.restore;
      if (!restore) return;
      setText(restore.text);
      setHistoryIndex(-1);
      historyDraft.current = "";
      setDismissed(false);
      area?.focus();
    }),
  );

  const query = createMemo(() => (shellMode() ? null : slashQuery(text())));
  const filtered = createMemo(() => {
    const term = query();
    if (term === null) return menuOpen() ? props.commands : [];
    return props.commands.filter((command) => matchesComposerCommand(command, term));
  });
  const open = createMemo(
    () => !props.disabled && !shellMode() && !dismissed() && (query() !== null || menuOpen()),
  );
  const activeIndex = createMemo(() => composerActiveIndex(active(), filtered().length));
  const contextToken = createMemo(() => (shellMode() ? undefined : findContextToken(text())));
  const contextQuery = createMemo(() => contextToken()?.query ?? "");
  const contextOpen = createMemo(
    () => !!props.workspace && !!contextToken() && !contextDismissed() && !open(),
  );
  const contextEntries = createMemo<ContextEntry[]>(() => {
    if (!contextOpen()) return [];
    const needle = contextQuery().trim().toLowerCase();
    const agentHits = (props.agents ?? [])
      .filter(
        (agent) =>
          !needle ||
          agent.id.toLowerCase().includes(needle) ||
          agent.name.toLowerCase().includes(needle) ||
          agent.description?.toLowerCase().includes(needle),
      )
      .slice(0, 4)
      .map((agent) => ({ kind: "agent" as const, agent }));
    const skillHits = skills()
      .filter(
        (skill) =>
          !needle ||
          skill.id.toLowerCase().includes(needle) ||
          skill.name.toLowerCase().includes(needle) ||
          (skill.description ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 6)
      .map((skill) => ({ kind: "skill" as const, skill }));
    return [
      ...agentHits,
      ...skillHits,
      ...contextFiles().map((path) => ({ kind: "file" as const, path })),
    ];
  });

  createEffect(
    on([text, menuOpen], () => {
      setActive(0);
    }),
  );

  createEffect(
    on([contextQuery, contextOpen], () => {
      setContextActive(0);
    }),
  );

  createEffect(
    on(
      () => props.workspace,
      (workspace) => {
        if (!workspace) {
          setSkills([]);
          return;
        }
        let cancelled = false;
        void api
          .skills(workspace)
          .then((items) => {
            if (!cancelled) setSkills(items ?? []);
          })
          .catch(() => {
            if (!cancelled) setSkills([]);
          });
        onCleanup(() => {
          cancelled = true;
        });
      },
    ),
  );

  createEffect(
    on([contextOpen, contextQuery, () => props.workspace], () => {
      const workspace = props.workspace;
      if (!contextOpen() || !workspace) {
        setContextFiles([]);
        return;
      }
      let cancelled = false;
      const timer = window.setTimeout(() => {
        api
          .searchFiles(workspace, contextQuery(), 12)
          .then((result) => {
            if (cancelled) return;
            setContextFiles(result.files.map((file) => file.path));
            setContextActive(0);
          })
          .catch(() => {
            if (!cancelled) setContextFiles([]);
          });
      }, 150);
      onCleanup(() => {
        cancelled = true;
        window.clearTimeout(timer);
      });
    }),
  );

  const empty = createMemo(() => text().trim() === "");
  // While a run is active, an empty composer keeps the stop action; typing
  // turns the same control into a send action that queues the text.
  const attachmentsBlocked = createMemo(() => props.running && attachments().length > 0);
  const submitMode = createMemo(() =>
    composerSubmitMode({
      running: props.running,
      empty: empty(),
      sending: sending(),
      attaching: attaching(),
      attachmentsBlocked: attachmentsBlocked(),
      disabled: props.disabled,
    }),
  );
  const stopping = createMemo(() => submitMode() === "stop");
  const canSubmit = createMemo(() => submitMode() === "send");

  const changeText = (value: string) => {
    // A leading `!` switches to shell mode and is not part of the command.
    if (!shellMode() && props.onRunShell && value.startsWith("!")) {
      setShellMode(true);
      setAttachments([]);
      setAttachmentError("");
      value = value.slice(1);
      // The signal may already hold the empty string, so Solid would skip the
      // DOM write; clear the textarea explicitly so the "!" never lingers.
      if (area && area.value !== value) area.value = value;
    }
    setText(value);
    setHistoryIndex(-1);
    historyDraft.current = "";
    setShellHistoryIndex(-1);
    shellHistoryDraft.current = "";
    setDismissed(false);
    setContextDismissed(false);
    if (!value.startsWith("/")) setMenuOpen(false);
  };

  const enterShell = () => {
    setShellMode(true);
    setAttachments([]);
    setAttachmentError("");
    setMenuOpen(false);
    setDismissed(false);
    setShellHistoryIndex(-1);
    shellHistoryDraft.current = "";
    queueMicrotask(() => area?.focus());
  };

  const addPicked = (picked: PickedAttachment): boolean => {
    if (!picked?.path) return false;
    if (attachments().length >= MAX_ATTACHMENTS) {
      setAttachmentError(`At most ${MAX_ATTACHMENTS} attachments are allowed.`);
      return false;
    }
    if (!isSupportedAttachmentMime(picked.mime)) {
      setAttachmentError(`Unsupported attachment type: ${picked.mime || picked.name}`);
      return false;
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(`An attachment is larger than ${MAX_ATTACHMENT_BYTES >> 20} MB.`);
      return false;
    }
    const total = attachments().reduce((sum, item) => sum + item.size, 0);
    if (total + picked.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(`Attachments are larger than ${MAX_ATTACHMENT_BYTES >> 20} MB in total.`);
      return false;
    }
    if (attachments().some((item) => item.path === picked.path)) return false;
    update(setAttachments, attachments, (current) => [...current, picked]);
    return true;
  };

  const chooseContextEntry = async (entry: ContextEntry) => {
    if (entry.kind === "agent") {
      const token = contextToken();
      if (!token) return;
      props.onSelectAgent?.(entry.agent.id);
      setText(replaceContextToken(text(), token, entry.agent.id));
      setContextDismissed(true);
      queueMicrotask(() => area?.focus());
      return;
    }
    if (entry.kind === "skill") {
      const token = contextToken();
      if (!token) return;
      setText(replaceContextToken(text(), token, entry.skill.id));
      setContextDismissed(true);
      queueMicrotask(() => area?.focus());
      return;
    }
    await chooseContext(entry.path);
  };

  const chooseContext = async (path: string) => {
    const workspace = props.workspace;
    const token = contextToken();
    if (!workspace || !token) return;
    try {
      const file = await api.fileContent(workspace, path);
      if (file.binary) {
        setAttachmentError("Only text files can be attached.");
        return;
      }
      const mime = attachmentMimeForFile(path, "") || "text/plain";
      const picked: PickedAttachment = {
        path,
        name: path,
        mime,
        size: file.size,
        data: encodeTextBase64(file.content),
      };
      if (!addPicked(picked)) return;
      setText(replaceContextToken(text(), token, path));
      setContextDismissed(true);
      setAttachmentError("");
      queueMicrotask(() => area?.focus());
    } catch (error) {
      setAttachmentError(messageOf(error));
    }
  };

  const attach = async () => {
    if (props.disabled || attaching()) return;
    setAttaching(true);
    setAttachmentError("");
    try {
      const picked = await api.pickAttachmentFile("Attach image, PDF or text file");
      if (picked?.path) addPicked(picked);
    } catch (error) {
      setAttachmentError(messageOf(error));
    } finally {
      setAttaching(false);
    }
  };

  // Dropped and pasted files have no native path, so their content is read in
  // the webview and sent as base64 alongside picker selections.
  const addFiles = async (files: File[]) => {
    if (props.disabled || attaching() || files.length === 0) return;
    setAttaching(true);
    setAttachmentError("");
    const next = [...attachments()];
    let total = next.reduce((sum, item) => sum + item.size, 0);
    try {
      for (const file of files) {
        if (next.length >= MAX_ATTACHMENTS) {
          setAttachmentError(`At most ${MAX_ATTACHMENTS} attachments are allowed.`);
          break;
        }
        const mime = attachmentMimeForFile(file.name, file.type);
        if (!mime) {
          setAttachmentError(`Unsupported attachment type: ${file.name}`);
          continue;
        }
        if (file.size === 0) {
          setAttachmentError(`Attachment is empty: ${file.name}`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachmentError(`An attachment is larger than ${MAX_ATTACHMENT_BYTES >> 20} MB.`);
          continue;
        }
        if (total + file.size > MAX_ATTACHMENT_BYTES) {
          setAttachmentError(`Attachments are larger than ${MAX_ATTACHMENT_BYTES >> 20} MB in total.`);
          break;
        }
        const key = `file:${file.name}:${file.size}:${file.lastModified}`;
        if (next.some((item) => item.path === key)) continue;
        const data = await readFileBase64(file);
        next.push({ path: key, name: file.name, mime, size: file.size, data });
        total += file.size;
      }
    } catch (error) {
      setAttachmentError(messageOf(error));
    } finally {
      setAttachments(next);
      setAttaching(false);
    }
  };

  const dragHasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const pickCommand = (command: SlashCommand) => {
    setMenuOpen(false);
    if (command.run) {
      // Selecting a command consumes its slash token, so the composer is empty
      // when the command opens its own surface.
      setText("");
      command.run();
      area?.focus();
      return;
    }
    // Text typed before opening the menu becomes the command's arguments.
    const args = text().startsWith("/") ? "" : text().trim();
    setText(`/${command.name}${args ? ` ${args}` : " "}`);
    area?.focus();
  };

  const move = (delta: number) => {
    if (filtered().length === 0) return;
    setActive(moveComposerSelection(activeIndex(), delta, filtered().length));
  };

  const submit = (alternate = false) => {
    if (!canSubmit()) {
      if (attachmentsBlocked()) setAttachmentError("Wait for the current turn before attaching files.");
      return;
    }
    const target = alternate ? (delivery() === "steer" ? "queue" : "steer") : delivery();
    const value = text().trim();
    if (shellMode() && props.onRunShell) {
      setSending(true);
      setText("");
      setShellMode(false);
      setHistoryIndex(-1);
      historyDraft.current = "";
      setShellHistoryIndex(-1);
      shellHistoryDraft.current = "";
      setMenuOpen(false);
      props.onRunShell(value);
      setTimeout(() => setSending(false), 0);
      return;
    }
    const outgoing: PromptAttachment[] = attachments().map((attachment) => ({
      mime: attachment.mime,
      name: attachment.name,
      data: attachment.data,
    }));
    const references: PromptReference[] = attachments().flatMap((attachment) =>
      attachment.path
        ? [{ name: attachment.name, mime: attachment.mime, path: attachment.path }]
        : [],
    );
    setSending(true);
    setText("");
    setHistoryIndex(-1);
    historyDraft.current = "";
    setMenuOpen(false);
    setAttachments([]);
    setAttachmentError("");
    props.onSend(value, target, outgoing, references);
    // The bindings resolve after the host accepts the prompt; release the gate
    // on the next tick so a fast host does not flash the spinner.
    setTimeout(() => setSending(false), 0);
  };

  // Arrows recall entries from one history list; prompt and shell histories keep
  // independent cursors, so each composer mode steps only its own entries.
  const recallHistory = (
    event: KeyboardEvent,
    entries: string[],
    index: number,
    setIndex: (value: number) => void,
    draft: { current: string },
  ) => {
    if (entries.length === 0) return false;
    const element = area;
    const position = element?.selectionStart ?? 0;
    const browsing = index >= 0;
    // Like the reference: the first Up only starts from an empty draft, while
    // a recalled entry may be stepped from either edge of its text.
    const atEdge = position === 0 || position === text().length;
    const canUp = browsing ? atEdge : text().length === 0 && position === 0;
    if (event.key === "ArrowUp" && canUp && index < entries.length - 1) {
      event.preventDefault();
      if (!browsing) draft.current = text();
      const next = index + 1;
      setIndex(next);
      setText(entries[next]);
      setDismissed(false);
      queueMicrotask(() => element?.setSelectionRange(0, 0));
      return true;
    }
    if (event.key === "ArrowDown" && browsing && atEdge) {
      event.preventDefault();
      const next = index - 1;
      const value = next < 0 ? draft.current : entries[next];
      setIndex(next);
      setText(value);
      queueMicrotask(() => element?.setSelectionRange(value.length, value.length));
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      void attach();
      return;
    }
    if (shellMode() && event.key === "Escape" && !open() && !contextOpen()) {
      event.preventDefault();
      setShellMode(false);
      setShellHistoryIndex(-1);
      shellHistoryDraft.current = "";
      setText("");
      return;
    }
    if (open() && !event.isComposing) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        setMenuOpen(false);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickCommand(filtered()[activeIndex()]);
        return;
      }
    }
    if (contextOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextDismissed(true);
        return;
      }
      const entries = contextEntries();
      if (entries.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setContextActive((contextActive() + 1) % entries.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setContextActive((contextActive() - 1 + entries.length) % entries.length);
          return;
        }
        if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          void chooseContextEntry(entries[contextActive()] ?? entries[0]);
          return;
        }
      }
    }
    if (!open() && !event.isComposing && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (shellMode()) {
        if (
          recallHistory(
            event,
            props.shellHistory ?? [],
            shellHistoryIndex(),
            setShellHistoryIndex,
            shellHistoryDraft,
          )
        ) {
          return;
        }
      } else if (
        props.history &&
        recallHistory(event, props.history, historyIndex(), setHistoryIndex, historyDraft)
      ) {
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit(event.ctrlKey || event.metaKey);
    }
  };

  return (
    <div class="w-full shrink-0 bg-bg-base pb-3">
      <div class={`mx-auto w-full px-3 ${props.width === "full" ? "" : "md:max-w-session"}`}>
        <div class="relative z-10 flex flex-col">
          <Show when={contextOpen()}>
            <div role="listbox" aria-label={tr("files")} class="command-suggestion-list">
              <Show
                when={contextEntries().length > 0}
                fallback={<div class="command-suggestion-empty">{tr("noMatchingFiles")}</div>}
              >
                <For each={contextEntries()}>
                  {(entry, index) => {
                    const agent = () => (entry.kind === "agent" ? entry.agent : undefined);
                    const skill = () => (entry.kind === "skill" ? entry.skill : undefined);
                    const filePath = () => (entry.kind === "file" ? entry.path : undefined);
                    return (
                      <div
                        role="option"
                        aria-selected={index() === contextActive()}
                        data-active={index() === contextActive() ? "" : undefined}
                        class="command-suggestion-row"
                        onMouseEnter={() => setContextActive(index())}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          void chooseContextEntry(entry);
                        }}
                      >
                        <Show
                          when={agent()}
                          fallback={
                            <Show
                              when={skill()}
                              fallback={
                                <FileTypeIcon path={filePath() ?? ""} type="file" class="size-4 shrink-0" />
                              }
                            >
                              <Sparkles class="size-4 shrink-0 text-text-faint" />
                            </Show>
                          }
                        >
                          <Bot class="size-4 shrink-0 text-text-faint" />
                        </Show>
                        <span class="command-suggestion-label">
                          {agent() ? `@${agent()!.id}` : skill() ? `@${skill()!.id}` : filePath()}
                        </span>
                        <Show when={agent()}>
                          <span class="command-suggestion-description">{agent()!.description}</span>
                        </Show>
                        <Show when={skill()}>
                          <span class="command-suggestion-description">
                            {skill()!.description || skill()!.name}
                          </span>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </Show>
          <Show when={open()}>
            <div
              id="slash-command-list"
              role="listbox"
              aria-label={tr("paletteGroupCommands")}
              class="command-suggestion-list"
            >
              <Show
                when={filtered().length > 0}
                fallback={<div class="command-suggestion-empty">{tr("noMatchingCommands")}</div>}
              >
                <For each={filtered()}>
                  {(command, index) => (
                    <div
                      id={`slash-command-option-${index()}`}
                      role="option"
                      aria-selected={index() === activeIndex()}
                      data-active={index() === activeIndex() ? "" : undefined}
                      class="command-suggestion-row"
                      onMouseEnter={() => setActive(index())}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickCommand(command);
                      }}
                    >
                      <span class="command-suggestion-label">/{command.name}</span>
                      <span class="command-suggestion-description">{command.description}</span>
                      <Show when={formatKeybind(command.keybind)}>
                        <span class="command-suggestion-keybind">{formatKeybind(command.keybind)}</span>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            onDragEnter={(event) => {
              if (!dragHasFiles(event)) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              if (!dragHasFiles(event)) return;
              event.preventDefault();
              event.dataTransfer!.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(Array.from(event.dataTransfer!.files));
            }}
            class={`group/composer relative w-full overflow-clip rounded-xl bg-bg-composer-surface ${
              props.borderUnderlay
                ? "shadow-[0_0_0_0.5px_var(--border-base)] dark:bg-bg-layer-01 dark:shadow-none"
                : "shadow-elevation-raised"
            }`}
          >
            <Show when={dragging()}>
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-0 z-30 rounded-xl opacity-100 backdrop-blur-[1.5px]"
                style={{
                  "mask-image":
                    "linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                  "mask-composite": "intersect",
                  "-webkit-mask-image":
                    "linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                  "-webkit-mask-composite": "source-in",
                }}
              />
              <div class="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--fg-base)_8%,transparent)]">
                <div class="absolute inset-0 bg-bg-base/25" />
                <div
                  aria-hidden="true"
                  class="absolute inset-y-0 left-1/2 w-full -translate-x-1/2 md:max-w-session"
                  style={{
                    "mask-image":
                      "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
                    "-webkit-mask-image":
                      "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
                  }}
                >
                  <div
                    class="absolute inset-0 opacity-60"
                    style={{
                      background:
                        "repeating-linear-gradient(135deg, transparent 0px, transparent 12px, color-mix(in srgb, var(--fg-base) 4%, transparent) 12px, color-mix(in srgb, var(--fg-base) 4%, transparent) 24px)",
                      "mask-image":
                        "radial-gradient(ellipse 59% 40% at center, black 0%, rgba(0,0,0,0.72) 58%, transparent 100%)",
                      "-webkit-mask-image":
                        "radial-gradient(ellipse 59% 40% at center, black 0%, rgba(0,0,0,0.72) 58%, transparent 100%)",
                    }}
                  />
                </div>
                <div class="relative flex flex-col items-center gap-5">
                  <div class="flex size-10 items-center justify-center rounded-full bg-bg-base text-text-faint shadow-elevation-floating">
                    <ArrowUp class="size-4" />
                  </div>
                  <div class="text-[15px] leading-6 font-[530] text-text-base">{t("dropFiles")}</div>
                </div>
              </div>
            </Show>
            <div class="relative">
              <Show when={shellMode()}>
                <div class="flex items-center gap-1.5 ps-4 pe-[var(--composer-scroll-end)] pt-2 text-caption text-text-faint">
                  <Terminal class="size-3.5 shrink-0" />
                  <span class="font-[530] text-text-muted">{tr("shellMode")}</span>
                  <button
                    type="button"
                    aria-label={tr("exitShellMode")}
                    onClick={() => {
                      setShellMode(false);
                      area?.focus();
                    }}
                    class="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <XMarkFilled class="size-3" />
                  </button>
                </div>
              </Show>
              <div class="composer-scroll max-h-[180px] overflow-y-auto no-scrollbar">
                <textarea
                  ref={(el) => (area = el)}
                  value={text()}
                  rows={1}
                  disabled={props.disabled}
                  spellcheck={preferences().spellcheck}
                  aria-label={tr("promptLabel")}
                  aria-autocomplete="list"
                  aria-expanded={open()}
                  aria-controls={open() ? "slash-command-list" : undefined}
                  aria-activedescendant={open() ? `slash-command-option-${activeIndex()}` : undefined}
                  placeholder={
                    shellMode()
                      ? t("shellCommandPlaceholder")
                      : props.running
                        ? t("placeholderFollowUp")
                        : t("placeholder")
                  }
                  onInput={(event) => changeText(event.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData?.files ?? []);
                    if (files.length === 0) return;
                    event.preventDefault();
                    void addFiles(files);
                  }}
                  class={`block w-full resize-none overflow-hidden bg-transparent ps-4 pe-[var(--composer-scroll-end)] pt-4 pb-2 text-[13px] font-[440] leading-5 text-text-base outline-none placeholder:text-text-faint disabled:opacity-50 ${
                    shellMode() ? "font-mono tracking-[-0.04px]" : ""
                  }`}
                />
              </div>
            </div>

            <Show when={attachments().length > 0 || attachmentError()}>
              <div class="flex flex-col gap-1">
                <Show when={attachments().length > 0}>
                  <div class="relative">
                    <div class="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain no-scrollbar px-2 pt-2 pb-1">
                      <For each={attachments()}>
                        {(attachment) => {
                          const image = () =>
                            attachment.mime.startsWith("image/") && attachment.data
                              ? `data:${attachment.mime};base64,${attachment.data}`
                              : undefined;
                          return (
                            <div class="group/attachment relative shrink-0">
                              <Show
                                when={image()}
                                fallback={
                                  <div class="flex w-40 min-w-40 max-w-40 flex-col gap-1.5 rounded-md bg-bg-base p-2 shadow-[inset_0_0_0_0.5px_var(--border-base)] text-text-base dark:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]">
                                    <span class="w-full truncate text-caption font-[530] leading-[14px] tracking-[0.05px]">
                                      {attachmentName(attachment.name, attachment.mime)}
                                    </span>
                                    <span class="flex min-h-4 items-center gap-1 truncate text-caption font-[440] leading-[14px] tracking-[0.05px] text-text-muted">
                                      <FileTypeIcon
                                        path={attachment.path}
                                        type={attachment.kind === "directory" ? "directory" : "file"}
                                        class="size-3"
                                      />
                                      <span class="min-w-0 truncate">
                                        {attachmentContextLabel(attachment) || "file"}
                                      </span>
                                    </span>
                                  </div>
                                }
                              >
                                {(src) => (
                                  <div class="relative h-[46px] w-[58px] overflow-hidden rounded-md">
                                    <img src={src()} alt={attachment.name} class="size-full object-cover" />
                                    <span class="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_0.5px_var(--border-base)]" />
                                  </div>
                                )}
                              </Show>
                              <button
                                type="button"
                                aria-label={`Remove ${attachment.name}`}
                                onClick={() => {
                                  update(setAttachments, attachments, (current) =>
                                    current.filter((item) => item.path !== attachment.path),
                                  );
                                  setAttachmentError("");
                                }}
                                class="absolute -top-1 -end-1 grid size-4 place-items-center rounded-full bg-text-faint text-bg-base outline outline-1 outline-bg-base opacity-0 transition-opacity hover:bg-text-base group-hover/attachment:opacity-100"
                              >
                                <XMarkFilled class="size-4" />
                              </button>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                    <span class="pointer-events-none absolute inset-y-0 start-0 z-10 w-6 bg-[linear-gradient(to_right,var(--composer-surface),transparent)]" />
                    <span class="pointer-events-none absolute inset-y-0 end-0 z-10 w-6 bg-[linear-gradient(to_left,var(--composer-surface),transparent)]" />
                  </div>
                </Show>
                <Show when={attachmentError()}>
                  <p role="alert" class="px-4 pb-1 text-caption text-state-fg-danger">
                    {attachmentError()}
                  </p>
                </Show>
              </div>
            </Show>

            <div class="flex h-11 shrink-0 items-center px-2">
              <ComposerAddMenu
                disabled={props.disabled || attaching()}
                onAttach={() => void attach()}
                onCommands={() => {
                  setDismissed(false);
                  setMenuOpen(true);
                  area?.focus();
                }}
                onContext={() => {
                  update(setText, text, (current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@`);
                  setDismissed(false);
                  area?.focus();
                }}
                onShell={props.onRunShell ? enterShell : props.onShell}
              />

              <div
                ref={(el) => (controls = el)}
                onScroll={updateControlsOverflow}
                class={`composer-controls ms-1 me-3 flex h-full min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain no-scrollbar ${
                  controlsOverflow().start ? "composer-controls-start" : ""
                } ${controlsOverflow().end ? "composer-controls-end" : ""}`}
              >
                <div class="flex h-full w-max min-w-full items-center gap-0.5">
                  <Show
                    when={
                      props.agents &&
                      preferences().showAgent &&
                      props.onSelectAgent &&
                      props.agent &&
                      props.agents.length > 1 &&
                      props.agent !== props.agents[0]?.id
                    }
                  >
                    <AgentPicker agents={props.agents!} value={props.agent} onChange={props.onSelectAgent!} />
                  </Show>
                  <ModelPicker
                    providers={props.providers}
                    provider={props.provider}
                    model={props.model}
                    onSelect={props.onSelectModel}
                    onManageModels={props.onManageModels}
                    onAddProvider={props.onAddProvider}
                  />
                  <VariantPicker
                    variants={modelVariants()}
                    value={currentModel().variant}
                    onChange={(variant) =>
                      props.onSelectModel(
                        props.provider,
                        variant ? modelVariantID(currentModel().model, variant) : currentModel().model,
                      )
                    }
                  />
                </div>
              </div>

              <Show when={props.running && !empty()}>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    aria-label={`Send as ${delivery() === "steer" ? "queue" : "steer"}`}
                    title={
                      delivery() === "steer"
                        ? "Mod+Enter queues this prompt for the next turn"
                        : "Mod+Enter steers the active turn"
                    }
                    onClick={() => submit(true)}
                    class="interactive me-3 flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-body font-[530] text-text-faint"
                  >
                    {delivery() === "steer" ? t("queue") : t("steer")}
                    <Keybind keys={formatKeybind("mod+enter")?.split("+") ?? []} variant="neutral" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {delivery() === "steer" ? "Queue this prompt for the next turn" : "Steer the active turn"}
                  </TooltipContent>
                </Tooltip>
              </Show>

              <div class="flex shrink-0 items-center">
                <Show
                  when={stopping()}
                  fallback={
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        disabled={!canSubmit()}
                        aria-label={shellMode() ? "Run command" : t("send")}
                        aria-busy={sending()}
                        onClick={(event) => {
                          event.preventDefault();
                          submit();
                        }}
                        class="submit grid size-7 shrink-0 place-items-center rounded-md p-[6px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Show when={sending()} fallback={shellMode() ? <Undo2 class="size-4" /> : <ArrowUp class="size-4" />}>
                          <Loader class="size-4" />
                        </Show>
                      </TooltipTrigger>
                      <TooltipContent side="top">{shellMode() ? "Run command" : t("send")}</TooltipContent>
                    </Tooltip>
                  }
                >
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      aria-label={t("stop")}
                      onClick={(event) => {
                        event.preventDefault();
                        props.onStop();
                      }}
                      class="submit grid size-7 shrink-0 place-items-center rounded-md p-[6px]"
                    >
                      <Square class="size-4" />
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("stop")}</TooltipContent>
                  </Tooltip>
                </Show>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
