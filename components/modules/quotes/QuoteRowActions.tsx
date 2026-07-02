"use client";

import {
  Archive,
  Check,
  Copy,
  Eye,
  MoreVertical,
  Send,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import type { Quote } from "@/lib/types";

interface Props {
  quote: Quote;
  onView: (q: Quote) => void;
  onDuplicate: (q: Quote) => void;
  onSend: (q: Quote) => void;
  onApprove: (q: Quote) => void;
  onConvert: (q: Quote) => void;
  onArchive: (q: Quote) => void;
  onDelete?: (q: Quote) => void;
}

export function QuoteRowActions({
  quote,
  onView,
  onDuplicate,
  onSend,
  onApprove,
  onConvert,
  onArchive,
  onDelete,
}: Props) {
  const { role } = useRole();
  const canApprove =
    hasPermission(role, "quotes", "approve") && quote.status === "Sent";
  const canConvert =
    hasPermission(role, "quotes", "convert") &&
    quote.status === "Approved";
  // QUOTES-2 — the Send item shows for any Draft, but is only enabled once a
  // client AND site are set. Non-Draft statuses don't show it at all (status
  // gate takes precedence). The server action re-validates, so this is UX, not
  // the security boundary.
  const isDraft = quote.status === "Draft";
  const canSend = isDraft && !!quote.clientId && !!quote.siteId;
  // QUOTES-3 — hard delete is Admin-only and Draft-only. The server action
  // re-checks both (plus project references), so this is UX-only gating.
  const canDelete = hasPermission(role, "quotes", "delete") && isDraft;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors">
        <MoreVertical className="h-4 w-4" />
        <span className="sr-only">Row actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onView(quote)}>
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(quote)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        {isDraft && (
          <DropdownMenuItem
            disabled={!canSend}
            title={canSend ? undefined : "Add a client and site before sending."}
            onClick={() => onSend(quote)}
          >
            <Send className="mr-2 h-4 w-4" />
            Send to Client
          </DropdownMenuItem>
        )}
        {canApprove && (
          <DropdownMenuItem onClick={() => onApprove(quote)}>
            <ThumbsUp className="mr-2 h-4 w-4" />
            Approve
          </DropdownMenuItem>
        )}
        {canConvert && (
          <DropdownMenuItem onClick={() => onConvert(quote)}>
            <Check className="text-brand-gold mr-2 h-4 w-4" />
            Convert to Project
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {canDelete && (
          <DropdownMenuItem
            onClick={() => onDelete?.(quote)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => onArchive(quote)}
          className="text-red-600"
        >
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
