import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  running: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ running, disabled, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || running || disabled) return;
    setText("");
    if (area.current) area.current.style.height = "auto";
    onSend(value);
  };

  const resize = () => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  return (
    <div className="px-8 pt-3 pb-5">
      <div className="mx-auto max-w-[736px]">
        <div className="rounded-xl border border-border bg-card px-3 pt-2.5 pb-2 transition focus-within:border-ring/60">
          <Textarea
            ref={area}
            value={text}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? "Core is not connected" : "Ask lingzhu anything…"}
            onChange={(event) => setText(event.target.value)}
            onInput={resize}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-[200px] min-h-[26px] resize-none border-0 bg-transparent px-0 py-0 text-[14px] leading-6 text-foreground shadow-none placeholder:text-ink-faint focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="px-1 text-[11px] text-ink-faint">
              Enter to send · Shift+Enter for a newline
            </span>
            {running ? (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={onStop}
                aria-label="Stop"
                title="Stop the running turn"
                className="border-border text-ink-mid hover:border-destructive/40 hover:text-destructive"
              >
                <Square />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={submit}
                disabled={disabled || text.trim() === ""}
                aria-label="Send"
                title="Send"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
