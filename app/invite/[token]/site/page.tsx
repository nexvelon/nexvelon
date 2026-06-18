import { SiteInfoForm } from "../InviteClient";

export default async function SiteFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SiteInfoForm token={token} />;
}
