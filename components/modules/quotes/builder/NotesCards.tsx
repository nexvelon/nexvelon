"use client";

import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/lib/role-context";

interface NotesProps {
  terms: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function NotesCard({ terms, onChange, disabled }: NotesProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">
          Notes & Terms
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={6}
          value={terms}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="font-sans text-xs"
        />
        <p className="text-muted-foreground mt-1 text-[10px]">
          Renders on the client-facing PDF.
        </p>
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
