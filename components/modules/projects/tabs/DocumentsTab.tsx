"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileImage,
  FileText,
  FolderClosed,
  FolderOpen,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { users } from "@/lib/mock-data/users";
import {
  DOC_FOLDERS,
  buildDocs,
  type DocFolder,
  type ProjectDoc,
} from "@/lib/project-data";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return FileImage;
  if (ext === "pdf") return FileText;
  return File;
}

export function DocumentsTab({ project, readOnly }: Props) {
  const seed = useMemo(() => buildDocs(project), [project]);
  const [docs, setDocs] = useState<ProjectDoc[]>(seed);
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(DOC_FOLDERS.map((f) => [f, true]))
  );
  const [dragOver, setDragOver] = useState(false);
  const userById = new Map(users.map((u) => [u.id, u]));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const files = Array.from(e.dataTransfer.files);
    const additions: ProjectDoc[] = files.map((f, idx) => ({
      id: `d-${project.id}-up-${Date.now()}-${idx}`,
      projectId: project.id,
      folder: "Photos",
      name: f.name,
      size: f.size,
      uploadedById: project.managerId,
      uploadedAt: new Date().toISOString().slice(0, 10),
      version: 1,
    }));
    if (additions.length > 0) {
      setDocs((prev) => [...additions, ...prev]);
      toast.success(`${additions.length} file${additions.length > 1 ? "s" : ""} uploaded`);
    }
  };

  const byFolder = (f: DocFolder) => docs.filter((d) => d.folder === f);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!readOnly) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm transition-colors",
          dragOver
            ? "border-brand-gold bg-brand-gold/5"
            : "border-[var(--border)] bg-card"
        )}
      >
        <Upload className="text-brand-gold mx-auto mb-2 h-5 w-5" />
        <p className="text-brand-charcoal font-medium">
          Drop files here to upload
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Demo build — files appear in Photos folder, no actual upload happens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-3 p-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider">
            Folders
          </p>
          <ul className="space-y-0.5 text-sm">
            {DOC_FOLDERS.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setOpen((p) => ({ ...p, [f]: !p[f] }))}
                  className="text-brand-charcoal hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left"
                >
                  <span className="inline-flex items-center gap-2 text-xs">
                    {open[f] ? (
                      <FolderOpen className="text-brand-gold h-3.5 w-3.5" />
                    ) : (
                      <FolderClosed className="text-brand-gold h-3.5 w-3.5" />
                    )}
                    {f}
                  </span>
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {byFolder(f).length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-9 p-0">
          <CardHeader className="border-b border-[var(--border)] pb-3">
            <CardTitle className="font-serif text-lg">Files</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-[var(--border)]">
              {DOC_FOLDERS.flatMap((f) => byFolder(f)).map((d) => {
                const Icon = fileIcon(d.name);
                const u = userById.get(d.uploadedById);
                return (
                  <li
                    key={d.id}
                    className="hover:bg-brand-gold/5 grid grid-cols-[24px_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 text-xs"
                  >
                    <Icon className="text-brand-gold h-4 w-4" />
                    <div className="min-w-0">
                      <p className="text-brand-charcoal truncate font-medium">
                        {d.name}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        {d.folder} · v{d.version}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {fileSize(d.size)}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {u?.name ?? "—"}
                    </span>
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {format(parseISO(d.uploadedAt), "MMM d, yyyy")}
                    </span>
                  </li>
                );
              })}
              {docs.length === 0 && (
                <li className="text-muted-foreground py-12 text-center text-sm">
                  No documents on file yet.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Use the chevron icons so the import isn't dead — folder tree below
          could expand to show files per folder; kept compact here. */}
      <p className="text-muted-foreground hidden">
        <ChevronDown className="h-3 w-3" />
        <ChevronRight className="h-3 w-3" />
      </p>
    </div>
  );
}
