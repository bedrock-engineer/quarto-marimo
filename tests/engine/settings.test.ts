import { assertEquals } from "@std/assert";

import type { Format } from "@quarto/types";

import { engineSettings } from "../../src/engine/index.ts";

function format(
  metadata: Record<string, unknown>,
  execute: Record<string, unknown> = {},
): Format {
  return { metadata, execute } as unknown as Format;
}

Deno.test("settings come from the merged metadata, so a project can set them", () => {
  const settings = engineSettings(
    format({ "external-env": true, pyproject: 'dependencies = ["polars"]' }),
  );

  assertEquals(settings, {
    globalEval: true,
    externalEnv: true,
    pyproject: 'dependencies = ["polars"]',
  });
});

Deno.test("eval is read where Quarto resolves it", () => {
  assertEquals(engineSettings(format({}, { eval: false })).globalEval, false);
  assertEquals(engineSettings(format({}, { eval: true })).globalEval, true);
});

Deno.test("a page without settings runs in the uv sandbox", () => {
  assertEquals(engineSettings(format({})), {
    globalEval: true,
    externalEnv: false,
    pyproject: "",
  });
});
