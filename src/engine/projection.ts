import {
  type CompiledMarimoCell,
  type CompiledMarimoPage,
  encodePageCellPayload,
  type MarimoPageSerializedCellPayload,
  projectPageCellPayloads,
} from "@marimo-team/mdx-marimo/bridge/protocol";

import type { StaticMarimoOutput } from "./process.ts";
import { MARIMO_ELEMENT_NAME } from "../island-element.ts";

/** A cell's read-only source, carried alongside the island payload. */
export type MarimoAuthorSource = {
  code: string;
  language: string;
  fold: boolean | "show";
  summary: string | null;
};

type CellWithAuthorSource = CompiledMarimoCell & {
  authorSource?: MarimoAuthorSource;
};

export function projectInteractivePage(page: CompiledMarimoPage): string[] {
  const cells = page.cells as CellWithAuthorSource[];
  const sources = cells.map((cell) => cell.authorSource);
  // Keep the source out of the island payload: Quarto renders it as its own
  // code block, so embedding it again would ship every line twice.
  const payloadPage: CompiledMarimoPage = {
    ...page,
    cells: cells.map(({ authorSource: _authorSource, ...cell }) => cell),
  };
  return projectPageCellPayloads(payloadPage).map((payload, index) => {
    const source = sources[index];
    const code = source ? authorSourceBlock(source) : "";
    return code + (payload ? rawHtml(renderIsland(payload)) : "");
  });
}

function authorSourceBlock(source: MarimoAuthorSource): string {
  // `.cell-code` is what Quarto's code folding keys on; without it `code-fold`
  // is inert, and with it an unfolded block renders exactly as a plain one.
  const attributes = [`.${source.language}`, ".cell-code"];
  if (source.fold) {
    attributes.push(`code-fold="${source.fold === "show" ? "show" : "true"}"`);
  }
  if (source.summary) {
    attributes.push(`code-summary="${escapeAttribute(source.summary)}"`);
  }
  return fencedCode(source.code, `{${attributes.join(" ")}}`);
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function projectStaticPage(
  outputs: StaticMarimoOutput[],
  htmlToMarkdown: (html: string) => Promise<string>,
): Promise<string[]> {
  return await Promise.all(
    outputs.map((output) => renderStaticOutput(output, htmlToMarkdown)),
  );
}

export function validateProjectionCount(
  projected: readonly unknown[],
  actualCellCount: number,
): void {
  if (projected.length !== actualCellCount) {
    throw new Error(
      `marimo compiler returned ${projected.length} cells for ${actualCellCount} source blocks`,
    );
  }
}

function renderIsland(payload: MarimoPageSerializedCellPayload): string {
  return [
    `<${MARIMO_ELEMENT_NAME}`,
    ` data-marimo-payload="${encodePageCellPayload(payload)}"`,
    ' data-marimo-payload-encoding="base64url"',
    ' data-marimo-theme-mode="auto"',
    `></${MARIMO_ELEMENT_NAME}>`,
  ].join("");
}

async function renderStaticOutput(
  output: StaticMarimoOutput,
  htmlToMarkdown: (html: string) => Promise<string>,
): Promise<string> {
  let result = "";
  if (output.displayCode && output.code) {
    result += authorSourceBlock({
      code: output.code,
      language: output.language,
      fold: output.fold,
      summary: output.summary,
    });
  }
  if (!output.value) return result;

  switch (output.type) {
    case "figure":
      return `${result}![Generated Figure](<${output.value}>)\n\n`;
    case "para":
      return `${result}${output.value}\n\n`;
    case "plain":
      return `${result}${fencedCode(output.value)}`;
    case "blockquote":
      return `${result}> ${output.value.replace(/\r?\n/g, "\n> ")}\n\n`;
    case "html":
      if (/<table[\s>]/i.test(output.value)) {
        return `${result}${rawHtml(output.value)}`;
      }
      return `${result}${await htmlToMarkdown(output.value)}\n\n`;
  }
}

function fencedCode(value: string, language = ""): string {
  const longestRun = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${value}\n${fence}\n\n`;
}

function rawHtml(value: string): string {
  return fencedCode(value, "{=html}");
}
