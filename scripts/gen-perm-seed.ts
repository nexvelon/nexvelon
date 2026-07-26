// PERM-1 generator — emits the granted-triple count + the SQL VALUES block for
// migration 0114, straight from the static ROLE_PERMISSIONS (via
// lib/permissions/seed-matrix). Regenerate the migration's INSERTs with:
//   npx tsx scripts/gen-perm-seed.ts
import { grantedMatrixRows, grantedRowsToSqlValues } from "@/lib/permissions/seed-matrix";

const rows = grantedMatrixRows();
process.stderr.write(`GRANTED_COUNT=${rows.length}  (of 7*11*11=847 triples)\n`);
process.stdout.write(grantedRowsToSqlValues(rows) + "\n");
