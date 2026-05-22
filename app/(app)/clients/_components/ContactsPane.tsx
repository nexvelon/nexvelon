"use client";

import { Edit3, Mail, Phone, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { DbContact } from "@/lib/types/database";
import { initials } from "./shared";

// CONTACTS-1 — render a pill for each role boolean a contact has toggled on.
// The three flags (is_primary / is_billing / is_emergency) have existed since
// CL-3a but only "Primary" was ever displayed.
function RoleBadges({ contact }: { contact: DbContact }) {
  const badges: Array<{ label: string; cls: string }> = [];
  if (contact.is_primary) {
    badges.push({ label: "Primary", cls: "bg-brand-gold/15 text-amber-800" });
  }
  if (contact.is_billing) {
    badges.push({ label: "Billing", cls: "bg-emerald-100 text-emerald-800" });
  }
  if (contact.is_emergency) {
    badges.push({ label: "Emergency", cls: "bg-red-100 text-red-800" });
  }

  if (badges.length === 0) return null;

  return (
    <span className="ml-2 inline-flex gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}
        >
          {b.label}
        </span>
      ))}
    </span>
  );
}

export function ContactsCard({
  contacts,
  onAdd,
  onEdit,
  onDelete,
}: {
  contacts: DbContact[];
  onAdd: () => void;
  onEdit: (c: DbContact) => void;
  onDelete: (c: DbContact) => void;
}) {
  return (
    <Card
      className="p-4 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow">Contacts</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/40"
          style={{
            borderColor: "var(--brand-border)",
            color: "var(--brand-text)",
          }}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-[11px]">
          No contacts yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="group flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback
                  className="text-[9px] font-semibold text-white"
                  style={{ background: "var(--brand-primary)" }}
                >
                  {initials(`${c.first_name} ${c.last_name}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-brand-text text-xs font-medium leading-tight truncate">
                  {c.first_name} {c.last_name}
                  <RoleBadges contact={c} />
                </p>
                <p className="text-muted-foreground text-[10px] leading-tight truncate">
                  {c.title ?? c.department ?? c.email ?? "—"}
                </p>
              </div>
              {c.email && <Mail className="text-muted-foreground h-3.5 w-3.5" />}
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  className="text-muted-foreground hover:text-brand-charcoal p-0.5"
                  aria-label="Edit contact"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  className="text-muted-foreground hover:text-red-600 p-0.5"
                  aria-label="Delete contact"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ContactsPane({
  contacts,
  onAdd,
  onEdit,
  onDelete,
}: {
  contacts: DbContact[];
  onAdd: () => void;
  onEdit: (c: DbContact) => void;
  onDelete: (c: DbContact) => void;
}) {
  if (contacts.length === 0) {
    return (
      <Card
        className="border-dashed py-12 text-center"
        style={{ background: "var(--brand-card)" }}
      >
        <p className="nx-eyebrow mb-2">Contacts</p>
        <p className="text-muted-foreground text-xs">
          No contacts yet for this client.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          <Plus className="h-3 w-3" />
          Add contact
        </button>
      </Card>
    );
  }
  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="nx-eyebrow">All contacts</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/40"
          style={{
            borderColor: "var(--brand-border)",
            color: "var(--brand-text)",
          }}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {contacts.map((c) => (
          <li key={c.id} className="group flex items-center gap-3 py-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback
                className="text-[10px] font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                {initials(`${c.first_name} ${c.last_name}`)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-brand-text text-sm font-medium leading-tight">
                {c.first_name} {c.last_name}
                <RoleBadges contact={c} />
              </p>
              <p className="text-muted-foreground text-[11px]">
                {[c.title, c.department].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="text-muted-foreground hidden gap-3 text-[11px] sm:flex">
              {c.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {c.email}
                </span>
              )}
              {c.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {c.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
                aria-label="Edit contact"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
                aria-label="Delete contact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
