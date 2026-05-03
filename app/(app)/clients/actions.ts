"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  createContact,
  createSite,
  softDeleteClient,
  softDeleteContact,
  softDeleteSite,
  updateClient,
  updateContact,
  updateSite,
} from "@/lib/api/clients";
import type {
  DbClientInsert,
  DbClientUpdate,
  DbContactInsert,
  DbContactUpdate,
  DbSiteInsert,
  DbSiteUpdate,
} from "@/lib/types/database";

// Server actions return a uniform { ok, ... } shape so client callers can
// toast failures without unwrapping thrown errors across the network.
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

export async function createClientAction(
  payload: DbClientInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createClient(payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientAction(
  id: string,
  payload: DbClientUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateClient(id, payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClientAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await softDeleteClient(id);
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Sites
// ----------------------------------------------------------------------------

export async function createSiteAction(
  payload: DbSiteInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createSite(payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSiteAction(
  id: string,
  payload: DbSiteUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateSite(id, payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSiteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await softDeleteSite(id);
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Contacts
// ----------------------------------------------------------------------------

export async function createContactAction(
  payload: DbContactInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createContact(payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateContactAction(
  id: string,
  payload: DbContactUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateContact(id, payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContactAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await softDeleteContact(id);
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
