import { ClientInfoForm } from "../InviteClient";

export default async function ClientFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ClientInfoForm token={token} />;
}
