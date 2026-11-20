import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowUp, Bot, Sparkles, Square, Terminal, Undo2, XMarkFilled } from "@lingzhu/ui/icons";
import { Loader } from "@lingzhu/ui/loader";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { AgentPicker } from "./AgentPicker";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { ModelPicker } from "./ModelPicker";
import { VariantPicker } from "./VariantPicker";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
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
import { composerActiveIndex, composerSubmitMode, matchesComposerCommand, moveComposerSelection, slashQuery } from "../../lib/composer";
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
export function Composer({
  running,
  disabled,
  providers,
  provider,
  model,
  commands,
  agents,
  agent,
  width = "session",
  borderUnderlay,
  quote,
  onQuoteConsumed,
  restore,
  history,
  shellHistory,
  workspace,
  onSelectAgent,
  onSelectModel,
  onManageModels,
  onAddProvider,
  onSend,
  onStop,
  onShell,
  onRunShell,
}: Props) {
  const tr = useT();
  const preferences = usePreferences();
  const currentModel = splitModelID(model);
  const selectedModel = providers
    .find((item) => item.id === provider)
    ?.models.find((item) => item.id === currentModel.model);
  const modelVariants = orderedVariants(selectedModel?.variants);
  const [composer, dispatch] = useReducer(
    transitionComposer,
    preferences.followUpBehavior,
    createComposerState,
  );
  const shellMode = composer.mode === "shell";
  const sending = composer.submitting;
  const delivery = composer.delivery;
  const attaching = composer.attachment.busy;
  const attachmentError = composer.attachment.error;
  const setShellMode = (value: boolean) =>
    dispatch({ type: "mode.set", mode: value ? "shell" : "prompt" });
  const setSending = (value: boolean) => dispatch({ type: value ? "submit.start" : "submit.settle" });
  const setDelivery = (value: "steer" | "queue") => dispatch({ type: "delivery.set", delivery: value });
  const setAttaching = (value: boolean) =>
    dispatch({ type: value ? "attachment.start" : "attachment.finish" });
  const setAttachmentError = (message: string) => dispatch({ type: "attachment.error", message });
  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyDraft = useRef("");
  const [shellHistoryIndex, setShellHistoryIndex] = useState(-1);
  const shellHistoryDraft = useRef("");
  useEffect(() => {
    setDelivery(preferences.followUpBehavior);
  }, [preferences.followUpBehavior]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [contextActive, setContextActive] = useState(0);
  const [contextDismissed, setContextDismissed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [controlsOverflow, setControlsOverflow] = useState({ start: false, end: false });

  const updateControlsOverflow = useCallback(() => {
    const element = controls.current;
    if (!element) return;
    const start = element.scrollLeft > 0;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setControlsOverflow((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  // Fade a control edge only while controls sit past it, as the reference strip does.
  useEffect(() => {
    const element = controls.current;
    if (!element) return;
    updateControlsOverflow();
    const observer = new ResizeObserver(updateControlsOverflow);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [updateControlsOverflow]);

  // The draft surface grows with its content; the card's scrollport caps it.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  // The transcript Quote action appends a blockquote to the current draft.
  useEffect(() => {
    if (!quote) return;
    // Consume immediately so switching tabs and remounting the composer does
    // not insert the same quote a second time.
    onQuoteConsumed?.();
    const source = quote.text.replace(/\s+$/, "");
    if (!source.trim()) return;
    const block = source
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setText((current) => (current.trim() ? `${current}\n\n${block}\n` : `${block}\n`));
    setHistoryIndex(-1);
    historyDraft.current = "";
    setDismissed(false);
    area.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.nonce]);

  // Undo puts the reverted prompt back so it can be edited and sent again.
  useEffect(() => {
    if (!restore) return;
    setText(restore.text);
    setHistoryIndex(-1);
    historyDraft.current = "";
    setDismissed(false);
    area.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore?.nonce]);

  const query = shellMode ? null : slashQuery(text);
  const filtered = useMemo(() => {
    if (query === null) return menuOpen ? commands : [];
    return commands.filter((command) => matchesComposerCommand(command, query));
  }, [commands, menuOpen, query]);
  const open = !disabled && !shellMode && !dismissed && (query !== null || menuOpen);
  const activeIndex = composerActiveIndex(active, filtered.length);
  const contextToken = shellMode ? undefined : findContextToken(text);
  const contextQuery = contextToken?.query ?? "";
  const contextOpen = !!workspace && !!contextToken && !contextDismissed && !open;
  const contextEntries = useMemo<ContextEntry[]>(() => {
    if (!contextOpen) return [];
    const needle = contextQuery.trim().toLowerCase();
    const agentHits = (agents ?? [])
      .filter(
        (agent) =>
          !needle ||
          agent.id.toLowerCase().includes(needle) ||
          agent.name.toLowerCase().includes(needle) ||
          agent.description?.toLowerCase().includes(needle),
      )
      .slice(0, 4)
      .map((agent) => ({ kind: "agent" as const, agent }));
    const skillHits = skills
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
      ...contextFiles.map((path) => ({ kind: "file" as const, path })),
    ];
  }, [agents, contextFiles, contextOpen, contextQuery, skills]);

  useEffect(() => {
    setActive(0);
  }, [text, menuOpen]);

  useEffect(() => {
    setContextActive(0);
  }, [contextQuery, contextOpen]);

  useEffect(() => {
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
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  useEffect(() => {
    if (!contextOpen || !workspace) {
      setContextFiles([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .searchFiles(workspace, contextQuery, 12)
        .then((result) => {
          if (cancelled) return;
          setContextFiles(result.files.map((file) => file.path));
          setContextActive(0);
        })
        .catch(() => {
          if (!cancelled) setContextFiles([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contextOpen, contextQuery, workspace]);

  const empty = text.trim() === "";
  // While a run is active, an empty composer keeps the stop action; typing
  // turns the same control into a send action that queues the text.
  const attachmentsBlocked = running && attachments.length > 0;
  const submitMode = composerSubmitMode({
    running,
    empty,
    sending,
    attaching,
    attachmentsBlocked,
    disabled,
  });
  const stopping = submitMode === "stop";
  const canSubmit = submitMode === "send";

  const changeText = (value: string) => {
    // A leading `!` switches to shell mode and is not part of the command.
    if (!shellMode && onRunShell && value.startsWith("!")) {
      setShellMode(true);
      setAttachments([]);
      setAttachmentError("");
      value = value.slice(1);
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
    queueMicrotask(() => area.current?.focus());
  };

  const addPicked = (picked: PickedAttachment): boolean => {
    if (!picked?.path) return false;
    if (attachments.length >= MAX_ATTACHMENTS) {
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
    const total = attachments.reduce((sum, item) => sum + item.size, 0);
    if (total + picked.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(`Attachments are larger than ${MAX_ATTACHMENT_BYTES >> 20} MB in total.`);
      return false;
    }
    if (attachments.some((item) => item.path === picked.path)) return false;
    setAttachments((current) => [...current, picked]);
    return true;
  };

  const chooseContextEntry = async (entry: ContextEntry) => {
    if (entry.kind === "agent") {
      if (!contextToken) return;
      onSelectAgent?.(entry.agent.id);
      setText(replaceContextToken(text, contextToken, entry.agent.id));
      setContextDismissed(true);
      queueMicrotask(() => area.current?.focus());
      return;
    }
    if (entry.kind === "skill") {
      if (!contextToken) return;
      setText(replaceContextToken(text, contextToken, entry.skill.id));
      setContextDismissed(true);
      queueMicrotask(() => area.current?.focus());
      return;
    }
    await chooseContext(entry.path);
  };

  const chooseContext = async (path: string) => {
    if (!workspace || !contextToken) return;
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
      setText(replaceContextToken(text, contextToken, path));
      setContextDismissed(true);
      setAttachmentError("");
      queueMicrotask(() => area.current?.focus());
    } catch (error) {
      setAttachmentError(messageOf(error));
    }
  };

  const attach = async () => {
    if (disabled || attaching) return;
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
    if (disabled || attaching || files.length === 0) return;
    setAttaching(true);
    setAttachmentError("");
    const next = [...attachments];
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

  const dragHasFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const pickCommand = (command: SlashCommand) => {
    setMenuOpen(false);
    if (command.run) {
      // Selecting a command consumes its slash token, so the composer is empty
      // when the command opens its own surface.
      setText("");
      command.run();
      area.current?.focus();
      return;
    }
    // Text typed before opening the menu becomes the command's arguments.
    const args = text.startsWith("/") ? "" : text.trim();
    setText(`/${command.name}${args ? ` ${args}` : " "}`);
    area.current?.focus();
  };

  const move = (delta: number) => {
    if (filtered.length === 0) return;
    setActive(moveComposerSelection(activeIndex, delta, filtered.length));
  };

  const submit = (alternate = false) => {
    if (!canSubmit) {
      if (attachmentsBlocked) setAttachmentError("Wait for the current turn before attaching files.");
      return;
    }
    const target = alternate ? (delivery === "steer" ? "queue" : "steer") : delivery;
    const value = text.trim();
    if (shellMode && onRunShell) {
      setSending(true);
      setText("");
      setShellMode(false);
      setHistoryIndex(-1);
      historyDraft.current = "";
      setShellHistoryIndex(-1);
      shellHistoryDraft.current = "";
      setMenuOpen(false);
      onRunShell(value);
      setTimeout(() => setSending(false), 0);
      return;
    }
    const outgoing: PromptAttachment[] = attachments.map((attachment) => ({
      mime: attachment.mime,
      name: attachment.name,
      data: attachment.data,
    }));
    const references: PromptReference[] = attachments.flatMap((attachment) =>
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
    onSend(value, target, outgoing, references);
    // The bindings resolve after the host accepts the prompt; release the gate
    // on the next tick so a fast host does not flash the spinner.
    setTimeout(() => setSending(false), 0);
  };

  // Arrows recall entries from one history list; prompt and shell histories keep
  // independent cursors, so each composer mode steps only its own entries.
  const recallHistory = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    entries: string[],
    index: number,
    setIndex: (value: number) => void,
    draft: { current: string },
  ) => {
    if (entries.length === 0) return false;
    const element = area.current;
    const position = element?.selectionStart ?? 0;
    const browsing = index >= 0;
    // Like the reference: the first Up only starts from an empty draft, while
    // a recalled entry may be stepped from either edge of its text.
    const atEdge = position === 0 || position === text.length;
    const canUp = browsing ? atEdge : text.length === 0 && position === 0;
    if (event.key === "ArrowUp" && canUp && index < entries.length - 1) {
      event.preventDefault();
      if (!browsing) draft.current = text;
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      void attach();
      return;
    }
    if (shellMode && event.key === "Escape" && !open && !contextOpen) {
      event.preventDefault();
      setShellMode(false);
      setShellHistoryIndex(-1);
      shellHistoryDraft.current = "";
      setText("");
      return;
    }
    if (open && !event.nativeEvent.isComposing) {
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
        pickCommand(filtered[activeIndex]);
        return;
      }
    }
    if (contextOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextDismissed(true);
        return;
      }
      if (contextEntries.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setContextActive((current) => (current + 1) % contextEntries.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setContextActive((current) => (current - 1 + contextEntries.length) % contextEntries.length);
          return;
        }
        if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          void chooseContextEntry(contextEntries[contextActive] ?? contextEntries[0]);
          return;
        }
      }
    }
    if (
      !open &&
      !event.nativeEvent.isComposing &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      if (shellMode) {
        if (recallHistory(event, shellHistory ?? [], shellHistoryIndex, setShellHistoryIndex, shellHistoryDraft)) {
          return;
        }
      } else if (history && recallHistory(event, history, historyIndex, setHistoryIndex, historyDraft)) {
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(event.ctrlKey || event.metaKey);
    }
  };

  return (
    <div className="w-full shrink-0 bg-bg-base pb-3">
      <div className={`mx-auto w-full px-3 ${width === "full" ? "" : "md:max-w-session"}`}>
        <div className="relative z-10 flex flex-col">
          {contextOpen && (
            <div role="listbox" aria-label={tr("files")} className="command-suggestion-list">
              {contextEntries.length === 0 ? (
                <div className="command-suggestion-empty">{tr("noMatchingFiles")}</div>
              ) : (
                contextEntries.map((entry, index) => (
                  <div
                    key={
                      entry.kind === "file"
                        ? `file:${entry.path}`
                        : entry.kind === "skill"
                          ? `skill:${entry.skill.id}`
                          : `agent:${entry.agent.id}`
                    }
                    role="option"
                    aria-selected={index === contextActive}
                    data-active={index === contextActive ? "" : undefined}
                    className="command-suggestion-row"
                    onMouseEnter={() => setContextActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      void chooseContextEntry(entry);
                    }}
                  >
                    {entry.kind === "agent" ? (
                      <Bot className="size-4 shrink-0 text-text-faint" />
                    ) : entry.kind === "skill" ? (
                      <Sparkles className="size-4 shrink-0 text-text-faint" />
                    ) : (
                      <FileTypeIcon path={entry.path} type="file" className="size-4 shrink-0" />
                    )}
                    <span className="command-suggestion-label">
                      {entry.kind === "agent"
                        ? `@${entry.agent.id}`
                        : entry.kind === "skill"
                          ? `@${entry.skill.id}`
                          : entry.path}
                    </span>
                    {entry.kind === "agent" && (
                      <span className="command-suggestion-description">{entry.agent.description}</span>
                    )}
                    {entry.kind === "skill" && (
                      <span className="command-suggestion-description">
                        {entry.skill.description || entry.skill.name}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          {open && (
            <div
              id="slash-command-list"
              role="listbox"
              aria-label={tr("paletteGroupCommands")}
              className="command-suggestion-list"
            >
              {filtered.length === 0 ? (
                <div className="command-suggestion-empty">{tr("noMatchingCommands")}</div>
              ) : (
                filtered.map((command, index) => (
                  <div
                    key={command.name}
                    id={`slash-command-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex ? "" : undefined}
                    className="command-suggestion-row"
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickCommand(command);
                    }}
                  >
                    <span className="command-suggestion-label">/{command.name}</span>
                    <span className="command-suggestion-description">{command.description}</span>
                    {formatKeybind(command.keybind) && (
                      <span className="command-suggestion-keybind">{formatKeybind(command.keybind)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

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
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(Array.from(event.dataTransfer.files));
            }}
            className={`group/composer relative w-full overflow-clip rounded-xl bg-bg-composer-surface ${
              borderUnderlay
                ? "shadow-[0_0_0_0.5px_var(--border-base)] dark:bg-bg-layer-01 dark:shadow-none"
                : "shadow-elevation-raised"
            }`}
          >
            {dragging && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-30 rounded-xl opacity-100 backdrop-blur-[1.5px]"
                  style={{
                    maskImage:
                      "linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                    maskComposite: "intersect",
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 28%, black 72%, transparent 100%)",
                    WebkitMaskComposite: "source-in",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--fg-base)_8%,transparent)]">
                  <div className="absolute inset-0 bg-bg-base/25" />
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 w-full -translate-x-1/2 md:max-w-session"
                    style={{
                      maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-60"
                      style={{
                        background:
                          "repeating-linear-gradient(135deg, transparent 0px, transparent 12px, color-mix(in srgb, var(--fg-base) 4%, transparent) 12px, color-mix(in srgb, var(--fg-base) 4%, transparent) 24px)",
                        maskImage:
                          "radial-gradient(ellipse 59% 40% at center, black 0%, rgba(0,0,0,0.72) 58%, transparent 100%)",
                        WebkitMaskImage:
                          "radial-gradient(ellipse 59% 40% at center, black 0%, rgba(0,0,0,0.72) 58%, transparent 100%)",
                      }}
                    />
                  </div>
                  <div className="relative flex flex-col items-center gap-5">
                    <div className="flex size-10 items-center justify-center rounded-full bg-bg-base text-text-faint shadow-elevation-floating">
                      <ArrowUp className="size-4" />
                    </div>
                    <div className="text-[15px] leading-6 font-[530] text-text-base">{t("dropFiles")}</div>
                  </div>
                </div>
              </>
            )}
            <div className="relative">
              {shellMode && (
                <div className="flex items-center gap-1.5 ps-4 pe-[var(--composer-scroll-end)] pt-2 text-caption text-text-faint">
                  <Terminal className="size-3.5 shrink-0" />
                  <span className="font-[530] text-text-muted">{tr("shellMode")}</span>
                  <button
                    type="button"
                    aria-label={tr("exitShellMode")}
                    onClick={() => {
                      setShellMode(false);
                      area.current?.focus();
                    }}
                    className="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <XMarkFilled className="size-3" />
                  </button>
                </div>
              )}
              <div className="composer-scroll max-h-[180px] overflow-y-auto no-scrollbar">
                <textarea
                  ref={area}
                  value={text}
                  rows={1}
                  disabled={disabled}
                  spellCheck={preferences.spellcheck}
                  aria-label={tr("promptLabel")}
                  aria-autocomplete="list"
                  aria-expanded={open}
                  aria-controls={open ? "slash-command-list" : undefined}
                  aria-activedescendant={open ? `slash-command-option-${activeIndex}` : undefined}
                  placeholder={
                    shellMode
                      ? t("shellCommandPlaceholder")
                      : running
                        ? t("placeholderFollowUp")
                        : t("placeholder")
                  }
                  onChange={(event) => changeText(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files);
                    if (files.length === 0) return;
                    event.preventDefault();
                    void addFiles(files);
                  }}
                  className={`block w-full resize-none overflow-hidden bg-transparent ps-4 pe-[var(--composer-scroll-end)] pt-4 pb-2 text-[13px] font-[440] leading-5 text-text-base outline-none placeholder:text-text-faint disabled:opacity-50 ${
                    shellMode ? "font-mono tracking-[-0.04px]" : ""
                  }`}
                />
              </div>
            </div>

            {(attachments.length > 0 || attachmentError) && (
              <div className="flex flex-col gap-1">
                {attachments.length > 0 && (
                  <div className="relative">
                    <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain no-scrollbar px-2 pt-2 pb-1">
                      {attachments.map((attachment) => {
                        const image =
                          attachment.mime.startsWith("image/") && attachment.data
                            ? `data:${attachment.mime};base64,${attachment.data}`
                            : undefined;
                        return (
                          <div key={attachment.path} className="group/attachment relative shrink-0">
                            {image ? (
                              <div className="relative h-[46px] w-[58px] overflow-hidden rounded-md">
                                <img src={image} alt={attachment.name} className="size-full object-cover" />
                                <span className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_0.5px_var(--border-base)]" />
                              </div>
                            ) : (
                              <div className="flex w-40 min-w-40 max-w-40 flex-col gap-1.5 rounded-md bg-bg-base p-2 shadow-[inset_0_0_0_0.5px_var(--border-base)] text-text-base dark:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]">
                                <span className="w-full truncate text-caption font-[530] leading-[14px] tracking-[0.05px]">
                                  {attachmentName(attachment.name, attachment.mime)}
                                </span>
                                <span className="flex min-h-4 items-center gap-1 truncate text-caption font-[440] leading-[14px] tracking-[0.05px] text-text-muted">
                                  <FileTypeIcon
                                    path={attachment.path}
                                    type={attachment.kind === "directory" ? "directory" : "file"}
                                    className="size-3"
                                  />
                                  <span className="min-w-0 truncate">
                                    {attachmentContextLabel(attachment) || "file"}
                                  </span>
                                </span>
                              </div>
                            )}
                            <button
                              type="button"
                              aria-label={`Remove ${attachment.name}`}
                              onClick={() => {
                                setAttachments((current) => current.filter((item) => item.path !== attachment.path));
                                setAttachmentError("");
                              }}
                              className="absolute -top-1 -end-1 grid size-4 place-items-center rounded-full bg-text-faint text-bg-base outline outline-1 outline-bg-base opacity-0 transition-opacity hover:bg-text-base group-hover/attachment:opacity-100"
                            >
                              <XMarkFilled className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <span className="pointer-events-none absolute inset-y-0 start-0 z-10 w-6 bg-[linear-gradient(to_right,var(--composer-surface),transparent)]" />
                    <span className="pointer-events-none absolute inset-y-0 end-0 z-10 w-6 bg-[linear-gradient(to_left,var(--composer-surface),transparent)]" />
                  </div>
                )}
                {attachmentError && (
                  <p role="alert" className="px-4 pb-1 text-caption text-state-fg-danger">
                    {attachmentError}
                  </p>
                )}
              </div>
            )}

            <div className="flex h-11 shrink-0 items-center px-2">
              <ComposerAddMenu
                disabled={disabled || attaching}
                onAttach={() => void attach()}
                onCommands={() => {
                  setDismissed(false);
                  setMenuOpen(true);
                  area.current?.focus();
                }}
                onContext={() => {
                  setText((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@`);
                  setDismissed(false);
                  area.current?.focus();
                }}
                onShell={onRunShell ? enterShell : onShell}
              />

              <div
                ref={controls}
                onScroll={updateControlsOverflow}
                className={`composer-controls ms-1 me-3 flex h-full min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain no-scrollbar ${
                  controlsOverflow.start ? "composer-controls-start" : ""
                } ${controlsOverflow.end ? "composer-controls-end" : ""}`}
              >
                <div className="flex h-full w-max min-w-full items-center gap-0.5">
                  {agents && preferences.showAgent && onSelectAgent && agent && agents.length > 1 && agent !== agents[0]?.id && (
                    <AgentPicker agents={agents} value={agent} onChange={onSelectAgent} />
                  )}
                  <ModelPicker
                    providers={providers}
                    provider={provider}
                    model={model}
                    onSelect={onSelectModel}
                    onManageModels={onManageModels}
                    onAddProvider={onAddProvider}
                  />
                  <VariantPicker
                    variants={modelVariants}
                    value={currentModel.variant}
                    onChange={(variant) =>
                      onSelectModel(
                        provider,
                        variant ? modelVariantID(currentModel.model, variant) : currentModel.model,
                      )
                    }
                  />
                </div>
              </div>

              {running && !empty && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Send as ${delivery === "steer" ? "queue" : "steer"}`}
                      title={
                        delivery === "steer"
                          ? "Mod+Enter queues this prompt for the next turn"
                          : "Mod+Enter steers the active turn"
                      }
                      onClick={() => submit(true)}
                      className="interactive me-3 flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-body font-[530] text-text-faint"
                    >
                      {delivery === "steer" ? t("queue") : t("steer")}
                      <Keybind keys={formatKeybind("mod+enter")?.split("+") ?? []} variant="neutral" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {delivery === "steer" ? "Queue this prompt for the next turn" : "Steer the active turn"}
                  </TooltipContent>
                </Tooltip>
              )}

              <div className="flex shrink-0 items-center">
                {stopping ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("stop")}
                        onClick={(event) => {
                          event.preventDefault();
                          onStop();
                        }}
                        className="submit grid size-7 shrink-0 place-items-center rounded-md p-[6px]"
                      >
                        <Square className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("stop")}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!canSubmit}
                        aria-label={shellMode ? "Run command" : t("send")}
                        aria-busy={sending}
                        onClick={(event) => {
                          event.preventDefault();
                          submit();
                        }}
                        className="submit grid size-7 shrink-0 place-items-center rounded-md p-[6px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sending ? (
                          <Loader className="size-4" />
                        ) : shellMode ? (
                          <Undo2 className="size-4" />
                        ) : (
                          <ArrowUp className="size-4" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{shellMode ? "Run command" : t("send")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


