import { join } from "path";

const EXTENSION_CONFIG = "_extension.yml";

// The islands runtime copies an inline stylesheet into each widget's shadow
// root only when its title starts with "marimo", so the Quarto host rules in the
// bridge stylesheet reach the widgets. A titled stylesheet joins a preferred
// stylesheet set, which is harmless while it is the only titled one on the page.
const STYLESHEET_TITLE = "marimo-quarto-islands";

// `mo.iframe` output loads with `onload="__resizeIframe(this)"`. marimo's app
// page defines that helper, but the islands runtime does not, so every iframe
// load throws a ReferenceError and the frame never grows to its content. This
// is marimo's helper from `marimo/_static/index.html`. It is a classic script so
// it exists before the build-time snapshot's iframes load, and an upstream
// definition wins once the runtime ships one.
const RESIZE_IFRAME_HELPER = `window.__resizeIframe ??= function (frame) {
  function setHeight() {
    const root = frame.contentWindow?.document?.documentElement;
    if (!root || root.scrollHeight === root.clientHeight) return;
    const scrollbar = root.scrollWidth > root.clientWidth ? 20 : 0;
    const height = \`\${root.scrollHeight + scrollbar}px\`;
    if (frame.style.height !== height) frame.style.height = height;
  }
  setHeight();
  const body = frame.contentWindow?.document?.body;
  if (body) new ResizeObserver(setHeight).observe(body);
};`;

export function writeBrowserHeader(
  extensionDir: string,
  tempDir: string,
): string {
  const version = extensionVersion(extensionDir);
  const assetsDir = join(extensionDir, "assets");
  const browser = Deno.readTextFileSync(
    join(assetsDir, `browser-v${version}.js`),
  )
    .replace(/<\/script/gi, "<\\/script");
  const styles = Deno.readTextFileSync(
    join(assetsDir, `islands-bridge-v${version}.css`),
  )
    .replace(/<\/style/gi, "<\\/style");
  const header = [
    `<style data-marimo-islands title="${STYLESHEET_TITLE}">${styles}</style>`,
    `<script data-marimo-islands>${RESIZE_IFRAME_HELPER}</script>`,
    `<script type="module" data-marimo-islands>${browser}</script>`,
  ].join("\n");
  const path = Deno.makeTempFileSync({
    dir: tempDir,
    prefix: "marimo-header-",
    suffix: ".html",
  });
  Deno.writeTextFileSync(path, header);
  return path;
}

function extensionVersion(extensionDir: string): string {
  const config = Deno.readTextFileSync(join(extensionDir, EXTENSION_CONFIG));
  const match = config.match(/^version:\s*["']?([^"'\s#]+)["']?\s*$/m);
  if (!match) throw new Error("marimo extension version is missing");
  return match[1];
}
