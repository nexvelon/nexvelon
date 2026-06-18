import { TcSign } from "../InviteClient";

export default async function Tc1Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TcSign token={token} which="tc1" />;
}
