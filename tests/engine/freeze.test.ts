import { assertEquals } from "@std/assert";

import {
  BROWSER_RUNTIME,
  needsBrowserRuntime,
} from "../../src/engine/index.ts";

Deno.test("an interactive page's dependencies ask for the browser runtime", () => {
  assertEquals(needsBrowserRuntime([BROWSER_RUNTIME]), true);
});

Deno.test("a static page has no dependencies", () => {
  assertEquals(needsBrowserRuntime(undefined), false);
  assertEquals(needsBrowserRuntime([]), false);
});
