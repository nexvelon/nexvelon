"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  parseRichTextBody,
  serializeRichTextBody,
} from "@/lib/quote-rich-text";

// Manual Tailwind classes substitute the `prose` plugin (Chunk G note:
// @tailwindcss/typography is not installed in this repo). Mirrors the
// subset of styles the renderer cares about so the editor preview
// approximates the rendered PDF.
const EDITOR_CONTENT_CLASS = cn(
  // BUGFIX — the content font was inherited from a parent `font-serif` (Playfair
  // Display), the "fancy" font the user flagged. It's forced to Helvetica/Arial
  // in globals.css (`.nx-rich-text .ProseMirror`) so it matches the PDF's
  // rich-text render.
  "min-h-32 px-3 py-3 text-sm leading-6 focus:outline-none",
  "[&_p]:my-1",
  // RT-FIX: h1 = Big Heading, h2 = Title, h3 = Sub-body (approximates the PDF).
  "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1",
  "[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-muted-foreground [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
  "[&_li]:my-0.5",
  // BUGFIX — bold was font-semibold (600); against the content's regular weight
  // it read as barely-different. Full bold (700) makes bold vs regular obvious.
  // globals.css also pins the regular weight to 400 and strong/b to 700.
  "[&_strong]:font-bold",
  "[&_em]:italic",
);

// RT-BULLETS — three bullet styles. Disc / Circle map to real CSS
// `list-style-type` keywords; Arrow (→) is rendered via a ::before glyph in
// globals.css (`.nx-rich-text ul[data-symbol=…]`) since list-style-type has no
// arrow keyword. The chosen glyph is stored on the bulletList node's `symbol`
// attribute and drawn verbatim by the PDF (which reads node.attrs.symbol), so
// editor and PDF stay in sync.
const DEFAULT_BULLET_SYMBOL = "•";
const BULLET_STYLES: { glyph: string; label: string }[] = [
  { glyph: "•", label: "Disc" },
  { glyph: "◦", label: "Circle" },
  { glyph: "→", label: "Arrow" },
];

