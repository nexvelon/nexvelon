"use client";

import { useState } from "react";
import { Lock, Pencil, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Can, useRole } from "@/lib/role-context";
import { cn } from "@/lib/utils";

interface NotesProps {
  terms: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  // TERMS-LOCK-DIFF: the resolved STANDARD terms for the quote's template
  // (settings-saved default or in-code fallback), used to derive the admin-only
  // Modified Terms diff. Display-only — never stored.
  standardTerms?: string;
}

type DiffLine = { type: "unchanged" | "added" | "removed"; text: string };

// TERMS-LOCK-DIFF: minimal LCS-based line diff (no `diff` dependency). `removed`
// = a standard line dropped from the quote; `added` = a line in the quote not in
// the standard. Drives the admin-only Modified Terms panel; purely derived.
function lineDiff(standard: string, current: string): DiffLine[] {
  const a = standard.split("\n"); // standard (baseline)
  const b = current.split("\n"); // quote's current terms
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "unchanged", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "removed", text: a[i] });
      i++;
    } else {
      out.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "removed", text: a[i++] });
  while (j < n) out.push({ type: "added", text: b[j++] });
  return out;
}

export function NotesCard({
  terms,
  onChange,
  disabled,
  standardTerms,
}: NotesProps) {
  // Chunk 3b: the Terms editor is Admin-only. Non-Admins don't see the editor
  // at all (the terms still render on the PDF/preview for everyone — that's the
  // client document, untouched here).
  const { role } = useRole();
  // TERMS-LOCK-DIFF: read-only by default; the pencil toggles editing so the
  // terms can't be changed by accident while scrolling.
  const [editing, setEditing] = useState(false);

  if (role !== "Admin") return null;

  const locked = !editing || !!disabled;
  // TERMS-LOCK-DIFF: derive the diff vs the resolved standard (no second copy).
  const changed = lineDiff(standardTerms ?? "", terms).filter(
    (d) => d.type !== "unchanged"
  );
  const isModified = changed.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg flex items-center justify-between">
          <span>Notes &amp; Terms</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing((e) => !e)}
            disabled={disabled}
            aria-pressed={editing}
            title={editing ? "Lock terms (read-only)" : "Edit terms"}
            className="h-7 gap-1 px-2 text-xs"
          >
            {editing ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
            {editing ? "Lock" : "Edit"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={6}
          value={terms}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          disabled={disabled}
          className={cn(
            "font-sans text-xs",
            locked && "bg-muted/30 cursor-default"
          )}
        />
        <p className="text-muted-foreground mt-1 text-[10px]">
          {editing && !disabled
            ? "Editing — click Lock when done."
            : "Read-only. Click Edit (pencil) to change. Renders on the client-facing PDF."}
        </p>

        {isModified && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50/50 p-2">
            <p className="mb-1 text-[11px] font-medium text-red-900">
              Modified Terms — {changed.length} line
              {changed.length === 1 ? "" : "s"} differ from the standard for this
              template
            </p>
            <div className="max-h-48 space-y-0.5 overflow-auto font-mono text-[10px] leading-snug">
              {changed.map((d, idx) => (
                <p
                  key={idx}
                  className={cn(
                    "whitespace-pre-wrap",
                    d.type === "added" && "text-red-700",
                    d.type === "removed" && "text-red-500 line-through"
                  )}
                >
                  <span className="select-none opacity-60">
                    {d.type === "added" ? "+ " : "− "}
                  </span>
                  {d.text || " "}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface InternalProps {
  notes: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function InternalNotesCard({
  notes,
  onChange,
  disabled,
}: InternalProps) {
  return (
    <Can resource="quotes" action="viewInternal">
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-lg text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            Internal Notes
            <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-900 uppercase">
              Restricted
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="PM/Sales-only notes — never appears on the client PDF."
            className="bg-white text-xs"
          />
        </CardContent>
      </Card>
    </Can>
  );
}
