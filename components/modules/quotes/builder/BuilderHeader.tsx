"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Eye,
  Loader2,
  PackageCheck,
  RotateCcw,
  Save,
  Send,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import type { QuoteStatus } from "@/lib/types";

interface Props {
  number: string;
  status: QuoteStatus;
  saving: boolean;
  disabled: boolean;
  /** POLISH-2 — last-saved indicator label (e.g. "Saved 3:42 PM"). */
  savedLabel?: string | null;
  /** QUOTES-5 — Send for Approval requires a client + site (mirrors the list's
   *  "Send to Client" gating and the hardened sendQuoteAction). */
  hasClient: boolean;
  hasSite: boolean;
  onSaveDraft: () => void;
  onSend: () => void;
  onApprove: () => void;
  onPreview: () => void;
  onConvert: () => void;
  onCommitStock: () => void;
  onReopen: () => void;
  canReopen: boolean;
  onRevise: () => void;
  onClose: () => void;
}

export function BuilderHeader({
  number,
  status,
  saving,
  disabled,
  savedLabel,
  hasClient,
  hasSite,
  onSaveDraft,
  onSend,
  onApprove,
  onPreview,
  onConvert,
  onCommitStock,
  onReopen,
  canReopen,
  onRevise,
  onClose,
}: Props) {
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const canApprove = hasPermission(role, "quotes", "approve");
  const approveEnabled = canApprove && status === "Sent";
  const canConvert = hasPermission(role, "quotes", "convert");
  const convertEnabled = canConvert && status === "Approved";
  const canCommitStock = hasPermission(role, "inventory", "edit");
  const commitVisible =
    canCommitStock && (status === "Approved" || status === "Converted");
  // POLISH-2 — "Move to Revision": any quote editor (sales/PM/admin) can send a
  // presented quote (Sent/Approved) back for client-requested changes. Captures
  // a required reason + source (decision-capture, not a content edit, so not
  // blocked by the Approved content-lock).
  const reviseVisible =
    hasPermission(role, "quotes", "edit") &&
    (status === "Sent" || status === "Approved");
  // POLISH-2 — "Close quote": admin-only, from Sent/Approved/Revision. A closed
  // deal can be reopened to Sent (handled by canReopen), so it's never terminal.
  const closeVisible =
    isAdmin &&
    (status === "Sent" || status === "Approved" || status === "Revision");
  const reopenLabel = status === "Closed" ? "Reopen quote" : "Reopen for Editing";

  return (
    <div className="bg-background/85 sticky top-16 z-20 -mx-8 border-b border-[var(--border)] px-8 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/quotes"
          className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quotes
        </Link>
        <span className="text-muted-foreground/40">/</span>

        <div className="flex items-center gap-3">
          <span className="text-brand-navy font-mono text-sm font-semibold tracking-wider">
            {number}
          </span>
          <QuoteStatusBadge status={status} size="md" />
        </div>

        {savedLabel && (
          <span className="text-muted-foreground hidden text-[11px] sm:inline">
            {savedLabel}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPreview}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || saving}
            onClick={onSaveDraft}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save Draft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              disabled || saving || status !== "Draft" || !hasClient || !hasSite
            }
            title={
              status === "Draft" && (!hasClient || !hasSite)
                ? "Add a client and site before sending."
                : undefined
            }
            onClick={onSend}
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Send for Approval
          </Button>
          {status === "Sent" && canApprove && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!approveEnabled || saving}
              onClick={onApprove}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5"
            >
              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
          )}
          {reviseVisible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onRevise}
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              Move to Revision
            </Button>
          )}
          {closeVisible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onClose}
              className="border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Close quote
            </Button>
          )}
          {canReopen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onReopen}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {reopenLabel}
            </Button>
          )}
          {commitVisible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onCommitStock}
              className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5"
            >
              <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
              Commit stock
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!convertEnabled || saving}
            onClick={onConvert}
            className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Convert to Project
          </Button>
        </div>
      </div>

      {!canConvert && (
        <p className="text-muted-foreground mt-2 text-[10px]">
          Conversion is restricted to Admins and Project Managers.
        </p>
      )}
    </div>
  );
}
