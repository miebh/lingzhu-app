import { Children, cloneElement, isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "@lingzhu/ui/icons";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@lingzhu/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { cn } from "@lingzhu/ui/utils";
import { highlightBlock, plainLines } from "@lingzhu/session-ui/highlight";
import { renderMermaidSvg } from "@lingzhu/session-ui/mermaid";

/** Copy control with a two-second confirmation, shown in the message footer. */
function CopyButton({ text, label = "Copy", iconClass = "size-3.5" }: { text: string; label?: string; iconClass?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={copied ? "Copied" : label}
          onClick={() => void copy()}
          className="text-text-faint hover:text-text-base"
        >
          {copied ? <Check className={iconClass} /> : <Copy className={iconClass} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? "Copied" : label}</TooltipContent>
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
function CodeBlock({ language, children, streaming }: { language?: string; children: string; streaming?: boolean }) {
  const mermaid = language?.trim().toLowerCase() === "mermaid";
  const lines = useMemo(
    () => (mermaid || streaming ? plainLines(children) : highlightBlock(children, language)),
    [children, language, mermaid, streaming],
  );
  const [svg, setSvg] = useState<string | undefined>(undefined);

  useEffect(() => {
    // A diagram only renders once its fence has settled, so a half-streamed
    // source never paints a broken graph.
    if (!mermaid || streaming) return;
    let live = true;
    setSvg(undefined);
    void renderMermaidSvg(children).then(
      (result) => {
        if (live) setSvg(result);
      },
      () => {
        if (live) setSvg(undefined);
      },
    );
    return () => {
      live = false;
    };
  }, [children, mermaid, streaming]);

  return (
    <div className="markdown-code group/code relative mt-3 mb-6">
      {svg && (
        <div
          data-component="markdown-mermaid"
          className="my-3 overflow-auto rounded-md border-[0.5px] border-border-base bg-bg-layer-02 p-4 [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <pre
        hidden={Boolean(svg)}
        className="no-scrollbar overflow-x-auto rounded-md border-[0.5px] border-border-base bg-bg-base p-3 font-mono text-body leading-5 whitespace-pre text-text-muted"
      >
        <code>
          {lines.map((tokens, index) => (
            <span key={index} data-slot="markdown-code-line">
              {tokens.length === 0 ? (
                "\n"
              ) : (
                <>
                  {tokens.map((token, position) =>
                    token.kind ? (
                      <span key={position} className={`tok-${token.kind}`}>
                        {token.text}
                      </span>
                    ) : (
                      <span key={position}>{token.text}</span>
                    ),
                  )}
                  {index < lines.length - 1 ? "\n" : null}
                </>
              )}
            </span>
          ))}
        </code>
      </pre>
      <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/code:opacity-100 focus-within:opacity-100">
        <CopyButton text={children} label="Copy code" iconClass="size-4" />
      </div>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mt-7 mb-3 text-[17px] leading-[1.5] font-semibold text-text-base">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2.5 text-[15px] leading-[1.5] font-semibold text-text-base">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-reading leading-[1.5] font-[670] text-text-base">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-5 mb-2 text-reading leading-[1.5] font-[530] text-text-muted">{children}</h6>,
  ul: ({ children }) => <ul className="mt-2 mb-3 list-disc pl-8 marker:text-text-muted">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 mb-3 list-decimal pl-8 marker:text-text-muted">{children}</ol>,
  li: ({ children }) => <li className="mb-2 last:mb-0 [&>ol]:mt-1 [&>ol]:mb-1 [&>ol]:pl-7 [&>ul]:mt-1 [&>ul]:mb-1 [&>ul]:pl-4">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-[0.5px] border-border-base pl-2 text-text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 h-0 border-0" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-text-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-[670] text-text-base">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  img: ({ src, alt }) => (
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      className="my-6 block max-w-full cursor-zoom-in rounded-[4px]"
    />
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-md bg-bg-layer-01 p-0.5 shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
      <table className="w-full border-separate border-spacing-0 text-body leading-4 font-[440] tracking-[-0.04px] tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="text-text-muted">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="rounded-sm bg-bg-base shadow-elevation-raised [&>tr:last-child>td]:border-0 [&>tr:first-child>td:first-child]:rounded-ss-[4px] [&>tr:first-child>td:last-child]:rounded-se-[4px] [&>tr:last-child>td:first-child]:rounded-es-[4px] [&>tr:last-child>td:last-child]:rounded-ee-[4px]">
      {children}
    </tbody>
  ),
  th: ({ children }) => <th className="px-3 py-2 text-left font-[530]">{children}</th>,
  td: ({ children }) => (
    <td className="border-b-[0.5px] border-[var(--border-muted)] px-3 py-2.5 text-text-base">{children}</td>
  ),
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const props = (child as { props?: { className?: string; children?: unknown } })?.props;
    const className = props?.className ?? "";
    const match = /language-([\w+#.-]+)/.exec(className);
    const text = String(props?.children ?? "").replace(/\n$/, "");
    return <CodeBlock language={match?.[1]}>{text}</CodeBlock>;
  },
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-sm bg-[color-mix(in_oklch,var(--fg-base)_8%,transparent)] px-1 font-mono text-body font-[530] text-text-base">
        {children}
      </code>
    ),
};

/**
 * Wraps text runs in per-word spans while a reply streams. React reuses spans
 * by position, so only words that appeared in the latest delta mount and play
 * the entrance animation; already rendered words stay still.
 */
function wordSpans(children: ReactNode): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === "string") {
      return child
        .split(/(\s+)/)
        .filter(Boolean)
        .map((word, wordIndex) => (
          <span key={`${index}-${wordIndex}-${word}`} className="markdown-word">
            {word}
          </span>
        ));
    }
    if (isValidElement<{ children?: ReactNode }>(child)) {
      return cloneElement(child, { children: wordSpans(child.props.children) });
    }
    return child;
  });
}

/** A fenced block stays plain while its own text still streams. */
function streamingPre({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  const props = (child as { props?: { className?: string; children?: unknown } })?.props;
  const className = props?.className ?? "";
  const match = /language-([\w+#.-]+)/.exec(className);
  const text = String(props?.children ?? "").replace(/\n$/, "");
  return (
    <CodeBlock language={match?.[1]} streaming>
      {text}
    </CodeBlock>
  );
}

function streamingComponents(base: Components): Components {
  return {
    ...base,
    p: ({ children }) => <p className="mb-3 last:mb-0">{wordSpans(children)}</p>,
    li: ({ children }) => (
      <li className="mb-2 last:mb-0 [&>ol]:mt-1 [&>ol]:mb-1 [&>ol]:pl-7 [&>ul]:mt-1 [&>ul]:mb-1 [&>ul]:pl-4">
        {wordSpans(children)}
      </li>
    ),
    h1: ({ children }) => (
      <h1 className="mt-7 mb-3 text-[17px] leading-[1.5] font-semibold text-text-base">{wordSpans(children)}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-6 mb-2.5 text-[15px] leading-[1.5] font-semibold text-text-base">{wordSpans(children)}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-5 mb-2 text-reading leading-[1.5] font-[670] text-text-base">{wordSpans(children)}</h3>
    ),
  };
}

function isFileHref(href?: string): href is string {
  if (!href || href.startsWith("#") || href.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function componentsWith(onOpenFile?: (path: string) => void, streaming = false): Components {
  const base: Components = streaming
    ? { ...streamingComponents(components), pre: streamingPre }
    : components;
  if (!onOpenFile) return base;
  return {
    ...base,
    a: ({ href, children }) =>
      isFileHref(href) ? (
        <button
          type="button"
          onClick={() => onOpenFile(decodeURI(href.replace(/^\.\//, "")))}
          className="inline cursor-pointer text-left text-text-accent underline-offset-2 hover:underline"
        >
          {children}
        </button>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-text-accent underline-offset-2 hover:underline"
        >
          {children}
        </a>
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

function usePacedText(text: string, streaming?: boolean) {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(text);
  const target = useRef(text);

  useEffect(() => {
    target.current = text;
    if (text.length < shownRef.current.length) {
      shownRef.current = text;
      setShown(text);
    }
  }, [text]);

  useEffect(() => {
    if (!streaming) {
      shownRef.current = target.current;
      setShown(target.current);
      return;
    }
    const timer = window.setInterval(() => {
      const goal = target.current;
      const backlog = goal.length - shownRef.current.length;
      if (backlog <= PACE_IMMEDIATE) {
        shownRef.current = goal;
        setShown(goal);
        return;
      }
      const step = Math.max(1, Math.ceil(backlog / 10));
      shownRef.current = goal.slice(0, shownRef.current.length + step);
      setShown(shownRef.current);
    }, PACE_MS);
    return () => window.clearInterval(timer);
  }, [streaming]);

  return shown;
}

/**
 * Markdown for assistant replies. Content stays selectable while the frame
 * around it (tool chrome, footers) stays unselectable. Relative links open the
 * workspace file in the side panel instead of leaving the app.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  onOpenFile,
  streaming,
}: {
  text: string;
  className?: string;
  onOpenFile?: (path: string) => void;
  streaming?: boolean;
}) {
  const parts = useMemo(() => componentsWith(onOpenFile, streaming), [onOpenFile, streaming]);
  const shown = usePacedText(text, streaming);
  return (
    <div
      className={cn("markdown-body text-prose text-text-base select-text", className)}
      data-streaming={streaming ? "true" : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={parts}>
        {shown}
      </ReactMarkdown>
    </div>
  );
});

export { CopyButton };
