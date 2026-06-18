import { InviteStatus } from "./InviteClient";

export default async function InviteStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteStatus token={token} />;
}
