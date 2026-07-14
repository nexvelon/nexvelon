"use client";

// PROJ2-4b — interactive folder tree. Left pane: the tree (indented by depth).
// Right pane: files in the selected folder (or the synthetic "Unfiled" node).
// All mutations route through folder-actions (projects:edit); reads/render are
// hydrated by the server wrapper. Kept functional, not fancy — the Job-detail
// polish is PROJ2-4d.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Folder,
  FolderArchive,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  FileText,
  FolderInput,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import { downloadAttachment } from "@/lib/attachments/download-client";
import {
  createUserFolderAction,
  renameFolderAction,
  deleteFolderAction,
  countFolderContentsAction,
  createFolderAttachmentAction,
  moveFileToFolderAction,
  renameAttachmentAction,
  deleteFolderAttachmentAction,
} from "@/app/(app)/attachments/folder-actions";
import type { DbAttachmentFolder, DbAttachment } from "@/lib/types/database";

const UNFILED = "__unfiled__";

function fmtSize(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function folderIcon(kind: string) {
  if (kind === "project_container") return FolderOpen;
  if (kind === "existing_files") return FolderArchive;
  return Folder;
}

export function FolderTreeClient({
  folders,
  files,
  unfiled,
  canEdit,
}: {
  folders: DbAttachmentFolder[];
  files: DbAttachment[];
  unfiled: DbAttachment[];
  canEdit: boolean;
}) {
  const router = useRouter();

  // Build the tree.
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, DbAttachmentFolder[]>();
    for (const f of folders) {
      const key = f.parent_id && folderIds.has(f.parent_id) ? f.parent_id : "__root__";
      const arr = m.get(key) ?? [];
      arr.push(f);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return m;
  }, [folders, folderIds]);

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const [selected, setSelected] = useState<string>(
    () => childrenOf.get("__root__")?.[0]?.id ?? UNFILED
  );

  const filesByFolder = useMemo(() => {
    const m = new Map<string, DbAttachment[]>();
    for (const a of files) {
      if (!a.folder_id) continue;
      const arr = m.get(a.folder_id) ?? [];
      arr.push(a);
      m.set(a.folder_id, arr);
    }
    return m;
  }, [files]);

  const shownFiles = selected === UNFILED ? unfiled : filesByFolder.get(selected) ?? [];
  const selectedFolder = selected === UNFILED ? null : byId.get(selected) ?? null;

  // ── dialogs ──
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renOpen, setRenOpen] = useState(false);
  const [renName, setRenName] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [delCount, setDelCount] = useState<{ fileCount: number; subfolderCount: number } | null>(null);
  const [fileRen, setFileRen] = useState<DbAttachment | null>(null);
  const [fileRenName, setFileRenName] = useState("");
  const [fileMove, setFileMove] = useState<DbAttachment | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function refresh() {
    router.refresh();
  }

  async function download(a: DbAttachment) {
    try {
      // SAFARI-FIX follow-up — server-signed URL + anchor click; no browser
      // supabase-js (its auth lock deadlocked Safari, same as uploads in #310).
      const res = await downloadAttachment({ attachmentId: a.id });
      if (!res.ok) toast.error(res.error);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedFolder) return;
    setBusy(true);
    try {
      // SAFARI-FIX — signed-URL flow (no supabase-js on the client upload path).
      const up = await uploadViaSignedUrl({
        entityType: "folder",
        entityId: selectedFolder.id,
        file,
      });
      if (!up.ok) throw new Error(up.error);
      const res = await createFolderAttachmentAction({
        folderId: selectedFolder.id,
        file: {
          path: up.path,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Uploaded");
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    if (!selectedFolder) return;
    setBusy(true);
    const res = await createUserFolderAction({ parentId: selectedFolder.id, name: newName });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Folder created");
    setNewOpen(false);
    setNewName("");
    refresh();
  }

  async function renameSelected() {
    if (!selectedFolder) return;
    setBusy(true);
    const res = await renameFolderAction({ folderId: selectedFolder.id, newName: renName });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Renamed");
    setRenOpen(false);
    refresh();
  }

  async function openDelete() {
    if (!selectedFolder) return;
    setDelCount(null);
    setDelOpen(true);
    const res = await countFolderContentsAction(selectedFolder.id);
    if (res.ok) setDelCount(res.data);
  }

  async function confirmDelete() {
    if (!selectedFolder) return;
    setBusy(true);
    const res = await deleteFolderAction(selectedFolder.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Folder deleted");
    setDelOpen(false);
    setSelected(childrenOf.get("__root__")?.[0]?.id ?? UNFILED);
    refresh();
  }

  async function renameFile() {
    if (!fileRen) return;
    setBusy(true);
    const res = await renameAttachmentAction({ attachmentId: fileRen.id, filename: fileRenName });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Renamed");
    setFileRen(null);
    refresh();
  }

  async function deleteFile(a: DbAttachment) {
    const res = await deleteFolderAttachmentAction(a.id);
    if (!res.ok) return toast.error(res.error);
    toast.success("Deleted");
    refresh();
  }

  async function moveFile() {
    if (!fileMove || !moveTarget) return;
    setBusy(true);
    const res = await moveFileToFolderAction({ attachmentId: fileMove.id, folderId: moveTarget });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Moved");
    setFileMove(null);
    setMoveTarget("");
    refresh();
  }

  // Render one tree node + its descendants.
  function renderNode(f: DbAttachmentFolder, depth: number) {
    const Icon = folderIcon(f.kind);
    const kids = childrenOf.get(f.id) ?? [];
    return (
      <div key={f.id}>
        <button
          type="button"
          onClick={() => setSelected(f.id)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors",
            selected === f.id ? "bg-brand-navy/10 text-brand-navy" : "hover:bg-muted text-brand-charcoal"
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0", f.kind === "default_subfolder" ? "text-muted-foreground" : "text-brand-gold")} />
          <span className={cn("truncate", (f.kind === "project_container" || f.kind === "main_job") && "font-semibold")}>
            {f.name}
          </span>
        </button>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  }

  const roots = childrenOf.get("__root__") ?? [];

  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,300px)_1fr]">
        {/* Left — tree */}
        <div className="max-h-[560px] overflow-y-auto border-b border-[var(--border)] p-2 md:border-b-0 md:border-r">
          {roots.map((r) => renderNode(r, 0))}
          {unfiled.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(UNFILED)}
              className={cn(
                "mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs",
                selected === UNFILED ? "bg-brand-navy/10 text-brand-navy" : "hover:bg-muted text-muted-foreground"
              )}
            >
              <FolderInput className="h-3.5 w-3.5" />
              Unfiled ({unfiled.length})
            </button>
          )}
        </div>

        {/* Right — files */}
        <div className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-brand-navy flex items-center gap-1 text-sm font-semibold">
              {selected === UNFILED ? (
                "Unfiled files"
              ) : (
                <>
                  {selectedFolder?.name}
                  {selectedFolder?.is_system ? (
                    <span className="text-muted-foreground text-[10px] font-normal">(default)</span>
                  ) : null}
                </>
              )}
            </p>
            {canEdit && selectedFolder && (
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Upload
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setNewName(""); setNewOpen(true); }}>
                  <FolderPlus className="mr-1 h-3.5 w-3.5" /> New folder
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setRenName(selectedFolder.name); setRenOpen(true); }}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Rename
                </Button>
                <Button type="button" size="sm" variant="outline" className="text-red-600" onClick={openDelete}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            )}
          </div>
          <input ref={fileInput} type="file" hidden onChange={onUpload} />

          {shownFiles.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-xs">No files here yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {shownFiles.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-charcoal truncate text-xs">{a.filename}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {fmtSize(a.size_bytes)} · {format(parseISO(a.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => download(a)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setFileRen(a); setFileRenName(a.filename); }}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setFileMove(a); setMoveTarget(""); }}>
                          <FolderInput className="mr-2 h-3.5 w-3.5" /> Move to…
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteFile(a)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* New folder */}
      <SimpleDialog open={newOpen} onClose={() => setNewOpen(false)} title="New folder" onConfirm={createFolder} busy={busy} confirmLabel="Create">
        <Label className="text-xs">Folder name</Label>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. RFIs" autoFocus />
      </SimpleDialog>

      {/* Rename folder */}
      <SimpleDialog open={renOpen} onClose={() => setRenOpen(false)} title="Rename folder" onConfirm={renameSelected} busy={busy} confirmLabel="Save">
        <Label className="text-xs">Folder name</Label>
        <Input value={renName} onChange={(e) => setRenName(e.target.value)} autoFocus />
      </SimpleDialog>

      {/* Delete folder confirm */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete folder &ldquo;{selectedFolder?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              {delCount == null
                ? "Checking contents…"
                : delCount.fileCount === 0 && delCount.subfolderCount === 0
                  ? "Delete this empty folder?"
                  : `This folder contains ${delCount.fileCount} file(s) across ${delCount.subfolderCount} subfolder(s). Files will remain in the system as unfiled and can be re-organized. Subfolders will be deleted permanently.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDelOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete} disabled={busy || delCount == null}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename file */}
      <SimpleDialog open={!!fileRen} onClose={() => setFileRen(null)} title="Rename file" onConfirm={renameFile} busy={busy} confirmLabel="Save">
        <Label className="text-xs">Filename</Label>
        <Input value={fileRenName} onChange={(e) => setFileRenName(e.target.value)} autoFocus />
      </SimpleDialog>

      {/* Move file */}
      <Dialog open={!!fileMove} onOpenChange={(o) => !o && setFileMove(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
            <DialogDescription>Choose a destination folder.</DialogDescription>
          </DialogHeader>
          <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Select folder…" /></SelectTrigger>
            <SelectContent>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFileMove(null)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={moveFile} disabled={busy || !moveTarget}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SimpleDialog({
  open,
  onClose,
  title,
  children,
  onConfirm,
  busy,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  busy: boolean;
  confirmLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>{busy ? "…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
