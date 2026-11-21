import { For, Show, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function QuestionCard(props: Props) {
  const tr = useT();
  return (
    <Show when={props.requests.length > 0}>
      <div class="select-none bg-bg-base pb-2">
        <div role="region" aria-label={tr("questionCardQuestions")} class="mx-auto w-full max-w-session px-3">
          <div class="flex flex-col gap-4 overflow-clip rounded-[10px] bg-bg-base px-3 pt-2 pb-0 shadow-elevation-raised">
            <For each={props.requests}>
              {(request) => <QuestionFormOrElicitation request={request} onReply={props.onReply} />}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}

function QuestionFormOrElicitation(props: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const elicitation = createMemo(
    () => props.request.questions.length > 0 && props.request.questions.every((prompt) => Boolean(prompt.kind)),
  );
  return (
    <Show
      when={elicitation()}
      fallback={<QuestionForm request={props.request} onReply={props.onReply} />}
    >
      <ElicitationForm request={props.request} onReply={props.onReply} />
    </Show>
  );
}

function QuestionForm(props: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const tr = useT();
  const [selected, setSelected] = createSignal<string[][]>(
    props.request.questions.map((): string[] => []),
  );
  const [custom, setCustom] = createSignal<string[]>(
    props.request.questions.map((): string => ""),
  );
  const [active, setActive] = createSignal(0);

  const total = () => props.request.questions.length;
  const prompt = () => props.request.questions[active()];
  const customValue = () => custom()[active()] ?? "";

  const toggle = (index: number, label: string) => {
    update(setSelected, selected, (current) =>
      current.map((values, position) => {
        if (position !== index) return values;
        const multiple = props.request.questions[index].multiple === true;
        if (multiple) {
          return values.includes(label) ? values.filter((value) => value !== label) : [...values, label];
        }
        return values.includes(label) ? [] : [label];
      }),
    );
  };

  const answered = (index: number) =>
    (custom()[index] ?? "").trim().length > 0 || (selected()[index] ?? []).length > 0;
  const answers = () =>
    props.request.questions.map((_, index) => {
      const typed = (custom()[index] ?? "").trim();
      return typed ? [typed] : selected()[index] ?? [];
    });
  const complete = createMemo(() => props.request.questions.every((_, index) => answered(index)));
  const current = () => answered(active());
  const last = () => active() === total() - 1;

  const advance = () => {
    if (!current()) return;
    if (last()) {
      if (complete()) props.onReply(props.request.id, { answers: answers() });
      return;
    }
    setActive(active() + 1);
  };

  return (
    <div class="flex flex-col">
      <div class="flex min-h-7 items-center justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <span class="text-body leading-4 font-[440] text-text-muted">{tr("questionTitle")}</span>
          <Show when={total() > 1}>
            <p class="text-meta leading-4 text-text-faint">
              {tr("questionProgress", { current: active() + 1, total: total() })}
            </p>
          </Show>
        </div>
        <Show when={total() > 1}>
          <div data-slot="question-progress" class="flex shrink-0 items-center gap-0.5">
            <For each={props.request.questions}>
              {(_, index) => (
                <button
                  type="button"
                  data-slot="question-progress-segment"
                  data-active={index() === active() ? "true" : undefined}
                  data-answered={answered(index()) ? "true" : undefined}
                  onClick={() => setActive(index())}
                  aria-label={`Question ${index() + 1}`}
                  aria-current={index() === active() ? "step" : undefined}
                  class="grid size-5 place-items-center rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus"
                >
                  <span
                    aria-hidden="true"
                    class={`block h-0.5 w-3.5 ${
                      index() === active()
                        ? "bg-text-base"
                        : answered(index())
                          ? "bg-state-fg-success"
                          : "bg-bg-layer-04"
                    }`}
                  />
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="flex flex-col gap-3 overflow-y-auto pt-3">
        <fieldset class="flex flex-col gap-2">
          <legend class="text-body leading-4 font-[440] text-text-muted">{prompt()?.header}</legend>
          <p class="text-body leading-4 font-[530] text-text-base">
            <LinkedText text={prompt()?.question ?? ""} />
          </p>
          <div class="flex flex-col gap-1.5">
            <For each={prompt()?.options ?? []}>
              {(option) => (
                <ChoiceButton
                  label={option.label}
                  description={option.description}
                  multiple={prompt()?.multiple === true}
                  picked={(selected()[active()] ?? []).includes(option.label)}
                  onClick={() => toggle(active(), option.label)}
                />
              )}
            </For>
          </div>
          <div class="flex h-10 items-center gap-2 rounded-[6px] bg-bg-layer-01 px-2.5 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
            <span aria-hidden="true" class="grid size-4 shrink-0 place-items-center">
              <span
                class={`size-4 rounded-full ${
                  customValue().trim()
                    ? "bg-[linear-gradient(180deg,var(--p-alpha-white-20),transparent),var(--bg-accent)]"
                    : "bg-[linear-gradient(180deg,var(--p-alpha-white-6),transparent),var(--bg-base)] shadow-[inset_0_0_0_0.5px_var(--border-strong)]"
                }`}
              >
                <Show when={customValue().trim()}>
                  <span class="mx-auto block size-1.5 rounded-full bg-text-base shadow-elevation-elements" />
                </Show>
              </span>
            </span>
            <input
              value={customValue()}
              aria-label={`Custom answer for ${prompt()?.header}`}
              placeholder={tr("questionCardTypeYourOwnAnswer")}
              onInput={(event) => {
                const value = event.currentTarget.value;
                const position = active();
                update(setCustom, custom, (values) =>
                  values.map((item, index) => (index === position ? value : item)),
                );
              }}
              class="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-body leading-4 font-[440] text-text-base outline-none placeholder:text-text-base focus:bg-bg-base focus:shadow-[inset_0_0_0_1px_var(--border-focus)]"
            />
          </div>
        </fieldset>
      </div>

      <div class="mt-4 flex items-center justify-between gap-2 rounded-b-[10px] border-[0.5px] border-border-base bg-bg-layer-01 px-2 pt-4 pb-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => props.onReply(props.request.id, { answers: [], cancelled: true })}
          class="text-text-muted hover:text-text-base"
        >
          Dismiss
        </Button>
        <div class="flex items-center gap-2">
          <Show when={active() > 0}>
            <Button variant="ghost" size="lg" onClick={() => setActive(active() - 1)}>
              Back
            </Button>
          </Show>
          <Button size="lg" disabled={!current() || (last() && !complete())} onClick={advance}>
            {last() ? tr("questionAnswer") : tr("questionNext")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceButton(props: {
  label: string;
  description?: string;
  multiple: boolean;
  picked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.picked}
      data-picked={props.picked ? "true" : undefined}
      onClick={props.onClick}
      class="relative flex w-full items-start gap-2 rounded-[6px] bg-bg-layer-01 p-2.5 text-left shadow-[inset_0_0_0_0.5px_var(--border-base)] transition-colors hover:bg-bg-layer-02 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-border-focus data-[picked=true]:shadow-none"
    >
      <Show when={props.picked}>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 rounded-[6px] bg-[color-mix(in_srgb,var(--border-focus)_15%,transparent)]"
        />
      </Show>
      <span aria-hidden="true" class="relative z-[1] grid size-4 shrink-0 place-items-center">
        <span
          class={`grid size-4 place-items-center ${props.multiple ? "rounded-[4px]" : "rounded-full"} ${
            props.picked
              ? "bg-[linear-gradient(180deg,var(--p-alpha-white-20),transparent),var(--bg-accent)]"
              : "bg-[linear-gradient(180deg,var(--p-alpha-white-6),transparent),var(--bg-base)] shadow-[inset_0_0_0_0.5px_var(--border-strong)]"
          }`}
        >
          <Show when={props.picked}>
            <Show
              when={props.multiple}
              fallback={<span class="size-1.5 rounded-full bg-text-base shadow-elevation-elements" />}
            >
              <Check class="size-4 text-text-inverse" />
            </Show>
          </Show>
        </span>
      </span>
      <span class="relative z-[1] flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="text-body leading-5 font-[440] text-text-base">{props.label}</span>
        <Show when={props.description}>
          <span class="text-meta leading-3 font-[440] tracking-[0.05px] text-text-muted">{props.description}</span>
        </Show>
      </span>
    </button>
  );
}

/** MCP elicitation shows every requested field in one dock. */
function ElicitationForm(props: { request: QuestionRequest; onReply: Props["onReply"] }) {
  const tr = useT();
  const [answers, setAnswers] = createSignal<string[][]>(
    props.request.questions.map((prompt): string[] => (prompt.kind === "boolean" ? ["false"] : [])),
  );
  const title = () =>
    props.request.questions.find((prompt) => prompt.title)?.title || tr("questionCardQuestions");
  const updateAnswer = (index: number, values: string[]) =>
    update(setAnswers, answers, (current) =>
      current.map((value, position) => (position === index ? values : value)),
    );
  const missing = createMemo(() =>
    props.request.questions.some(
      (prompt, index) => prompt.required === true && (answers()[index]?.length ?? 0) === 0,
    ),
  );

  return (
    <div class="flex flex-col">
      <div class="flex min-h-7 items-center justify-between gap-3">
        <span class="text-body leading-4 font-[440] text-text-muted">{title()}</span>
      </div>
      <div class="flex flex-col gap-3 overflow-y-auto pt-3">
        <For each={props.request.questions}>
          {(prompt, index) => (
            <ElicitationField
              prompt={prompt}
              value={answers()[index()] ?? []}
              onChange={(values) => updateAnswer(index(), values)}
            />
          )}
        </For>
      </div>
      <div class="mt-4 flex items-center justify-between gap-2 rounded-b-[10px] border-[0.5px] border-border-base bg-bg-layer-01 px-2 pt-4 pb-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => props.onReply(props.request.id, { answers: [], cancelled: true })}
          class="text-text-muted hover:text-text-base"
        >
          Dismiss
        </Button>
        <Button size="lg" disabled={missing()} onClick={() => props.onReply(props.request.id, { answers: answers() })}>
          {tr("questionCardSubmit")}
        </Button>
      </div>
    </div>
  );
}

function ElicitationField(props: {
  prompt: QuestionPrompt;
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const tr = useT();
  const kind = () => props.prompt.kind ?? "text";
  const options = () => props.prompt.options ?? [];
  const single = (next: string) => props.onChange(next ? [next] : []);
  const toggle = (label: string) => {
    if (props.prompt.multiple) {
      props.onChange(
        props.value.includes(label) ? props.value.filter((item) => item !== label) : [...props.value, label],
      );
      return;
    }
    props.onChange(props.value.includes(label) ? [] : [label]);
  };

  return (
    <div class="flex flex-col gap-2" data-slot="elicitation-field">
      <div class="flex flex-col gap-1">
        <span class="text-body leading-4 font-[440] text-text-muted">
          {props.prompt.header}
          {props.prompt.required ? " *" : ""}
        </span>
        <Show when={props.prompt.question}>
          <p class="text-body leading-4 font-[530] text-text-base">
            <LinkedText text={props.prompt.question ?? ""} />
          </p>
        </Show>
      </div>
      <Show
        when={kind() === "boolean"}
        fallback={
          <Show
            when={kind() === "number" || kind() === "integer"}
            fallback={
              <Show
                when={kind() === "external"}
                fallback={
                  <Show
                    when={options().length > 0}
                    fallback={
                      <Input
                        type={inputType(props.prompt.format)}
                        value={props.value[0] ?? ""}
                        placeholder={props.prompt.placeholder}
                        aria-label={props.prompt.header}
                        aria-required={props.prompt.required === true}
                        onInput={(event) => single(event.currentTarget.value)}
                      />
                    }
                  >
                    <div class="flex flex-col gap-1.5">
                      <For each={options()}>
                        {(option) => (
                          <ChoiceButton
                            label={option.label}
                            description={option.description}
                            multiple={props.prompt.multiple === true}
                            picked={props.value.includes(option.label)}
                            onClick={() => toggle(option.label)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                }
              >
                <div class="flex items-center gap-2 rounded-[6px] bg-bg-layer-01 p-2.5 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
                  <span class="min-w-0 flex-1 break-all text-body leading-5 text-text-base">
                    <LinkedText text={props.prompt.url ?? ""} />
                  </span>
                  <Button variant="outline" size="sm" onClick={() => openExternal(props.prompt.url)}>
                    <ExternalLink class="size-3.5" />
                    {tr("open")}
                  </Button>
                </div>
              </Show>
            }
          >
            <Input
              type="number"
              step={kind() === "integer" ? 1 : "any"}
              value={props.value[0] ?? ""}
              aria-label={props.prompt.header}
              aria-required={props.prompt.required === true}
              onInput={(event) => single(event.currentTarget.value)}
            />
          </Show>
        }
      >
        <div class="flex min-h-10 items-center justify-end rounded-[6px] bg-bg-layer-01 px-2.5 py-2 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
          <Switch
            checked={props.value[0] === "true"}
            aria-label={props.prompt.header}
            aria-required={props.prompt.required === true}
            onCheckedChange={(checked) => single(checked ? "true" : "false")}
          />
        </div>
      </Show>
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
