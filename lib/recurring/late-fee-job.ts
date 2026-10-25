import "server-only";

// RECUR-2 — the daily late-fee PROPOSAL job (2f). Client-agnostic like the
// RECUR-1 generator: the cron runs it as service-role. It never charges anything —
// it writes 'proposed' rows that a person approves or waives on the contract.
//
//   • Only contracts that opted in (late_fee_mode ≠ 'none').
//   • Only the recurring invoices a contract generated (service_contract_invoices),
//     while open and past due + grace.
//   • Idempotent: UNIQUE (source_invoice_id, block_index) — a re-run or a
//     concurrent run proposes each block at most once.
//   • Loud: a contract that fails is logged + counted; others still run.
//   • Audited: each proposal writes an activity row on the contract (§5).

import { businessDateISO } from "@/lib/format";
import { isOpenStatus } from "@/lib/invoice-status";
import { dueLateFeeProposals, normalizeLateFeeTerms } from "@/lib/recurring/late-fees";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbServiceContract } from "@/lib/types/database";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface LateFeeJobResult {
  asOf: string;
  contractsConsidered: number;
  proposed: number;
  failed: number;
  errors: string[];
}

interface LinkedInvoice {
  id: string;
  invoice_number: string | null;
  status: string;
  due_date: string | null;
  amount_due: number;
}

export async function proposeDueLateFees(
  supabase: SupabaseClient,
  opts: { asOf?: string } = {}
): Promise<LateFeeJobResult> {
  const asOf = opts.asOf ?? businessDateISO();
  const result: LateFeeJobResult = { asOf, contractsConsidered: 0, proposed: 0, failed: 0, errors: [] };

  const { data, error } = await supabase
    .from("service_contracts")
    .select("*")
    .neq("late_fee_mode", "none");
  if (error) throw new Error(`lateFees/loadContracts: ${error.message}`);
  const contracts = (data ?? []) as DbServiceContract[];
  result.contractsConsidered = contracts.length;

  for (const c of contracts) {
    try {
      const terms = normalizeLateFeeTerms({
        mode: c.late_fee_mode ?? "none",
        monthlyPct: c.late_fee_monthly_pct,
        flatAmount: c.late_fee_flat_amount,
        graceDays: c.late_fee_grace_days,
      });
      if (terms.mode === "none") continue;

      const { data: links, error: lErr } = await supabase
        .from("service_contract_invoices")
        .select("invoice:invoices(id, invoice_number, status, due_date, amount_due)")
        .eq("contract_id", c.id);
      if (lErr) throw new Error(`links: ${lErr.message}`);
      const invoices = ((links ?? []) as unknown as { invoice: LinkedInvoice | null }[])
        .map((l) => l.invoice)
        .filter((i): i is LinkedInvoice => !!i && isOpenStatus(i.status) && !!i.due_date && i.due_date < asOf);
      if (invoices.length === 0) continue;
      const ids = invoices.map((i) => i.id);

      const [{ data: pays, error: pErr }, { data: fees, error: fErr }] = await Promise.all([
        supabase.from("invoice_payments").select("invoice_id, amount").in("invoice_id", ids),
        supabase.from("service_contract_late_fees").select("source_invoice_id, block_index").in("source_invoice_id", ids),
      ]);
      if (pErr) throw new Error(`payments: ${pErr.message}`);
      if (fErr) throw new Error(`fees: ${fErr.message}`);
      const paid = new Map<string, number>();
      for (const p of (pays ?? []) as { invoice_id: string; amount: number }[]) {
        paid.set(p.invoice_id, round2((paid.get(p.invoice_id) ?? 0) + Number(p.amount)));
      }
      const assessed = new Map<string, Set<number>>();
      for (const f of (fees ?? []) as { source_invoice_id: string; block_index: number }[]) {
        const s = assessed.get(f.source_invoice_id) ?? new Set<number>();
        s.add(Number(f.block_index));
        assessed.set(f.source_invoice_id, s);
      }

      for (const inv of invoices) {
        const balance = round2(Number(inv.amount_due) - (paid.get(inv.id) ?? 0));
        const proposals = dueLateFeeProposals(
          terms,
          { dueDate: inv.due_date, balance },
          asOf,
          assessed.get(inv.id) ?? new Set()
        );
        for (const p of proposals) {
          const { error: insErr } = await supabase.from("service_contract_late_fees").insert({
            contract_id: c.id,
            source_invoice_id: inv.id,
            block_index: p.block,
            days_overdue: p.daysOverdue,
            basis_balance: p.basisBalance,
            amount: p.amount,
            mode: terms.mode,
            rate_pct: terms.mode === "percent_monthly" ? terms.monthlyPct : null,
            status: "proposed",
          });
          if (insErr) {
            if ((insErr as { code?: string }).code === "23505") continue; // a concurrent run won
            throw new Error(`insert: ${insErr.message}`);
          }
          result.proposed++;
          await supabase.from("activity_log").insert({
            entity_type: "service_contract",
            entity_id: c.id,
            action: "update",
            changes: {
              late_fee_proposed: {
                from: null,
                to: `$${p.amount.toFixed(2)} on ${inv.invoice_number ?? "invoice"} — ${p.daysOverdue} days overdue (block ${p.block}), awaiting approval`,
              },
            },
            actor_id: null,
            parent_type: "client",
            parent_id: c.client_id,
            entity_label: c.name,
          });
        }
      }
    } catch (e) {
      result.failed++;
      const msg = `contract ${c.id} (${c.name}): ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      console.error(`[recur-2/late-fees] ${msg}`); // LOUD
    }
  }
  return result;
}
