"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  Save,
  Send,
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
  onSaveDraft: () => void;
  onSend: () => void;
  onPreview: () => void;
  onConvert: () => void;
}

export function BuilderHeader({
  number,
  status,
  saving,
  disabled,
  onSaveDraft,
  onSend,
  onPreview,
  onConvert,
}: Props) {
  const { role } = useRole();
  const canConvert = hasPermission(role, "quotes", "convert");
  const convertEnabled = canConvert && status === "Approved";

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
            disabled={disabled || saving || status !== "Draft"}
            onClick={onSend}
            className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Send for Approval
          </Button>
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
