import { assert, assertEquals } from "@std/assert";
import { join } from "path";
import { parseHTML } from "linkedom";
import { writeBrowserHeader } from "../../src/engine/browser-assets.ts";

function extensionWithAssets(): string {
  const dir = Deno.makeTempDirSync();
  Deno.writeTextFileSync(join(dir, "_extension.yml"), "version: 9.9.9\n");
  Deno.mkdirSync(join(dir, "assets"));
  Deno.writeTextFileSync(
    join(dir, "assets", "browser-v9.9.9.js"),
    "export const browser = true;",
  );
  Deno.writeTextFileSync(
    join(dir, "assets", "islands-bridge-v9.9.9.css"),
    ".marimo .grid{all:revert-layer}",
  );
  return dir;
}

function header(): Document {
  const dir = extensionWithAssets();
  const path = writeBrowserHeader(dir, dir);
  const html = Deno.readTextFileSync(path);
  return parseHTML(`<html><head>${html}</head><body></body></html>`).document;
}

Deno.test("the header stylesheet is one the islands runtime copies into widgets", () => {
  const style = header().querySelector("style[data-marimo-islands]");
  assert(style);
  assert(style.getAttribute("title")?.startsWith("marimo"));
  assertEquals(style.textContent, ".marimo .grid{all:revert-layer}");
});

Deno.test("the iframe resize helper is a classic script ahead of the adapter", () => {
  const scripts = Array.from(
    header().querySelectorAll("script[data-marimo-islands]"),
  );
  assertEquals(scripts.length, 2);
  const [helper, adapter] = scripts;
  assertEquals(helper.getAttribute("type"), null);
  assertEquals(adapter.getAttribute("type"), "module");
  assert(helper.textContent?.includes("window.__resizeIframe ??="));
});

Deno.test("the iframe resize helper grows a frame to its content", () => {
  const helper = header().querySelector("script:not([type])")?.textContent;
  assert(helper);
  const fakeWindow: { __resizeIframe?: (frame: unknown) => void } = {};
  const observed: unknown[] = [];
  class FakeResizeObserver {
    constructor(_callback: () => void) {}
    observe(target: unknown) {
      observed.push(target);
    }
  }
  new Function("window", "ResizeObserver", helper)(
    fakeWindow,
    FakeResizeObserver,
  );
  const body = {};
  const frame = {
    style: { height: "" },
    contentWindow: {
      document: {
        body,
        documentElement: {
          scrollHeight: 360,
          clientHeight: 150,
          scrollWidth: 290,
          clientWidth: 290,
        },
      },
    },
  };
  fakeWindow.__resizeIframe?.(frame);
  assertEquals(frame.style.height, "360px");
  assertEquals(observed, [body]);
});
