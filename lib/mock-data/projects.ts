import type { Project } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Project type
// is preserved. Projects module is unwired; the page renders an empty
// state until 00NN_projects_schema.sql + lib/api/projects.ts ship.
export const projects: Project[] = [];
