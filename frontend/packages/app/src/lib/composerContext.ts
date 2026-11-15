/** The `@query` token at the end of a composer draft, if any. */
export interface ContextToken {
  /** Index of the `@` character. */
  start: number;
  /** Text typed after the `@`. */
  query: string;
}

/** Finds the context token a person is currently typing at the end of the draft. */
export function findContextToken(text: string): ContextToken | undefined {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  if (!match) return undefined;
  return { start: match.index + match[1].length, query: match[2] };
}

/** Replaces the typed `@query` token with the picked path and a trailing space. */
export function replaceContextToken(text: string, token: ContextToken, path: string): string {
  return `${text.slice(0, token.start)}@${path} ${text.slice(token.start + token.query.length + 1)}`;
}
