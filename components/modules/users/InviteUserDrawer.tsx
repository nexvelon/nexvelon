"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteUserAction } from "@/app/(app)/users/actions";
import type { DbRole } from "@/lib/types/database";

// ============================================================================
// Invite User drawer (Admin-only).
//
// Calls inviteUserAction → Supabase Auth Admin API → Resend email lands at
// the invitee. Trigger creates the profiles row with status='Invited' and
// the role we picked here. Their first sign-in flows through the magic
// link → /auth/callback → /auth/set-password.
//
// Role picker: only Admin + SalesRep are wired this session. The other
// nine roles are visible-but-disabled with "Session B" hints, so admins
// see what's coming without being able to invite into states the
// permission matrix can't fully model yet.
// ============================================================================

type RoleOption = {
  value: DbRole;
  label: string;
  hint?: string;
  enabled: boolean;
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: "Admin",
    label: "Admin",
    hint: "Full access across every module.",
    enabled: true,
  },
  {
    value: "SalesRep",
    label: "Sales Rep",
    hint: "Drafts quotes, manages clients. No margin or financials.",
    enabled: true,
  },
  { value: "ProjectManager", label: "Project Manager", hint: "Coming in Session B", enabled: false },
  { value: "LeadTechnician", label: "Lead Technician", hint: "Coming in Session B", enabled: false },
  { value: "Technician", label: "Technician", hint: "Coming in Session B", enabled: false },
  { value: "Dispatcher", label: "Dispatcher", hint: "Coming in Session B", enabled: false },
  { value: "Warehouse", label: "Warehouse", hint: "Coming in Session B", enabled: false },
  { value: "Accountant", label: "Accountant", hint: "Coming in Session B", enabled: false },
  { value: "Subcontractor", label: "Subcontractor", hint: "Coming in Session B", enabled: false },
  { value: "ViewOnly", label: "View Only", hint: "Coming in Session B", enabled: false },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDrawer({ open, onOpenChange }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DbRole>("SalesRep");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("SalesRep");
    setTitle("");
    setDepartment("");
    setPhone("");
    setError(null);
  };

  const handleClose = () => {
    if (pending) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }

    startTransition(async () => {
      const result = await inviteUserAction({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        title: title.trim() || null,
        department: department.trim() || null,
        phone: phone.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Invite sent", {
        description: `${firstName.trim()} ${lastName.trim()} will receive an email to set their password.`,
      });
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-[var(--border)] p-6 pb-4">
          <div className="mb-2 inline-flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                background:
                  "color-mix(in oklab, var(--brand-accent) 15%, transparent)",
                color: "var(--brand-accent)",
              }}
              aria-hidden
            >
              <UserPlus className="h-4 w-4" />
            </span>
            <span className="nx-eyebrow">New invitation</span>
          </div>
          <SheetTitle className="font-serif text-2xl text-brand-primary">
            Invite a teammate
          </SheetTitle>
          <SheetDescription className="nx-subtitle text-sm">
            They&rsquo;ll receive an email with a one-time link to set their
            password and join the workspace.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
          noValidate
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name" required>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  required
                  disabled={pending}
                  className="h-10"
                />
              </Field>
              <Field label="Last name" required>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  required
                  disabled={pending}
                  className="h-10"
                />
              </Field>
            </div>

            <Field label="Work email" required>
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={pending}
                className="h-10"
                placeholder="name@nexvelonglobal.com"
              />
            </Field>

            <Field label="Role" required>
              <Select
                value={role}
                onValueChange={(v) => v && setRole(v as DbRole)}
                disabled={pending}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      disabled={!opt.enabled}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {opt.label}
                          {!opt.enabled && (
                            <span className="text-muted-foreground ml-1.5 text-[10px]">
                              · {opt.hint}
                            </span>
                          )}
                        </span>
                        {opt.enabled && opt.hint && (
                          <span className="text-muted-foreground text-[11px]">
                            {opt.hint}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={pending}
                  className="h-10"
                  placeholder="e.g. Senior Sales Lead"
                />
              </Field>
              <Field label="Department">
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={pending}
                  className="h-10"
                  placeholder="e.g. Sales"
                />
              </Field>
            </div>

            <Field label="Phone">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                disabled={pending}
                className="h-10"
                placeholder="+1 416 555 0100"
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                style={{
                  background:
                    "color-mix(in oklab, var(--brand-status-red) 10%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--brand-status-red) 35%, transparent)",
                  color: "var(--brand-status-red)",
                }}
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              {pending ? "Sending invite…" : "Send invite"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="nx-eyebrow-soft text-[10px]">
        {label}
        {required && (
          <span style={{ color: "var(--brand-accent)" }} aria-hidden>
            {" "}
            ·
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
