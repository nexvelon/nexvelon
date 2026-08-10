// AUD-1 — the client Activity tab renders a rolled-up child event with its noun
// + denormalised label, which is also what keeps it readable after the parent is
// gone (the row carries the filename, not just a uuid).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityLog } from "@/components/activity/ActivityLog";
import type { DbActivityLogWithActor } from "@/lib/types/database";

function row(over: Partial<DbActivityLogWithActor>): DbActivityLogWithActor {
  return {
    id: "1",
    entity_type: "attachment",
    entity_id: "att-1",
    action: "create",
    changes: {},
    actor_id: "u1",
    created_at: "2026-04-30T12:00:00Z",
    parent_type: "client",
    parent_id: "client-9",
    entity_label: "Site survey.pdf",
    parent_label: null,
    actor: { id: "u1", display_name: "Ada Lovelace", first_name: null, last_name: null },
    ...over,
  } as DbActivityLogWithActor;
}

describe("ActivityLog — rolled-up child events", () => {
  it("renders 'added a document — <filename>' for an attachment create", () => {
    render(<ActivityLog entries={[row({ action: "create" })]} />);
    expect(screen.getByText(/added a document — Site survey\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it("renders 'removed a document — <filename>' for a delete", () => {
    render(<ActivityLog entries={[row({ id: "2", action: "delete" })]} />);
    expect(screen.getByText(/removed a document — Site survey\.pdf/)).toBeInTheDocument();
  });

  it("stays readable with no actor and no parent record (survival)", () => {
    render(<ActivityLog entries={[row({ id: "3", action: "create", actor: null })]} />);
    // The filename is denormalised on the row, so it reads even if the client is gone.
    expect(screen.getByText(/added a document — Site survey\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown user/)).toBeInTheDocument();
  });

  it("a normal own-entity event still reads 'created this record'", () => {
    render(<ActivityLog entries={[row({ id: "4", entity_type: "client", parent_type: null, entity_label: null })]} />);
    expect(screen.getByText(/created this record/)).toBeInTheDocument();
  });

  // AUD-2 — sites and contacts now roll up to their client with a readable label.
  it("renders 'added a site — <name>' for a site create rolled up to a client", () => {
    render(
      <ActivityLog
        entries={[
          row({ id: "5", entity_type: "site", action: "create", entity_label: "Main St Depot" }),
        ]}
      />
    );
    expect(screen.getByText(/added a site — Main St Depot/)).toBeInTheDocument();
  });

  it("renders 'removed a contact — <name>' for a contact delete", () => {
    render(
      <ActivityLog
        entries={[
          row({ id: "6", entity_type: "contact", action: "delete", entity_label: "Jane Doe" }),
        ]}
      />
    );
    expect(screen.getByText(/removed a contact — Jane Doe/)).toBeInTheDocument();
  });

  it("shows the AUD-2 empty state (never blank, never fabricated)", () => {
    render(<ActivityLog entries={[]} />);
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
  });
});
