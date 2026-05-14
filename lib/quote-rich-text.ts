// Helpers for the rich-text body of Custom quote schedules.
// Bodies are stored as JSON-stringified Tiptap documents.
// Plain-text bodies (legacy or empty) are auto-wrapped as paragraph nodes
// on parse, so the editor and renderer can always assume a structured doc.

import type { JSONContent } from "@tiptap/core";

export type RichTextDocument = JSONContent;

export const EMPTY_RICH_TEXT_DOCUMENT: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function parseRichTextBody(body: string): RichTextDocument {
  if (!body) return EMPTY_RICH_TEXT_DOCUMENT;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed as RichTextDocument;
    }
  } catch {
    /* fall through to plain-text wrap */
  }
  const lines = body.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

export function serializeRichTextBody(doc: RichTextDocument): string {
  return JSON.stringify(doc);
}

export function isRichTextEmpty(doc: RichTextDocument): boolean {
  if (!doc.content || doc.content.length === 0) return true;
  return doc.content.every((node) => {
    if (!node.content || node.content.length === 0) return true;
    return node.content.every((child) =>
      child.type === "text" ? !(child.text ?? "").trim() : false
    );
  });
}
