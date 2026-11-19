import { useState } from "react";
import { Check, ExternalLink } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Input } from "@lingzhu/ui/input";
import { Switch } from "@lingzhu/ui/switch";
import { LinkedText } from "@lingzhu/ui/LinkedText";
import type { QuestionPrompt, QuestionRequest, QuestionResponse } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  requests: QuestionRequest[];
  onReply: (requestID: string, response: QuestionResponse) => void;
}

/**
 * A question dock above the composer. Each question is a small radio or
 * checkbox group with an always-available free-form answer, matching the
 * reference tool's answer shape. Several questions advance one at a time with
 * a progress row, so a long form never turns into one tall scroll box.
 */
export function QuestionCard({ requests, onReply }: Props) {
  const tr = useT();
  if (requests.length === 0) return null;
  return (
    <div className="select-none bg-bg-base pb-2">
      <div role="region" aria-label={tr("questionCardQuestions")} className="mx-auto w-full max-w-session px-3">
        <div className="flex flex-col gap-4 overflow-clip rounded-[10px] bg-bg-base px-3 pt-2 pb-0 shadow-elevation-raised">
          {requests.map((request) => (
            <QuestionFormOrElicitation key={request.id} request={request} onReply={onReply} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionFormOrElicitation({ request, onReply }: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const elicitation =
    request.questions.length > 0 && request.questions.every((prompt) => Boolean(prompt.kind));
  return elicitation ? (
    <ElicitationForm request={request} onReply={onReply} />
  ) : (
    <QuestionForm request={request} onReply={onReply} />
  );
}

function QuestionForm({ request, onReply }: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const tr = useT();
  const [selected, setSelected] = useState<string[][]>(() => request.questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(() => request.questions.map(() => ""));
  const [active, setActive] = useState(0);

  const total = request.questions.length;
  const prompt = request.questions[active];

  const toggle = (index: number, label: string) => {
    setSelected((current) =>
      current.map((values, position) => {
        if (position !== index) return values;
        const multiple = request.questions[index].multiple === true;
        if (multiple) {
          return values.includes(label) ? values.filter((value) => value !== label) : [...values, label];
        }
        return values.includes(label) ? [] : [label];
      }),
    );
  };

  const answered = (index: number) => custom[index].trim().length > 0 || selected[index].length > 0;
  const answers = () =>
    request.questions.map((_, index) => {
      const typed = custom[index].trim();
      return typed ? [typed] : selected[index];
    });
  const complete = request.questions.every((_, index) => answered(index));
  const current = answered(active);
  const last = active === total - 1;

  const advance = () => {
    if (!current) return;
    if (last) {
      if (complete) onReply(request.id, { answers: answers() });
      return;
    }
    setActive(active + 1);
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body leading-4 font-[440] text-text-muted">Question</span>
          {total > 1 && (
            <p className="text-meta leading-4 text-text-faint">
              {active + 1} of {total}
            </p>
          )}
        </div>
        {total > 1 && (
          <div data-slot="question-progress" className="flex shrink-0 items-center gap-0.5">
            {request.questions.map((_, index) => (
              <button
                key={index}
                type="button"
                data-slot="question-progress-segment"
                data-active={index === active ? "true" : undefined}
                data-answered={answered(index) ? "true" : undefined}
                onClick={() => setActive(index)}
                aria-label={`Question ${index + 1}`}
                aria-current={index === active ? "step" : undefined}
                className="grid size-5 place-items-center rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus"
              >
                <span
                  aria-hidden="true"
                  className={`block h-0.5 w-3.5 ${
                    index === active
                      ? "bg-text-base"
                      : answered(index)
                        ? "bg-state-fg-success"
                        : "bg-bg-layer-04"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto pt-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body leading-4 font-[440] text-text-muted">{prompt.header}</legend>
          <p className="text-body leading-4 font-[530] text-text-base">
            <LinkedText text={prompt.question} />
          </p>
          <div className="flex flex-col gap-1.5">
            {prompt.options.map((option) => (
              <ChoiceButton
                key={option.label}
                label={option.label}
                description={option.description}
                multiple={prompt.multiple === true}
                picked={selected[active].includes(option.label)}
                onClick={() => toggle(active, option.label)}
              />
            ))}
          </div>
          <div className="flex h-10 items-center gap-2 rounded-[6px] bg-bg-layer-01 px-2.5 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
            <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
              <span
                className={`size-4 rounded-full ${
                  custom[active].trim()
                    ? "bg-[linear-gradient(180deg,var(--p-alpha-white-20),transparent),var(--bg-accent)]"
                    : "bg-[linear-gradient(180deg,var(--p-alpha-white-6),transparent),var(--bg-base)] shadow-[inset_0_0_0_0.5px_var(--border-strong)]"
                }`}
              >
                {custom[active].trim() && (
                  <span className="mx-auto block size-1.5 rounded-full bg-text-base shadow-elevation-elements" />
                )}
              </span>
            </span>
            <input
              value={custom[active]}
              aria-label={`Custom answer for ${prompt.header}`}
              placeholder={tr("questionCardTypeYourOwnAnswer")}
              onChange={(event) =>
                setCustom((current) =>
                  current.map((value, position) => (position === active ? event.target.value : value)),
                )
              }
              className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-body leading-4 font-[440] text-text-base outline-none placeholder:text-text-base focus:bg-bg-base focus:shadow-[inset_0_0_0_1px_var(--border-focus)]"
            />
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-b-[10px] border-[0.5px] border-border-base bg-bg-layer-01 px-2 pt-4 pb-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onReply(request.id, { answers: [], cancelled: true })}
          className="text-text-muted hover:text-text-base"
        >
          Dismiss
        </Button>
        <div className="flex items-center gap-2">
          {active > 0 && (
            <Button variant="ghost" size="lg" onClick={() => setActive(active - 1)}>
              Back
            </Button>
          )}
          <Button size="lg" disabled={!current || (last && !complete)} onClick={advance}>
            {last ? "Answer" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  description,
  multiple,
  picked,
  onClick,
}: {
  label: string;
  description?: string;
  multiple: boolean;
  picked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      data-picked={picked ? "true" : undefined}
      onClick={onClick}
      className="relative flex w-full items-start gap-2 rounded-[6px] bg-bg-layer-01 p-2.5 text-left shadow-[inset_0_0_0_0.5px_var(--border-base)] transition-colors hover:bg-bg-layer-02 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-border-focus data-[picked=true]:shadow-none"
    >
      {picked && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[6px] bg-[color-mix(in_srgb,var(--border-focus)_15%,transparent)]"
        />
      )}
      <span aria-hidden="true" className="relative z-[1] grid size-4 shrink-0 place-items-center">
        <span
          className={`grid size-4 place-items-center ${
            multiple ? "rounded-[4px]" : "rounded-full"
          } ${
            picked
              ? "bg-[linear-gradient(180deg,var(--p-alpha-white-20),transparent),var(--bg-accent)]"
              : "bg-[linear-gradient(180deg,var(--p-alpha-white-6),transparent),var(--bg-base)] shadow-[inset_0_0_0_0.5px_var(--border-strong)]"
          }`}
        >
          {picked &&
            (multiple ? (
              <Check className="size-4 text-text-inverse" />
            ) : (
              <span className="size-1.5 rounded-full bg-text-base shadow-elevation-elements" />
            ))}
        </span>
      </span>
      <span className="relative z-[1] flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-body leading-5 font-[440] text-text-base">{label}</span>
        {description && (
          <span className="text-meta leading-3 font-[440] tracking-[0.05px] text-text-muted">{description}</span>
        )}
      </span>
    </button>
  );
}

/** MCP elicitation shows every requested field in one dock. */
function ElicitationForm({ request, onReply }: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const tr = useT();
  const [answers, setAnswers] = useState<string[][]>(() =>
    request.questions.map((prompt) => (prompt.kind === "boolean" ? ["false"] : [])),
  );
  const title = request.questions.find((prompt) => prompt.title)?.title || tr("questionCardQuestions");
  const update = (index: number, values: string[]) =>
    setAnswers((current) => current.map((value, position) => (position === index ? values : value)));
  const missing = request.questions.some(
    (prompt, index) => prompt.required === true && (answers[index]?.length ?? 0) === 0,
  );

  return (
    <div className="flex flex-col">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="text-body leading-4 font-[440] text-text-muted">{title}</span>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto pt-3">
        {request.questions.map((prompt, index) => (
          <ElicitationField
            key={`${prompt.header}:${index}`}
            prompt={prompt}
            value={answers[index] ?? []}
            onChange={(values) => update(index, values)}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 rounded-b-[10px] border-[0.5px] border-border-base bg-bg-layer-01 px-2 pt-4 pb-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onReply(request.id, { answers: [], cancelled: true })}
          className="text-text-muted hover:text-text-base"
        >
          Dismiss
        </Button>
        <Button size="lg" disabled={missing} onClick={() => onReply(request.id, { answers })}>
          {tr("questionCardSubmit")}
        </Button>
      </div>
    </div>
  );
}

function ElicitationField({
  prompt,
  value,
  onChange,
}: {
  prompt: QuestionPrompt;
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const tr = useT();
  const kind = prompt.kind ?? "text";
  const options = prompt.options ?? [];
  const single = (next: string) => onChange(next ? [next] : []);
  const toggle = (label: string) => {
    if (prompt.multiple) {
      onChange(value.includes(label) ? value.filter((item) => item !== label) : [...value, label]);
      return;
    }
    onChange(value.includes(label) ? [] : [label]);
  };

  return (
    <div className="flex flex-col gap-2" data-slot="elicitation-field">
      <div className="flex flex-col gap-1">
        <span className="text-body leading-4 font-[440] text-text-muted">
          {prompt.header}
          {prompt.required ? " *" : ""}
        </span>
        {prompt.question && (
          <p className="text-body leading-4 font-[530] text-text-base">
            <LinkedText text={prompt.question} />
          </p>
        )}
      </div>
      {kind === "boolean" ? (
        <div className="flex min-h-10 items-center justify-end rounded-[6px] bg-bg-layer-01 px-2.5 py-2 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
          <Switch
            checked={value[0] === "true"}
            aria-label={prompt.header}
            aria-required={prompt.required === true}
            onCheckedChange={(checked) => single(checked ? "true" : "false")}
          />
        </div>
      ) : kind === "number" || kind === "integer" ? (
        <Input
          type="number"
          step={kind === "integer" ? 1 : "any"}
          value={value[0] ?? ""}
          aria-label={prompt.header}
          aria-required={prompt.required === true}
          onChange={(event) => single(event.target.value)}
        />
      ) : kind === "external" ? (
        <div className="flex items-center gap-2 rounded-[6px] bg-bg-layer-01 p-2.5 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
          <span className="min-w-0 flex-1 break-all text-body leading-5 text-text-base">
            <LinkedText text={prompt.url ?? ""} />
          </span>
          <Button variant="outline" size="sm" onClick={() => openExternal(prompt.url)}>
            <ExternalLink className="size-3.5" />
            {tr("open")}
          </Button>
        </div>
      ) : options.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <ChoiceButton
              key={option.label}
              label={option.label}
              description={option.description}
              multiple={prompt.multiple === true}
              picked={value.includes(option.label)}
              onClick={() => toggle(option.label)}
            />
          ))}
        </div>
      ) : (
        <Input
          type={inputType(prompt.format)}
          value={value[0] ?? ""}
          placeholder={prompt.placeholder}
          aria-label={prompt.header}
          aria-required={prompt.required === true}
          onChange={(event) => single(event.target.value)}
        />
      )}
    </div>
  );
}

function inputType(format?: string) {
  if (format === "email") return "email";
  if (format === "uri") return "url";
  return "text";
}

function openExternal(url?: string) {
  const value = (url ?? "").trim();
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  } catch {
    // A malformed server URL stays visible but is not opened.
  }
}
