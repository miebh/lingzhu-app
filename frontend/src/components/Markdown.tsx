import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Copy control with a two-second confirmation, shown in the message footer. */
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}

/** A fenced code block with its own copy control. */
function CodeBlock({ language, children }: { language?: string; children: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-md border border-border-base">
      <div className="flex h-8 items-center justify-between gap-2 border-b border-border-base bg-bg-layer-01 px-3">
        <span className="truncate font-mono text-caption text-text-faint">{language || "text"}</span>
        <CopyButton text={children} label="Copy code" />
      </div>
      <pre className="overflow-x-auto bg-bg-base p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-lg font-medium text-text-base">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 text-base font-medium text-text-base">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-reading font-medium text-text-base">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 mb-2 text-reading font-medium text-text-muted">{children}</h4>,
  ul: ({ children }) => <ul className="mb-3 list-disc pl-8">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal pl-8">{children}</ol>,
  li: ({ children }) => <li className="mb-2 last:mb-0">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border-strong pl-3 text-text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 h-px border-0 bg-border-base" />,
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
  strong: ({ children }) => <strong className="font-medium text-text-base">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-meta">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border-base bg-bg-layer-01 px-2 py-1 text-left font-medium text-text-base">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border-base px-2 py-1 text-text-muted">{children}</td>,
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const props = (child as { props?: { className?: string; children?: unknown } })?.props;
    const className = props?.className ?? "";
    const match = /language-(\w+)/.exec(className);
    const text = String(props?.children ?? "").replace(/\n$/, "");
    return <CodeBlock language={match?.[1]}>{text}</CodeBlock>;
  },
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-xs bg-bg-layer-02 px-1.5 py-0.5 font-mono text-meta text-text-base">{children}</code>
    ),
};

/**
 * Markdown for assistant replies. Content stays selectable while the frame
 * around it (tool chrome, footers) stays unselectable.
 */
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("text-reading text-text-base select-text", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

export { CopyButton };
