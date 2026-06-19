// POLISH-5 — admin Submission Detail page. Server component: admin-gates the
// route (redirect non-admins to /clients) and hands the clientId to the
// interactive review view. Next 15: `params` is a Promise.

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PendingReviewDetail } from "./PendingReviewDetail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentProfile();
  if (me?.role !== "Admin") redirect("/clients");
  const { id } = await params;
  return <PendingReviewDetail clientId={id} />;
}
