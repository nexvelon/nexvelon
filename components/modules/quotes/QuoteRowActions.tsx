"use client";

import {
  Archive,
  Check,
  Copy,
  Eye,
  MoreVertical,
  Send,
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
  onConvert: (q: Quote) => void;
  onArchive: (q: Quote) => void;
}

export function QuoteRowActions({
  quote,
  onView,
  onDuplicate,
  onSend,
  onConvert,
  onArchive,
}: Props) {
  const { role } = useRole();
  const canConvert =
    hasPermission(role, "quotes", "convert") &&
    quote.status === "Approved";
  const canSend = quote.status === "Draft";

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
        {canSend && (
          <DropdownMenuItem onClick={() => onSend(quote)}>
            <Send className="mr-2 h-4 w-4" />
            Send to Client
          </DropdownMenuItem>
        )}
        {canConvert && (
          <DropdownMenuItem onClick={() => onConvert(quote)}>
            <Check className="text-brand-gold mr-2 h-4 w-4" />
            Convert to Project
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
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
