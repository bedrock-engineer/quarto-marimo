import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";

import type {
  CompiledMarimoCell,
  CompiledMarimoPage,
} from "@marimo-team/mdx-marimo/bridge/protocol";

import {
  projectInteractivePage,
  projectStaticPage,
  validateProjectionCount,
} from "../../src/engine/projection.ts";

const options = {
  language: "python" as const,
  render: {
    source: false,
    output: true,
    include: true,
    editor: false,
    error: true,
    serverOutput: true,
  },
  execution: { enabled: true },
  marimo: { disabled: false, unparsable: false },
};

function cell(index: number): CompiledMarimoCell {
  return {
    index,
    html: `<marimo-island data-cell-id="${index}"></marimo-island>`,
    options,
    output: {
      mimetype: "text/plain",
      data: `output ${index}`,
      html: `<p>output ${index}</p>`,
    },
  };
}

function page(): CompiledMarimoPage {
  return {
    protocolVersion: 2,
    app: {
      id: "marimo-page",
      runtimeCellCount: 2,
      assets: { moduleScripts: [], links: [] },
    },
    cells: [cell(0), cell(1)],
    diagnostics: [],
  };
}

Deno.test("projects one app carrier followed by cell references", () => {
  const projected = projectInteractivePage(page());
  const first = decodePayload(projected[0]);
  const second = decodePayload(projected[1]);

  assertEquals(first.app?.id, "marimo-page");
  assertEquals(first.cell.index, 0);
  assertEquals(second.appId, "marimo-page");
  assertEquals(second.cell.index, 1);
  assertEquals("output" in first.cell, false);
  assertEquals("output" in second.cell, false);
});

Deno.test("preserves verbatim source and plain-text output", async () => {
  const projected = await projectStaticPage(
    [
      {
        type: "plain",
        value: "# Result\n*literal*",
        displayCode: true,
        code: 'value = "```"',
        language: "python",
        fold: false,
        summary: null,
      },
    ],
    (html) => Promise.resolve(html),
  );

  assertStringIncludes(
    projected[0],
    '````{.python .cell-code}\nvalue = "```"\n````',
  );
  assertStringIncludes(projected[0], "```\n# Result\n*literal*\n```");
});

Deno.test("keeps multiline static errors in one blockquote", async () => {
  const [projected] = await projectStaticPage(
    [{
      type: "blockquote",
      value: "First line\nSecond line",
      displayCode: false,
      code: "",
      language: "python",
      fold: false,
      summary: null,
    }],
    (html) => Promise.resolve(html),
  );

  assertStringIncludes(projected, "> First line\n> Second line");
});

Deno.test("preserves Markdown characters in figure destinations", async () => {
  const [projected] = await projectStaticPage(
    [{
      type: "figure",
      value: "plots/result (final).png",
      displayCode: false,
      code: "",
      language: "python",
      fold: false,
      summary: null,
    }],
    (html) => Promise.resolve(html),
  );

  assertStringIncludes(
    projected,
    "![Generated Figure](<plots/result (final).png>)",
  );
});

Deno.test("uses a raw HTML fence longer than its content", async () => {
  const [projected] = await projectStaticPage(
    [{
      type: "html",
      value: "<table><tr><td>```</td></tr></table>",
      displayCode: false,
      code: "",
      language: "python",
      fold: false,
      summary: null,
    }],
    (html) => Promise.resolve(html),
  );

  assertStringIncludes(
    projected,
    "````{=html}\n<table><tr><td>```</td></tr></table>\n````",
  );
});

Deno.test("preserves non-table html output when preserveHtml is true", async () => {
  const [projected] = await projectStaticPage(
    [{
      type: "html",
      value: '<span class="highlight">colored</span>',
      displayCode: false,
      code: "",
      language: "python",
    }],
    (html) => Promise.resolve(html),
    true,
  );

  assertStringIncludes(projected, "{=html}");
  assertStringIncludes(projected, '<span class="highlight">colored</span>');
});

Deno.test("rejects mismatched compiler and source cell counts", () => {
  assertThrows(
    () => validateProjectionCount(["one"], 2),
    Error,
    "returned 1 cells for 2 source blocks",
  );
});

function decodePayload(markdown: string): {
  app?: { id: string };
  appId?: string;
  cell: { index: number; output?: unknown };
} {
  const match = markdown.match(/data-marimo-payload="([^"]+)"/);
  if (!match) throw new Error("missing marimo payload");
  const base64 = match[1].replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (value) => value.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

Deno.test("emits the author source as a foldable Quarto code block", () => {
  const source = page();
  (source.cells[0] as CompiledMarimoCell & { authorSource: unknown })
    .authorSource = {
      code: "value = 41 + 1",
      language: "python",
      fold: "show",
      summary: 'The "arithmetic"',
    };

  const projected = projectInteractivePage(source);

  assertStringIncludes(
    projected[0],
    '```{.python .cell-code code-fold="show" code-summary="The \\"arithmetic\\""}',
  );
  assertStringIncludes(projected[0], "value = 41 + 1");
  // The code block precedes the island rather than living inside it.
  assertEquals(
    projected[0].indexOf("```{.python") < projected[0].indexOf("{=html}"),
    true,
  );
  // Cells without an author source are untouched.
  assertEquals(projected[1].startsWith("```{=html}"), true);
});

Deno.test("keeps the author source out of the island payload", () => {
  const source = page();
  (source.cells[0] as CompiledMarimoCell & { authorSource: unknown })
    .authorSource = {
      code: "secret = 1",
      language: "python",
      fold: false,
      summary: null,
    };

  const projected = projectInteractivePage(source);
  const payload = decodePayload(projected[0]);

  assertEquals("authorSource" in payload.cell, false);
  assertStringIncludes(projected[0], "```{.python .cell-code}\nsecret = 1");
});

Deno.test("folds static source the way a page does", async () => {
  const [projected] = await projectStaticPage(
    [{
      type: "plain",
      value: "1",
      displayCode: true,
      code: "value = 1",
      language: "python",
      fold: true,
      summary: "Setup",
    }],
    (html) => Promise.resolve(html),
  );

  assertStringIncludes(
    projected,
    '```{.python .cell-code code-fold="true" code-summary="Setup"}\nvalue = 1\n```',
  );
});
