"use client";

// PROJ2-5 — "This quote is for:" chooser. Captures, at creation, whether the
// quote should convert into a NEW project on its site or a CHANGE ORDER on an
// existing project on that site. The convert-to-project step honours the choice.
// The change-order option is disabled until the site has at least one
// (non-cancelled) project. Requires a site to be picked first.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MergeCandidate } from "@/lib/api/projects";

export function ConversionTargetCard({
  siteSelected,
  siteProjects,
  kind,
  projectId,
  onKindChange,
  onProjectChange,
  disabled,
}: {
  siteSelected: boolean;
  siteProjects: MergeCandidate[];
  kind: "new_project" | "change_order";
  projectId: string;
  onKindChange: (k: "new_project" | "change_order") => void;
  onProjectChange: (id: string) => void;
  disabled?: boolean;
}) {
  const noProjects = siteProjects.length === 0;
  const selected = siteProjects.find((p) => p.id === projectId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">This quote is for</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!siteSelected ? (
          <p className="text-muted-foreground text-xs">
            Pick a site first to choose a conversion target.
          </p>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="intendedTarget"
                className="mt-0.5"
                checked={kind === "new_project"}
                disabled={disabled}
                onChange={() => onKindChange("new_project")}
              />
              <span>
                <span className="font-medium">A new Project on this site</span>
                <span className="text-muted-foreground block text-xs">
                  Converting mints a fresh project; this quote is its original.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="intendedTarget"
                className="mt-0.5"
                checked={kind === "change_order"}
                disabled={disabled || noProjects}
                onChange={() => onKindChange("change_order")}
              />
              <span className="flex-1">
                <span className="font-medium">
                  A Change Order on an existing Project on this site
                </span>
                <span className="text-muted-foreground block text-xs">
                  {noProjects
                    ? "No projects on this site yet."
                    : "Converting adds it to the chosen project as a change order."}
                </span>
              </span>
            </label>

            {kind === "change_order" && !noProjects && (
              <div className="pl-6">
                <Select
                  value={projectId || undefined}
                  onValueChange={(v) => onProjectChange(v ?? "")}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue>
                      {selected ? (
                        `${selected.project_number} — ${selected.title || "Untitled"}`
                      ) : (
                        <span className="text-muted-foreground">
                          Select a project…
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {siteProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.project_number} — {p.title || "Untitled"} ({p.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
