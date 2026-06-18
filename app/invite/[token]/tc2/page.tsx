import { TcSign } from "../InviteClient";

export default async function Tc2Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TcSign token={token} which="tc2" />;
}