// RT-BULLETS — adds a `symbol` attribute to the existing StarterKit bulletList
// node (via a global attribute, so StarterKit's bulletList behaviour is kept).
// Persists in the Tiptap JSON (data-symbol round-trips through HTML); the PDF
// renderer reads node.attrs.symbol. Existing lists default to "•".
const BulletSymbol = Extension.create({
  name: "bulletSymbol",
  addGlobalAttributes() {
    return [
      {
        types: ["bulletList"],
        attributes: {
          symbol: {
            default: DEFAULT_BULLET_SYMBOL,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-symbol") || DEFAULT_BULLET_SYMBOL,
            renderHTML: (attributes: Record<string, unknown>) => {
              const sym = attributes.symbol as string | undefined;
              if (!sym || sym === DEFAULT_BULLET_SYMBOL) return {};
              return { "data-symbol": sym };
            },
          },
        },
      },
    ];
  },
});

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function RichTextEditor({ value, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Trim out marks/nodes the toolbar doesn't expose, per spec.
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
      BulletSymbol,
    ],
    content: parseRichTextBody(value),
    editable: !disabled,
    immediatelyRender: false, // SSR-safe
    onUpdate({ editor }) {
      onChange(serializeRichTextBody(editor.getJSON()));
    },
    editorProps: {
      attributes: { class: EDITOR_CONTENT_CLASS },
    },
  });

  // Sync editable flag when disabled prop changes.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Reconcile external value changes (e.g. parent re-renders with a stale
  // string). Only setContent when the parsed-then-reserialized current
  // editor content differs from value — otherwise we infinite-loop with
  // onUpdate.
  useEffect(() => {
    if (!editor) return;
    const current = serializeRichTextBody(editor.getJSON());
    const incoming = serializeRichTextBody(parseRichTextBody(value));
    if (current !== incoming) {
      editor.commands.setContent(parseRichTextBody(value), {
        emitUpdate: false,
      });
    }
  }, [value, editor]);

  // RT-BULLETS — toolbar bullet-symbol picker open state.
  const [symbolOpen, setSymbolOpen] = useState(false);

  if (!editor) {
    return (
      <div className="bg-background rounded-md border">
        <div className="border-input min-h-32 rounded-md text-muted-foreground p-3 text-xs">
          Loading editor…
        </div>
      </div>
    );
  }

  const ToolbarButton = ({
    icon: Icon,
    onClick,
    active,
    label,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    active: boolean;
    label: string;
  }) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      // RT-FIX: prevent the mousedown from blurring the editor / collapsing the
      // selection before onClick runs, so the command applies to the user's
      // selected line(s) rather than the whole box.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={cn(
        "h-7 w-7 p-0",
        active && "bg-muted text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  const Divider = () => (
    <span className="border-l border-[var(--border)] h-5 mx-1" aria-hidden />
  );

  // RT-BULLETS — ensure the current block is a bullet list, then set its glyph.
  // Selection-scoped (.focus() restores the saved selection); the picker
  // buttons preventDefault on mousedown so the selection isn't lost first.
  const applyBulletSymbol = (symbol: string) => {
    const chain = editor.chain().focus();
    if (!editor.isActive("bulletList")) chain.toggleBulletList();
    chain.updateAttributes("bulletList", { symbol }).run();
    setSymbolOpen(false);
  };

  const activeBulletSymbol = editor.isActive("bulletList")
    ? (editor.getAttributes("bulletList").symbol as string) ||
      DEFAULT_BULLET_SYMBOL
    : DEFAULT_BULLET_SYMBOL;

  return (
    <div className="nx-rich-text bg-background rounded-md border border-[var(--border)] overflow-hidden">
      <div className="border-b border-[var(--border)] bg-muted/30 flex items-center gap-0.5 px-2 py-1">
        {/* RT-FIX: named style selector — Big Heading / Title / Body /
            Sub-body, mapped to heading levels 1/2/3 + paragraph. Each SETS the
            block type on the current selection (selection-scoped). */}
        <ToolbarButton
          icon={Heading1}
          onClick={() =>
            editor.chain().focus().setHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          label="Big Heading"
        />
        <ToolbarButton
          icon={Heading2}
          onClick={() =>
            editor.chain().focus().setHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          label="Title"
        />
        <ToolbarButton
          icon={Pilcrow}
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph")}
          label="Body"
        />
        <ToolbarButton
          icon={Heading3}
          onClick={() =>
            editor.chain().focus().setHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          label="Sub-body"
        />
        <Divider />
        <ToolbarButton
          icon={Bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          label="Bold"
        />
        <ToolbarButton
          icon={Italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          label="Italic"
        />
        <Divider />
        <ToolbarButton
          icon={List}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          label="Bullet list"
        />
        <ToolbarButton
          icon={ListOrdered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          label="Numbered list"
        />

        {/* RT-BULLETS — bullet-symbol picker. Trigger shows the active list's
            glyph; the popover's inner buttons preventDefault on mousedown so the
            editor selection survives (consistent with RT-FIX). */}
        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSymbolOpen((o) => !o)}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={symbolOpen}
            title="Bullet symbol"
            aria-label="Bullet symbol"
            className="h-7 min-w-7 px-1 text-sm"
          >
            {activeBulletSymbol}
          </Button>
          {symbolOpen && !disabled && (
            <>
              <div
                className="fixed inset-0 z-10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSymbolOpen(false);
                }}
                aria-hidden
              />
              <div
                role="menu"
                className="bg-background absolute left-0 top-full z-20 mt-1 flex gap-0.5 rounded-md border border-[var(--border)] p-1 shadow-md"
              >
                {BULLET_STYLES.map(({ glyph, label }) => (
                  <button
                    key={glyph}
                    type="button"
                    role="menuitem"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyBulletSymbol(glyph)}
                    title={label}
                    aria-label={`${label} bullets`}
                    className={cn(
                      "hover:bg-muted flex h-7 items-center gap-1.5 rounded px-2 text-sm",
                      glyph === activeBulletSymbol &&
                        editor.isActive("bulletList") &&
                        "bg-muted text-foreground"
                    )}
                  >
                    <span aria-hidden>{glyph}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
