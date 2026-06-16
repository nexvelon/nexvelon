"use client";

// PART-FIX-1 — create-mode attachments picker. The four part folders (Shop
// Drawings / Data Sheets / Manual / Misc) are usable while creating a new part:
// files are held locally and reported to the parent, which uploads them against
// the new part id after Save. (Editing uses the live AttachmentsSection on the
// detail page instead.)

import { useRef, useState } from "react";
import { FileText, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface PendingAttachment {
  folder: string;
  file: File;
}

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

export function PendingAttachments({
  folders,
  onChange,
}: {
  folders: string[];
  onChange: (items: PendingAttachment[]) => void;
}) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetFolder = useRef<string>("");

  const commit = (next: PendingAttachment[]) => {
    setItems(next);
    onChange(next);
  };

  const pickFor = (folder: string) => {
    targetFolder.current = folder;
    fileRef.current?.click();
  };

  const onFile = (file?: File) => {
    const folder = targetFolder.current;
    if (!file || !folder) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("File must be a PDF, PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("File too large. Max 20 MB.");
      return;
    }
    commit([...items, { folder, file }]);
  };

  const remove = (idx: number) => {
    commit(items.filter((_, i) => i !== idx));
  };

  return (
    <Card className="bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-base">Documents</h3>
        <span className="text-muted-foreground text-[11px]">
          Saved when you create the part
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          onFile(f);
        }}
      />

      <div className="space-y-4">
        {folders.map((folder) => {
          const files = items
            .map((it, idx) => ({ it, idx }))
            .filter((x) => x.it.folder === folder);
          return (
            <div key={folder} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                  {folder}
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => pickFor(folder)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add file
                </Button>
              </div>
              {files.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-[11px]">
                  No files yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {files.map(({ it, idx }) => (
                    <li
                      key={idx}
                      className="bg-background flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                    >
                      <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {it.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="text-muted-foreground hover:text-red-600"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
        <Upload className="h-3 w-3" />
        Files upload to the part after it&rsquo;s created.
      </p>
    </Card>
  );
}
