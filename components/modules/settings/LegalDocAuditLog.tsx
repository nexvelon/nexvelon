"use client";

// POLISH-17 — append-only audit log for the locked legal documents. Shows every
// edit/restore newest-first with filters, an inline word-diff, copy-to-clipboard,
// view-full-text, and restore-with-confirmation. There is intentionally NO delete
// affordance — the log is append-only. Admin-only (server actions re-check).

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRole } from "@/lib/role-context";
import {
  getAuditLogAction,
  restoreLegalDocumentAction,
  deleteAuditEntryAction,
} from "@/app/(app)/settings/settings-audit-actions";
import type { DbSettingsAuditRow } from "@/lib/api/settings-audit";
import { wordDiff } from "@/lib/word-diff";
import { businessDateTime } from "@/lib/format";
import {
  LEGAL_DOC_KEY_INTEGRATED,
  LEGAL_DOC_KEY_GUARDIAN,
  LEGAL_DOC_NAMES,
  LEGAL_DOC_SHORT,
} from "@/lib/legal-doc-keys";

function DiffView({ before, after }: { before: string; after: string }) {
  const chunks = wordDiff(before ?? "", after ?? "");
  return (
    <div className="mt-2 max-h-72 overflow-auto rounded-md border border-[var(--border)] bg-white p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
      {chunks.map((c, i) =>
        c.type === "equal" ? (
          <span key={i} className="text-brand-charcoal">
            {c.value}
          </span>
        ) : c.type === "add" ? (
          <span key={i} style={{ background: "#dcfce7", color: "#166534" }}>
            {c.value}
          </span>
        ) : (
          <span
            key={i}
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              textDecoration: "line-through",
            }}
          >
            {c.value}
          </span>
        )
      )}
    </div>
  );
}

export function LegalDocAuditLog({
  reloadKey = 0,
  onRestored,
}: {
  reloadKey?: number;
  onRestored?: () => void;
}) {
  const { role } = useRole();
  const [rows, setRows] = useState<DbSettingsAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKey, setFilterKey] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<DbSettingsAuditRow | null>(null);
  const [restoreRow, setRestoreRow] = useState<DbSettingsAuditRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<DbSettingsAuditRow | null>(null);
  const [pending, startAction] = useTransition();

  const reload = useCallback(() => {
    if (role !== "Admin") return;
    setLoading(true);
    getAuditLogAction({
      settingKey: filterKey === "all" ? null : filterKey,
      from: from ? `${from}T00:00:00` : null,
      to: to ? `${to}T23:59:59` : null,
    })
      .then((res) => {
        if (res.ok) setRows(res.data);
        else toast.error(res.error);
      })
      .catch(() => toast.error("Failed to load the audit log."))
      .finally(() => setLoading(false));
  }, [role, filterKey, from, to]);

  useEffect(() => {
    reload();
  }, [reload, reloadKey]);

  if (role !== "Admin") return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't access the clipboard.");
    }
  };

  const confirmRestore = () => {
    if (!restoreRow) return;
    const id = restoreRow.id;
    startAction(async () => {
      const res = await restoreLegalDocumentAction(id);
      setRestoreRow(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Restored. The previous version is in the audit log.");
      onRestored?.();
      reload();
    });
  };

  // POLISH-30 — admin hard-delete of a single version (confirmed, permanent).
  const confirmDelete = () => {
    if (!deleteRow) return;
    const id = deleteRow.id;
    startAction(async () => {
      const res = await deleteAuditEntryAction(id);
      setDeleteRow(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Audit entry deleted.");
      // Optimistic remove + reload to stay consistent.
      setRows((prev) => prev.filter((r) => r.id !== id));
      reload();
    });
  };

  return (
    <Card className="bg-card p-6 shadow-sm">
      <h4 className="text-brand-navy font-serif text-base">
        Terms &amp; Conditions History
      </h4>
      <p className="text-muted-foreground mt-1 text-[11px]">
        Every edit and restore is permanently logged. Click any entry to view the
        diff, copy the text, or restore that version.
      </p>

      {/* Filters */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-muted-foreground text-[11px]">Document</Label>
          <Select value={filterKey} onValueChange={(v) => setFilterKey(v ?? "all")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              <SelectItem value={LEGAL_DOC_KEY_INTEGRATED}>Integrated</SelectItem>
              <SelectItem value={LEGAL_DOC_KEY_GUARDIAN}>Guardian</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Entries — card-per-row (reads cleanly on desktop + mobile). */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          <p className="text-muted-foreground text-xs">Loading history…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No changes recorded yet for the selected filters.
          </p>
        ) : (
          rows.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="rounded-md border border-[var(--border)] p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "#0A1226",
                      color: "#FBF8F1",
                    }}
                  >
                    {LEGAL_DOC_SHORT[r.setting_key] ?? r.setting_key}
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{
                      borderColor: r.action_type === "restore" ? "#B8924B" : "var(--border)",
                      color: r.action_type === "restore" ? "#8A6A2E" : "#5C5240",
                    }}
                  >
                    {r.action_type === "restore" ? "Restore" : "Edit"}
                  </span>
                  <span className="text-brand-charcoal text-xs tabular-nums">
                    {businessDateTime(r.edited_at)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {r.edited_by_name ?? "Unknown"}
                    {r.edited_by_email ? ` · ${r.edited_by_email}` : ""}
                  </span>
                </div>

                {r.change_summary && (
                  <p className="text-brand-charcoal mt-1.5 text-xs">
                    {r.change_summary}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                  >
                    {expanded ? "Hide diff" : "View diff"}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setViewRow(r)}>
                    View full text
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => copy(r.after_text)}
                  >
                    Copy
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="text-brand-navy border-brand-navy/30"
                    onClick={() => setRestoreRow(r)}
                    disabled={pending}
                  >
                    Restore this version
                  </Button>
                  {/* POLISH-30 — admin per-version hard delete (serious but not
                      dominant: subtle red, last in the row). */}
                  <Button
                    size="xs"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:text-red-700"
                    onClick={() => setDeleteRow(r)}
                    disabled={pending}
                  >
                    Delete
                  </Button>
                </div>

                {expanded && (
                  <DiffView before={r.before_text ?? ""} after={r.after_text} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* View full text */}
      <Dialog open={viewRow !== null} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {viewRow ? LEGAL_DOC_NAMES[viewRow.setting_key] ?? "Document" : ""}
            </DialogTitle>
            <DialogDescription>
              {viewRow?.change_summary ?? ""}
              {viewRow ? ` · ${businessDateTime(viewRow.edited_at)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-[var(--border)] bg-muted/30 p-4">
            <p className="text-brand-charcoal whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
              {viewRow?.after_text ?? ""}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <Dialog
        open={restoreRow !== null}
        onOpenChange={(o) => !o && setRestoreRow(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Restore this version of{" "}
              {restoreRow ? LEGAL_DOC_NAMES[restoreRow.setting_key] ?? "the document" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will REPLACE your existing T&amp;C with this older version. The
              current version will be saved in the audit log so you can revert back
              if needed. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreRow(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={confirmRestore} disabled={pending}>
              {pending ? "Restoring…" : "Yes, Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POLISH-30 — delete confirmation */}
      <Dialog open={deleteRow !== null} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Delete this audit log entry?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this version from the history? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteRow(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
