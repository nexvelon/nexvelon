// AUD-3 — the feed row links a live record, and renders a gone record as plain
// text with a "deleted" indication (never a dead link). Also verifies actor-name
// linking is gated by the caller-supplied href builder.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeedList } from "@/components/activity/ActivityFeedList";
import type { DbActivityLogWithActor } from "@/lib/types/database";

function row(over: Partial<DbActivityLogWithActor>): DbActivityLogWithActor {
  return {
    id: "1", entity_type: "client", entity_id: "c1", action: "update",
    changes: {}, actor_id: "u1", created_at: "2026-08-10T12:00:00Z",
    parent_type: null, parent_id: null, entity_label: "Acme Corp", parent_label: null,
    actor: { id: "u1", display_name: "Ada Lovelace", first_name: null, last_name: null },
    ...over,
  } as DbActivityLogWithActor;
}

describe("ActivityFeedList — record linking + orphans", () => {
  it("links a live record", () => {
    render(
      <ActivityFeedList entries={[row({})]} liveKeys={new Set(["client:c1"])} />
    );
    const link = screen.getByRole("link", { name: "Acme Corp" });
    expect(link).toHaveAttribute("href", "/clients/c1");
    expect(screen.queryByText("deleted")).not.toBeInTheDocument();
  });

  it("renders a hard-deleted record as text + 'deleted', with no link", () => {
    render(<ActivityFeedList entries={[row({})]} liveKeys={new Set()} />);
    expect(screen.queryByRole("link", { name: "Acme Corp" })).not.toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("deleted")).toBeInTheDocument();
  });

  it("a non-detail-page type is plain text with no 'deleted' badge", () => {
    render(
      <ActivityFeedList
        entries={[row({ entity_type: "job_task", entity_id: "t1", entity_label: "Fix drywall" })]}
        liveKeys={new Set()}
      />
    );
    expect(screen.queryByRole("link", { name: "Fix drywall" })).not.toBeInTheDocument();
    expect(screen.queryByText("deleted")).not.toBeInTheDocument();
  });

  it("links the actor name only when the href builder allows it", () => {
    const { rerender } = render(
      <ActivityFeedList
        entries={[row({})]}
        liveKeys={new Set(["client:c1"])}
        linkActorHref={(id) => (id ? `/users/${id}/activity` : null)}
      />
    );
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute(
      "href",
      "/users/u1/activity"
    );
    // Without a builder, the actor is plain text.
    rerender(<ActivityFeedList entries={[row({})]} liveKeys={new Set(["client:c1"])} />);
    expect(screen.queryByRole("link", { name: "Ada Lovelace" })).not.toBeInTheDocument();
  });
});
