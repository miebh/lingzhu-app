import { describe, expect, test } from "vitest";
import { entriesFromMessages, turnUsageByPrompt, type Message } from "@lingzhu/ui/types";

/** Milliseconds past a fixed base, rendered as the RFC3339 core timestamps use. */
const at = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms)).toISOString();

const prompt = (ms: number, text = "prompt"): Message => ({
  role: "user",
  content: text,
  created: at(ms),
});

const reply = (options: {
  created?: number;
  started?: number;
  firstToken?: number;
  streamed?: number;
  completed?: number;
  output?: number;
  reasoning?: number;
  text?: string;
}): Message => ({
  role: "assistant",
  content: options.text ?? "answer",
  created: options.created === undefined ? undefined : at(options.created),
  started: options.started === undefined ? undefined : at(options.started),
  firstToken: options.firstToken === undefined ? undefined : at(options.firstToken),
  streamed: options.streamed === undefined ? undefined : at(options.streamed),
  completed: options.completed === undefined ? undefined : at(options.completed),
  outputTokens: options.output,
  reasoningTokens: options.reasoning,
});

describe("turn throughput", () => {
  test("measures each prompt over its own steps, excluding tool time and the first token wait", () => {
    const messages = [
      prompt(0),
      reply({ started: 0, firstToken: 2_000, streamed: 12_000, completed: 12_000, output: 100 }),
      prompt(60_000),
      reply({ started: 60_000, firstToken: 61_000, streamed: 65_000, completed: 65_000, output: 20 }),
    ];

    const turns = turnUsageByPrompt(messages);
    expect(turns.get(0)).toEqual({ durationMs: 12_000, tokensPerSecond: 10 });
    expect(turns.get(2)).toEqual({ durationMs: 5_000, tokensPerSecond: 5 });
  });

  test("aggregates every step of a turn and counts reasoning tokens", () => {
    const messages = [
      prompt(0),
      reply({ started: 0, firstToken: 1_000, streamed: 3_000, completed: 3_000, output: 20, reasoning: 10 }),
      reply({ started: 3_000, firstToken: 4_000, streamed: 8_000, completed: 8_000, output: 10, reasoning: 0 }),
    ];

    expect(turnUsageByPrompt(messages).get(0)).toEqual({ durationMs: 8_000, tokensPerSecond: 40 / 6 });
  });

  test("omits throughput when any step lacks a streamed boundary but keeps the duration", () => {
    const messages = [
      prompt(0),
      reply({ started: 0, firstToken: 1_000, streamed: 4_000, completed: 4_000, output: 30 }),
      reply({ started: 4_000, firstToken: 5_000, completed: 6_000, output: 10 }),
    ];

    expect(turnUsageByPrompt(messages).get(0)).toEqual({ durationMs: 6_000 });
  });

  test("older steps without a completed time still give the turn a duration", () => {
    const messages = [prompt(0), reply({ created: 4_000, output: 10 })];

    expect(turnUsageByPrompt(messages).get(0)).toEqual({ durationMs: 4_000 });
  });

  test("attaches the measurements to the prompt row that opened the turn", () => {
    const entries = entriesFromMessages([
      prompt(0, "first"),
      reply({ started: 0, firstToken: 1_000, streamed: 3_000, completed: 3_000, output: 30 }),
      prompt(10_000, "second"),
      reply({ started: 10_000, firstToken: 11_000, streamed: 12_000, completed: 12_000, output: 20 }),
    ]);

    expect(entries[0].turn).toEqual({ durationMs: 3_000, tokensPerSecond: 15 });
    expect(entries[2].turn).toEqual({ durationMs: 2_000, tokensPerSecond: 20 });
  });

  test("does not treat a notice or a checkpoint as a new turn", () => {
    const messages: Message[] = [
      prompt(0),
      { role: "user", content: "notice", synthetic: true, created: at(1_000) },
      reply({ started: 1_000, firstToken: 2_000, streamed: 4_000, completed: 4_000, output: 20 }),
    ];

    expect(turnUsageByPrompt(messages).get(0)).toEqual({ durationMs: 4_000, tokensPerSecond: 10 });
    expect(turnUsageByPrompt(messages).size).toBe(1);
  });
});
