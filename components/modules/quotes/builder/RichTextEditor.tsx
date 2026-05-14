"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
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
  "min-h-32 px-3 py-3 text-sm leading-6 focus:outline-none",
  "[&_p]:my-1",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
  "[&_li]:my-0.5",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
);

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function RichTextEditor({ value, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Trim out marks/nodes the toolbar doesn't expose, per spec.
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
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

  return (
    <div className="bg-background rounded-md border border-[var(--border)] overflow-hidden">
      <div className="border-b border-[var(--border)] bg-muted/30 flex items-center gap-0.5 px-2 py-1">
        <ToolbarButton
          icon={Pilcrow}
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph") && !editor.isActive("heading")}
          label="Paragraph"
        />
        <ToolbarButton
          icon={Heading2}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          label="Heading 2"
        />
        <ToolbarButton
          icon={Heading3}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          label="Heading 3"
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
