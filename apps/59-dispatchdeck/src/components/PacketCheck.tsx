/**
 * PacketCheck — the bounce-killer rendered.
 *
 * Before "Send packet": the completeness rows (rate con, POD, amount
 * math) each with a present/missing state; missing rows name the fix
 * ("No POD yet — photograph the signed BOL from the cab"). The build
 * button enables only when all rows pass.
 *
 * TODO:
 * - [ ] Props from packets.checkCompleteness; page-stack build
 *       animation on success (3 x 80ms staggers).
 */

export interface PacketCheckProps {
  loadId: string;
  checks: Array<{ label: string; ok: boolean; fix: string | null }>;
}

export function PacketCheck(props: PacketCheckProps) {
  void props;
  return <div className="placard p-4">Not implemented</div>;
}
