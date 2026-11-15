import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../dist-parity");
const chrome =
  process.env.PARITY_BROWSER ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(
    (candidate) => fs.existsSync(candidate),
  );
if (!chrome) throw new Error("No Chrome or Edge executable found");

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  let url = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (url === "/") url = "/parity.html";
  fs.readFile(path.join(root, url), (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": types[path.extname(url)] ?? "application/octet-stream" });
    response.end(data);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/parity.html`;

const debugPort = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lingzhu-parity-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    url,
  ],
  { stdio: "ignore" },
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const endpoint = async (pathname) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}${pathname}`);
      if (response.ok) return response.json();
    } catch {}
    await wait(100);
  }
  throw new Error("DevTools endpoint did not start");
};

let socket;
try {
  await endpoint("/json/version");
  const targets = await endpoint("/json/list");
  const target = targets.find((item) => item.url.includes("parity.html"));
  if (!target) throw new Error("parity page target not found");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextID = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextID++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " :: " + JSON.stringify(result.exceptionDetails.exception?.description ?? ""));
    return result.result.value;
  };

  await send("Runtime.enable");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate("Boolean(window.__parityReady)");
    if (ready) break;
    await wait(100);
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const painted = await evaluate(
      "Boolean(document.querySelector('diffs-container')?.shadowRoot?.querySelector('[data-line]'))",
    );
    if (painted) break;
    await wait(100);
  }

  const measured = await evaluate(`(() => {
    const wait = ${wait.toString()};
    return (async () => {
      const root = document.getElementById("root");
      const group = document.getElementById("group-root");
      const style = (element) => element ? getComputedStyle(element) : null;
      const shellTrigger = root.querySelector('[data-component="collapsible"][data-compact="true"] > [data-slot="collapsible-trigger"]');
      const accordion = root.querySelector('[data-slot="accordion-trigger"]');
      const errorCard = root.querySelector('[data-kind="tool-error-card"]');
      const diagnostics = root.querySelector('[data-component="diagnostics"]');
      const loaded = root.querySelector('[data-component="tool-loaded-item"]');
      const title = root.querySelector('[data-component="tool-trigger"] [data-slot="basic-tool-tool-title"]');
      const fileHeader = root.querySelector('[data-component="sticky-accordion-header"]');
      const executeButton = Array.from(root.querySelectorAll('[data-slot="collapsible-trigger"]')).find((element) => element.textContent.includes("Execute"));
      if (executeButton && executeButton.getAttribute("aria-expanded") !== "true") executeButton.click();
      await wait(300);
      const execute = root.querySelector('[data-component="execute-tool-calls"] [data-slot="execute-tool-call"]');
      const marker = execute?.querySelector('[data-slot="execute-tool-call-marker"]');
      const host = root.querySelector("diffs-container");
      const shadow = host?.shadowRoot;
      const colors = {};
      if (shadow) {
        for (const span of shadow.querySelectorAll("[data-code] span[style*='color']")) {
          const text = span.textContent || "";
          if (!colors[text]) colors[text] = getComputedStyle(span).color;
        }
      }
      const used = group.querySelector('[data-component="context-tool-group-trigger"]')?.closest('[data-slot="collapsible-trigger"]');
      // The arrow must turn as the group opens: closed points right, open points down.
      const arrowIcon = () => group.querySelector('[data-slot="collapsible-arrow-icon"]');
      const arrowClosed = arrowIcon() ? getComputedStyle(arrowIcon()).transform : null;
      if (used && used.getAttribute("aria-expanded") !== "true") used.click();
      await wait(300);
      const arrowOpen = arrowIcon() ? getComputedStyle(arrowIcon()).transform : null;
      const groupTrigger = group.querySelector('[data-component="collapsed-tool-group"] > [data-component="collapsible"] > [data-slot="collapsible-trigger"]');
      const fileNames = Array.from(root.querySelectorAll('[data-slot="apply-patch-filename"]'));
      const multiNames = fileNames.filter((element) => ["one.ts", "two.ts"].includes(element.textContent));
      const multiDiffs = multiNames.filter((element) => element.closest('[data-slot="accordion-item"]')?.querySelector('diffs-container')).length;
      const wordSpans = shadow ? shadow.querySelectorAll('[data-diff-span]').length : 0;
      const imageTrigger = root.querySelector('[data-timeline-part-id="read-image"] [data-slot="collapsible-trigger"]');
      if (imageTrigger && imageTrigger.getAttribute('aria-expanded') !== 'true') imageTrigger.click();
      await wait(300);
      const image = root.querySelector('[data-component="read-image"] img');
      const imageStyle = image ? getComputedStyle(image) : null;
      const imageRect = image ? image.getBoundingClientRect() : null;
      const userAttachment = root.querySelector('[data-entry="user"] [data-slot="user-message-attachment"], [data-entry="user"] img')?.closest('span') ?? root.querySelector('[data-entry="user"] img')?.parentElement;
      const attachmentRect = userAttachment ? userAttachment.getBoundingClientRect() : null;
      const todo = document.querySelector('#todo-root [data-component="todos"]');
      const todoRow = todo?.querySelector('[data-status="completed"]') ?? todo?.querySelector('[data-status]');
      const todoGlyph = todo?.querySelector('svg');
      return {
        shell: shellTrigger ? { height: style(shellTrigger).height } : null,
        accordion: accordion ? { height: style(accordion).height, border: style(accordion).borderTopWidth, padding: style(accordion).padding } : null,
        error: errorCard ? { border: style(errorCard).borderTopWidth, background: style(errorCard).backgroundColor } : null,
        execute: execute ? { display: style(execute).display, gap: style(execute).gap, marker: marker ? style(marker).width : null } : null,
        diagnostics: diagnostics ? { padding: style(diagnostics).padding, gap: style(diagnostics).gap } : null,
        loaded: loaded ? { gap: style(loaded).gap } : null,
        title: title ? { size: style(title).fontSize, weight: style(title).fontWeight, lineHeight: style(title).lineHeight } : null,
        fileHeader: fileHeader ? { position: style(fileHeader).position, top: style(fileHeader).top } : null,
        group: groupTrigger
          ? {
              position: style(groupTrigger).position,
              top: style(groupTrigger).top,
              zIndex: style(groupTrigger).zIndex,
              background: style(groupTrigger).backgroundColor,
            }
          : null,
        arrow: { closed: arrowClosed, open: arrowOpen },
        variants: {
          multiFiles: multiNames.length,
          multiDiffs,
          wordSpans,
          browser: Boolean(root.querySelector('[data-timeline-part-id="browser-1"]')?.textContent.includes("browser")),
          imagegen: Boolean(root.querySelector('[data-timeline-part-id="imagegen-1"]')?.textContent.includes("imagegen")),
        },
        image: imageStyle ? { radius: imageStyle.borderRadius, cursor: imageStyle.cursor, maxWidth: imageStyle.maxWidth, rect: imageRect ? { width: imageRect.width, height: imageRect.height } : null } : null,
        attachment: attachmentRect ? { width: attachmentRect.width, height: attachmentRect.height } : null,
        todo: todo ? {
          padding: getComputedStyle(todo).padding,
          gap: getComputedStyle(todo).gap,
          glyph: todoGlyph ? getComputedStyle(todoGlyph).width : null,
          rowRadius: todoRow ? getComputedStyle(todoRow).borderRadius : null,
          textLineHeight: todoRow ? getComputedStyle(todoRow.querySelector('[data-slot="message-part-todo-content"]')).lineHeight : null,
          completedDecoration: todoRow ? getComputedStyle(todoRow.querySelector('[data-slot="message-part-todo-content"]')).textDecorationLine : null,
        } : null,
        pierre: {
          lineHeight: shadow?.querySelector("[data-line]") ? getComputedStyle(shadow.querySelector("[data-line]")).lineHeight : null,
          numberColumn: Boolean(shadow?.querySelector("[data-column-number]")),
          indicators: shadow?.querySelector("[data-diff]")?.getAttribute("data-indicators") ?? null,
          colors,
        },
      };
    })();
  })()`);

  const stickyProbe = await evaluate(`(async () => {
    const wait = ${wait.toString()};
    const group = document.getElementById("sticky-root");
    const scroll = group.querySelector(".scroll-stable-both");
    const used = group.querySelector('[data-component="context-tool-group-trigger"]')?.closest('[data-slot="collapsible-trigger"]');
    if (!scroll || !used) return null;
    if (used.getAttribute("aria-expanded") !== "true") used.click();
    await wait(250);
    scroll.scrollTop = 320;
    group.scrollIntoView({ block: "center" });
    await wait(150);
    const barRect = used.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const x = barRect.left + barRect.width / 2;
    const y = barRect.top + Math.min(barRect.height / 2, 12);
    const top = document.elementFromPoint(x, y);
    return {
      barTop: Math.round(barRect.top - scrollRect.top),
      barHeight: Math.round(barRect.height),
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      rootHeight: Math.round(group.getBoundingClientRect().height),
      expanded: used.getAttribute("aria-expanded"),
      groups: group.querySelectorAll('[data-component="collapsed-tool-group"]').length,
      contentHeight: Math.round(
        used.parentElement?.querySelector('[data-slot="collapsible-content"]')?.getBoundingClientRect().height ?? 0,
      ),
      position: getComputedStyle(used).position,
      top: getComputedStyle(used).top,
      zIndex: getComputedStyle(used).zIndex,
      pointElement: top?.closest("[data-component]")?.getAttribute("data-component") ?? top?.tagName,
      pointTag: top?.tagName,
      pointClass: top?.className?.toString().slice(0, 120),
      barBackground: getComputedStyle(used).backgroundColor,
      covered: Boolean(top && used.contains(top)),
    };
  })()`);
  console.log("STICKY PROBE", JSON.stringify(stickyProbe));
  // The group summary sticks to the very top of the transcript and paints over
  // the tool rows that scroll beneath it.
  assert.equal(stickyProbe?.barTop, 0);
  assert.equal(stickyProbe?.covered, true);
  assert.equal(stickyProbe?.position, "sticky");
  assert.equal(stickyProbe?.zIndex, "21");

  assert.equal(measured.shell?.height, "28px");
  assert.equal(measured.accordion?.height, "32px");
  assert.equal(measured.accordion?.border, "1px");
  assert.equal(measured.accordion?.padding, "8px 12px");
  assert.equal(measured.error?.border, "0px");
  assert.equal(measured.error?.background, "rgba(0, 0, 0, 0)");
  assert.equal(measured.execute?.display, "flex");
  assert.equal(measured.execute?.gap, "6px");
  assert.equal(measured.execute?.marker, "14px");
  assert.equal(measured.diagnostics?.padding, "8px 12px");
  assert.equal(measured.diagnostics?.gap, "4px");
  assert.equal(measured.loaded?.gap, "6px");
  assert.equal(measured.title?.size, "13px");
  assert.equal(measured.title?.weight, "530");
  assert.equal(measured.title?.lineHeight, "16px");
  assert.equal(measured.fileHeader?.position, "sticky");
  // The file rows stick below the locked group header: 32px trigger + 4px gap.
  assert.equal(measured.fileHeader?.top, "36px");
  assert.equal(measured.group?.position, "sticky");
  assert.equal(measured.group?.top, "0px");
  assert.equal(measured.group?.zIndex, "21");
  // The arrow turns when the group opens: -90deg (right) closed, 0deg (down) open.
  assert.equal(measured.arrow?.closed, "matrix(0, -1, 1, 0, 0, 0)");
  assert.equal(measured.arrow?.open, "matrix(1, 0, 0, 1, 0, 0)");
  // The sticky summary must paint an opaque page color over content that
  // scrolls under it, not a translucent layer.
  assert.notEqual(measured.group?.background, "rgba(0, 0, 0, 0)");
  assert.ok(measured.group?.background);
  assert.equal(measured.pierre.lineHeight, "24px");
  assert.equal(measured.pierre.numberColumn, true);
  assert.equal(measured.pierre.indicators, "bars");
  assert.equal(measured.pierre.colors["const "], "rgba(255, 255, 255, 0.424)");
  assert.equal(measured.pierre.colors['"steady"'], "rgb(0, 206, 185)");
  assert.equal(measured.pierre.colors["2 "], "rgb(147, 233, 246)");
  assert.equal(measured.pierre.colors["key"], "rgba(255, 255, 255, 0.937)");
  assert.equal(measured.pierre.colors["Widget"], "rgb(236, 245, 140)");
  assert.equal(measured.variants.multiFiles, 2);
  assert.equal(measured.variants.multiDiffs, 2);
  assert.ok(measured.variants.wordSpans > 0);
  assert.equal(measured.variants.browser, true);
  assert.equal(measured.variants.imagegen, true);

  assert.equal(measured.attachment.width, 58);
  assert.equal(measured.attachment.height, 46);
  assert.equal(measured.image?.radius, "4px");
  assert.equal(measured.image?.cursor, "zoom-in");
  assert.equal(measured.image?.maxWidth, "100%");
  assert.equal(measured.todo.glyph, "16px");
  assert.equal(measured.todo.rowRadius, "4px");
  assert.equal(measured.todo.textLineHeight, "20px");

  console.log(JSON.stringify(measured, null, 2));
  console.log("parity-browser: ok");
} finally {
  try {
    socket?.close();
  } catch {}
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
    else browser.kill("SIGKILL");
  } catch {}
  server.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Chromium can hold a profile lock briefly after taskkill; the temp folder
    // is disposable either way.
  }
}
