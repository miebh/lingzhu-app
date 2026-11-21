/**
 * URL shapes. The session path carries the workspace as a base64url segment, the
 * same way the reference app keys its server segment, so a filesystem path never
 * has to survive as several URL segments.
 */

const settingsPrefix = "/settings";

/** Base64url for UTF-8 text; URL-safe and free of padding. */
export function encodeSegment(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Inverse of `encodeSegment`; undefined when the input is not valid base64url. */
export function decodeSegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    // Reject non-canonical segments so a hand-edited URL cannot alias a path.
    return encodeSegment(decoded) === value ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function homeHref(): string {
  return "/";
}

export function sessionHref(workspace: string, sessionID: string): string {
  return `/workspace/${encodeSegment(workspace)}/session/${encodeURIComponent(sessionID)}`;
}

export function newSessionHref(draftID?: string): string {
  return draftID ? `/new-session?draftId=${encodeURIComponent(draftID)}` : "/new-session";
}

export function settingsHref(section?: string): string {
  return section && section !== "general" ? `${settingsPrefix}/${encodeURIComponent(section)}` : settingsPrefix;
}

export interface RouteView {
  tab: "chat" | "settings";
  homeOpen: boolean;
  settingsOpen: boolean;
  settingsSection: string;
}

/** The view state a pathname projects onto, used by the shell surfaces. */
export function routeView(href: string): RouteView {
  const pathname = href.split(/[?#]/, 1)[0] || "/";
  if (pathname === settingsPrefix || pathname.startsWith(`${settingsPrefix}/`)) {
    const section = pathname.slice(settingsPrefix.length + 1).split("/")[0];
    return {
      tab: "settings",
      homeOpen: false,
      settingsOpen: true,
      settingsSection: section ? decodeURIComponent(section) : "general",
    };
  }
  return {
    tab: "chat",
    homeOpen: pathname === "/",
    settingsOpen: false,
    settingsSection: "general",
  };
}

/** The draft id carried by a new-session URL, if any. */
export function draftIDFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get("draftId");
  return value ?? undefined;
}
