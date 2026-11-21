import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Check, Copy } from "@lingzhu/ui/icons";
import { SolidMarkdown, type SolidMarkdownComponents } from "solid-markdown";
import remarkGfm from "remark-gfm";
import { buttonVariants } from "@lingzhu/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { cn } from "@lingzhu/ui/utils";
import { t } from "@lingzhu/ui/i18n";
import { highlightBlock, plainLines } from "@lingzhu/session-ui/highlight";
import { renderMermaidSvg } from "@lingzhu/session-ui/mermaid";

type MarkdownComponents = SolidMarkdownComponents;

/** The subset of a hast node the custom renderers read. */
interface MarkdownNode {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
}

/** Props solid-markdown hands to a custom tag renderer. */
interface MarkdownTagProps {
  node?: MarkdownNode;
  class?: string | string[];
  href?: string;
  src?: string;
  alt?: string;
}

function classNameOf(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

/** The raw text under a hast node, which is how a settled fence is read. */
function textOf(node: MarkdownNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => textOf(child)).join("");
}

/** Copy control with a two-second confirmation, shown in the message footer. */
function CopyButton(props: { text: string; label?: string; iconClass?: string }) {
  const [copied, setCopied] = createSignal(false);
  const label = () => props.label ?? "Copy";
  const iconClass = () => props.iconClass ?? "size-3.5";

  const copy = async () => {
    await navigator.clipboard?.writeText(props.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      {/* Kobalte has no asChild: the trigger is the button, styled with the
          same recipe the Button component uses. */}
      <TooltipTrigger
        data-slot="button"
        data-variant="ghost"
        data-size="icon-xs"
        aria-label={copied() ? "Copied" : label()}
        onClick={() => void copy()}
        class={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-text-faint hover:text-text-base")}
      >
        <Show when={copied()} fallback={<Copy class={iconClass()} />}>
          <Check class={iconClass()} />
        </Show>
      </TooltipTrigger>
      <TooltipContent side="top">{copied() ? "Copied" : label()}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A fenced code block. Highlighted lines come from the shared highlighter so a
 * fence reads like the diff surface; a `mermaid` fence renders as a diagram and
 * keeps its source behind the disclosure.
 *
 * While a reply streams the block changes on every delta, so it stays plain
 * until the fence settles: re-tokenizing per frame would cost more than the
 * colour is worth, and the reference makes the same trade.
 */
function CodeBlock(props: { language?: string; children?: string; streaming?: boolean }) {
  const mermaid = createMemo(() => props.language?.trim().toLowerCase() === "mermaid");
  const lines = createMemo(() => {
    const text = props.children ?? "";
    return mermaid() || props.streaming ? plainLines(text) : highlightBlock(text, props.language);
  });
  const [svg, setSvg] = createSignal<string | undefined>(undefined);

  createEffect(() => {
    const isMermaid = mermaid();
    const text = props.children ?? "";
    // A diagram only renders once its fence has settled, so a half-streamed
    // source never paints a broken graph.
    if (!isMermaid || props.streaming) return;
    let live = true;
    setSvg(undefined);
    void renderMermaidSvg(text).then(
      (result) => {
        if (live) setSvg(result);
      },
      () => {
        if (live) setSvg(undefined);
      },
    );
    onCleanup(() => {
      live = false;
    });
  });

  return (
    <div class="markdown-code group/code relative mt-3 mb-6">
      <Show when={svg()}>
        {(diagram) => (
          <div
            data-component="markdown-mermaid"
            class="my-3 overflow-auto rounded-md border-[0.5px] border-border-base bg-bg-layer-02 p-4 [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:max-w-full"
            innerHTML={diagram()}
          />
        )}
      </Show>
      <pre
        hidden={Boolean(svg())}
        class="no-scrollbar overflow-x-auto rounded-md border-[0.5px] border-border-base bg-bg-base p-3 font-mono text-body leading-5 whitespace-pre text-text-muted"
      >
        <code>
          {lines().map((tokens, index, all) => (
            <span data-slot="markdown-code-line">
              {tokens.length === 0 ? (
                "\n"
              ) : (
                <>
                  {tokens.map((token, position) =>
                    token.kind ? (
                      <span class={`tok-${token.kind}`}>{token.text}</span>
                    ) : (
                      <span>{token.text}</span>
                    ),
                  )}
                  {index < all.length - 1 ? "\n" : null}
                </>
              )}
            </span>
          ))}
        </code>
      </pre>
      <div class="absolute top-1 right-1 opacity-0 transition-opacity group-hover/code:opacity-100 focus-within:opacity-100">
        <CopyButton text={props.children ?? ""} label={t("copyCode")} iconClass="size-4" />
      </div>
    </div>
  );
}

/** Reads the language and source out of the `pre > code` hast subtree. */
function fenceOf(node: MarkdownNode | undefined) {
  const code = node?.children?.find((child) => child.tagName === "code") ?? node?.children?.[0];
  const className = classNameOf(code?.properties?.className ?? code?.properties?.class);
  const match = /language-([\w+#.-]+)/.exec(className);
  return { language: match?.[1], text: textOf(code).replace(/\n$/, "") };
}

const components: MarkdownComponents = {
  p: (props) => <p class="mb-3 last:mb-0">{props.children}</p>,
  h1: (props) => <h1 class="mt-7 mb-3 text-[17px] leading-[1.5] font-semibold text-text-base">{props.children}</h1>,
  h2: (props) => <h2 class="mt-6 mb-2.5 text-[15px] leading-[1.5] font-semibold text-text-base">{props.children}</h2>,
  h3: (props) => <h3 class="mt-5 mb-2 text-reading leading-[1.5] font-[670] text-text-base">{props.children}</h3>,
  h4: (props) => <h4 class="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{props.children}</h4>,
  h5: (props) => <h5 class="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{props.children}</h5>,
  h6: (props) => <h6 class="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{props.children}</h6>,
  ul: (props) => <ul class="mt-2 mb-3 list-disc pl-8 marker:text-text-muted">{props.children}</ul>,
  ol: (props) => <ol class="mt-2 mb-3 list-decimal pl-8 marker:text-text-muted">{props.children}</ol>,
  li: (props) => (
    <li class="mb-2 last:mb-0 [&>ol]:mt-1 [&>ol]:mb-1 [&>ol]:pl-7 [&>ul]:mt-1 [&>ul]:mb-1 [&>ul]:pl-4">
      {props.children}
    </li>
  ),
  blockquote: (props) => (
    <blockquote class="my-4 border-l-[0.5px] border-border-base pl-2 text-text-muted">{props.children}</blockquote>
  ),
  hr: () => <hr class="my-8 h-0 border-0" />,
  a: (props) => (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer noopener"
      class="text-text-accent underline-offset-2 hover:underline"
    >
      {props.children}
    </a>
  ),
  strong: (props) => <strong class="font-[670] text-text-base">{props.children}</strong>,
  em: (props) => <em class="italic">{props.children}</em>,
  img: (props) => (
    <img
      src={typeof props.src === "string" ? props.src : undefined}
      alt={props.alt ?? ""}
      class="my-6 block max-w-full cursor-zoom-in rounded-[4px]"
    />
  ),
  table: (props) => (
    <div class="my-4 overflow-x-auto rounded-md bg-bg-layer-01 p-0.5 shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
      <table class="w-full border-separate border-spacing-0 text-body leading-4 font-[440] tracking-[-0.04px] tabular-nums">
        {props.children}
      </table>
    </div>
  ),
  thead: (props) => <thead class="text-text-muted">{props.children}</thead>,
  tbody: (props) => (
    <tbody class="rounded-sm bg-bg-base shadow-elevation-raised [&>tr:last-child>td]:border-0 [&>tr:first-child>td:first-child]:rounded-ss-[4px] [&>tr:first-child>td:last-child]:rounded-se-[4px] [&>tr:last-child>td:first-child]:rounded-es-[4px] [&>tr:last-child>td:last-child]:rounded-ee-[4px]">
      {props.children}
    </tbody>
  ),
  th: (props) => <th class="px-3 py-2 text-left font-[530]">{props.children}</th>,
  td: (props) => <td class="border-b-[0.5px] border-[var(--border-muted)] px-3 py-2.5 text-text-base">{props.children}</td>,
  pre: (props) => {
    // Read through an accessor so a fence that is still streaming keeps
    // feeding the block instead of freezing at its first render.
    const fence = () => fenceOf((props as MarkdownTagProps).node);
    return (
      <CodeBlock language={fence().language} streaming={false}>
        {fence().text}
      </CodeBlock>
    );
  },
  code: (props) => {
    const className = classNameOf((props as MarkdownTagProps).class);
    return className ? (
      <code class={className}>{props.children}</code>
    ) : (
      <code class="rounded-sm bg-[color-mix(in_oklch,var(--fg-base)_8%,transparent)] px-1 font-mono text-body font-[530] text-text-base">
        {props.children}
      </code>
    );
  },
};

/** A fenced block stays plain while its own text still streams. */
function streamingPre(props: MarkdownTagProps & { children?: JSX.Element }) {
  const fence = () => fenceOf(props.node);
  return (
    <CodeBlock language={fence().language} streaming>
      {fence().text}
    </CodeBlock>
  );
}

/**
 * Splits one text node into words without dropping the whitespace between
 * them, so each word can animate on its own.
 */
function wordTokens(value: string): string[] {
  return value.split(/(\s+)/).filter(Boolean);
}

/**
 * Wraps every streamed text node in per-word spans, the Solid equivalent of
 * cloning the rendered children. Solid builds DOM directly, so the split runs
 * on the hast text node instead: solid-markdown keeps node values reconciled,
 * and a `<For>` over the words only mounts the ones that just appeared.
 */
function StreamingText(props: { node?: MarkdownNode }) {
  return (
    <For each={wordTokens(props.node?.value ?? "")}>
      {(word) => <span class="markdown-word">{word}</span>}
    </For>
  );
}

function streamingComponents(base: MarkdownComponents): MarkdownComponents {
  return {
    ...base,
    text: (props) => <StreamingText node={(props as { node?: MarkdownNode }).node} />,
    pre: streamingPre,
  };
}

function isFileHref(href?: string): href is string {
  if (!href || href.startsWith("#") || href.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function componentsWith(onOpenFile?: (path: string) => void, streaming = false): MarkdownComponents {
  const base: MarkdownComponents = streaming ? streamingComponents(components) : components;
  if (!onOpenFile) return base;
  return {
    ...base,
    a: (props) => (
      <Show
        when={isFileHref((props as MarkdownTagProps).href)}
        fallback={
          <a
            href={(props as MarkdownTagProps).href}
            target="_blank"
            rel="noreferrer noopener"
            class="text-text-accent underline-offset-2 hover:underline"
          >
            {props.children}
          </a>
        }
      >
        <button
          type="button"
          onClick={() =>
            onOpenFile(decodeURI(String((props as MarkdownTagProps).href).replace(/^\.\//, "")))
          }
          class="inline cursor-pointer text-left text-text-accent underline-offset-2 hover:underline"
        >
          {props.children}
        </button>
      </Show>
    ),
  };
}

/**
 * Streamed text reveal. A live backlog larger than the immediate window is
 * emitted in slices every 24 ms, matching the reference transcript's paced
 * Markdown instead of letting a burst replace several paragraphs at once.
 */
const PACE_MS = 24;
const PACE_IMMEDIATE = 512;

function usePacedText(text: () => string, streaming: () => boolean | undefined) {
  const [shown, setShown] = createSignal(text());
  let shownValue = text();
  let target = text();

  createEffect(() => {
    const next = text();
    target = next;
    if (next.length < shownValue.length) {
      shownValue = next;
      setShown(next);
    }
  });

  createEffect(() => {
    if (!streaming()) {
      shownValue = target;
      setShown(target);
      return;
    }
    const timer = window.setInterval(() => {
      const goal = target;
      const backlog = goal.length - shownValue.length;
      if (backlog <= PACE_IMMEDIATE) {
        shownValue = goal;
        setShown(goal);
        return;
      }
      const step = Math.max(1, Math.ceil(backlog / 10));
      shownValue = goal.slice(0, shownValue.length + step);
      setShown(shownValue);
    }, PACE_MS);
    onCleanup(() => window.clearInterval(timer));
  });

  return shown;
}

const REMARK_PLUGINS = [remarkGfm];

/**
 * Markdown for assistant replies. Content stays selectable while the frame
 * around it (tool chrome, footers) stays unselectable. Relative links open the
 * workspace file in the side panel instead of leaving the app.
 */
export function Markdown(props: {
  text: string;
  class?: string;
  onOpenFile?: (path: string) => void;
  streaming?: boolean;
}) {
  const parts = createMemo(() => componentsWith(props.onOpenFile, props.streaming));
  const shown = usePacedText(
    () => props.text,
    () => props.streaming,
  );
  return (
    <div
      class={cn("markdown-body text-prose text-text-base select-text", props.class)}
      data-streaming={props.streaming ? "true" : undefined}
    >
      <SolidMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={parts()}
        renderingStrategy="reconcile"
        children={shown()}
      />
    </div>
  );
}

export { CopyButton };
