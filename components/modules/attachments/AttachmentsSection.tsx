"use client";

// ATTACH-1 — reusable attachments panel for any entity. Renders files grouped by
// folder (predefined ∪ folders present in data ∪ client-added when allowed),
// with per-folder upload and per-file download (signed URL) / delete. Storage
// objects upload client-side; DB rows + object deletion go through the
// attachments server actions.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteAttachmentObject,
  getSignedAttachmentUrl,
  uploadAttachmentObject,
} from "@/lib/api/attachments";
import {
  createAttachment,
  deleteAttachment,
  listAttachments,
} from "@/app/(app)/attachments/actions";
import type { DbAttachment } from "@/lib/types/database";

interface Props {
  entityType: string;
  entityId: string;
  folders?: string[];
  allowCustomFolders?: boolean;
  title?: string;
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsSection({
  entityType,
  entityId,
  folders = [],
  allowCustomFolders = false,
  title = "Attachments",
}: Props) {
  const [rows, setRows] = useState<DbAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [uploadingFolder, setUploadingFolder] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DbAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newFolder, setNewFolder] = useState("");

  // BUGFIX — one hidden <input> PER folder (keyed by folder name), each rendered
  // next to its own Upload button. Previously a single shared input was routed
  // via a mutable `targetFolder` ref; that indirection left the product
  // Documents Upload buttons opening no picker. Each button now clicks its own
  // input directly — no shared node, no routing.
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const reload = useCallback(async () => {
    const res = await listAttachments(entityType, entityId);
    if (res.ok) setRows(res.data);
    else toast.error(res.error);
  }, [entityType, entityId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listAttachments(entityType, entityId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setRows(res.data);
        else toast.error(res.error);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  // Folders to render: predefined ∪ present-in-data ∪ client-added.
  const folderList = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of [...folders, ...rows.map((r) => r.folder), ...extraFolders]) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    return out;
  }, [folders, rows, extraFolders]);

  const byFolder = useMemo(() => {
    const map = new Map<string, DbAttachment[]>();
    for (const r of rows) {
      const list = map.get(r.folder);
      if (list) list.push(r);
      else map.set(r.folder, [r]);
    }
    return map;
  }, [rows]);

  // DIAGNOSTIC — every step of the upload path logs with the "[upload]" prefix
  // so a DevTools filter on "[upload]" shows the full sequence. The first log
  // that DOESN'T appear pinpoints the failing step (see the interpretation
  // guide in the investigation PR).
  const openPicker = (folder: string) => {
    const hasRef = !!inputRefs.current[folder];
    console.info(
      `[upload] button clicked (folder="${folder}", hasRef=${hasRef})`
    );
    if (!hasRef) {
      console.error(
        `[upload] NO file input ref for folder "${folder}" — wiring broken`
      );
      return;
    }
    console.info(`[upload] triggering file input click (folder="${folder}")`);
    inputRefs.current[folder]?.click();
  };

  const handleUpload = async (folder: string, file?: File) => {
    console.info(
      `[upload] file selected (folder="${folder}", name="${
        file?.name ?? "(none)"
      }", size=${file?.size ?? 0}, type="${file?.type ?? ""}")`
    );
    if (!file) return;
    setUploadingFolder(folder);
    try {
      const obj = await uploadAttachmentObject(entityType, entityId, file);
      console.info(
        `[upload] calling createAttachment action (entity=${entityType}/${entityId}, folder="${folder}", path="${obj.path}")`
      );
      const res = await createAttachment(entityType, entityId, folder, {
        path: obj.path,
        filename: obj.filename,
        contentType: obj.contentType,
        size: obj.size,
      });
      if (!res.ok) {
        console.error("[upload] createAttachment FAILED", res.error);
        // Roll back the orphaned object if the DB row failed.
        await deleteAttachmentObject(obj.path).catch(() => {});
        throw new Error(res.error);
      }
      console.info("[upload] createAttachment succeeded", res.data);
      toast.success(`Uploaded ${obj.filename}`);
      console.info("[upload] refetching attachments");
      await reload();
    } catch (e) {
      console.error("[upload] upload flow failed", e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      console.info(`[upload] spinner reset (folder="${folder}")`);
      setUploadingFolder(null);
    }
  };

  const handleDownload = async (att: DbAttachment) => {
    try {
      const url = await getSignedAttachmentUrl(att.path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open file");
    }
  };

  const performDelete = () => {
    if (!confirmDelete) return;
    const att = confirmDelete;
    setDeleting(true);
    deleteAttachment(att.id).then((res) => {
      setDeleting(false);
      if (res.ok) {
        setConfirmDelete(null);
        toast.success("Attachment deleted");
        void reload();
      } else {
        toast.error(res.error);
      }
    });
  };

  const addFolder = () => {
    const name = newFolder.trim();
    if (name === "" || folderList.includes(name)) {
      setNewFolder("");
      return;
    }
    setExtraFolders((f) => [...f, name]);
    setNewFolder("");
  };

  return (
    <Card className="bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-base">{title}</h3>
        {allowCustomFolders && (
          <div className="flex items-center gap-1.5">
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFolder();
                }
              }}
              placeholder="New folder…"
              className="h-8 w-40 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addFolder}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Folder
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground py-4 text-center text-sm">Loading…</p>
      ) : folderList.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          No folders configured.
        </p>
      ) : (
        <div className="space-y-4">
          {folderList.map((folder) => {
            const files = byFolder.get(folder) ?? [];
            const uploading = uploadingFolder === folder;
            return (
              <div key={folder} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                    {folder}
                  </h4>
                  {/* This folder's OWN hidden input, clicked directly by the
                      button below. §4c resets value so re-picking the same file
                      still fires onChange. */}
                  <input
                    ref={(el) => {
                      inputRefs.current[folder] = el;
                    }}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      handleUpload(folder, f);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={uploading}
                    onClick={() => openPicker(folder)}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-3.5 w-3.5" />
                    )}
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>

                {files.length === 0 ? (
                  <p className="text-muted-foreground rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-[11px]">
                    No files yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {files.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-background px-3 py-1.5 text-xs"
                      >
                        <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {att.filename}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {formatBytes(att.size_bytes)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleDownload(att)}
                          aria-label="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                          onClick={() => setConfirmDelete(att)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete attachment?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.filename} will be permanently deleted. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={performDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
