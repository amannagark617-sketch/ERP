// Approval chain, derived from the Roles tab ("Approves POs above Rs"). Shared by the server and the app.
export interface Approver { role: string; above: number; level: number }

export function approversOf(roles: any[]): Approver[] {
  return roles
    .filter(r => String(r.approvesAbove ?? '').trim() !== '' && Number.isFinite(Number(r.approvesAbove)))
    .map(r => ({ role: r.role, above: Number(r.approvesAbove), level: Number(r.level) || 0 }))
    .sort((a, b) => a.above - b.above || a.level - b.level);
}

/** Approvers (in order) a PO of this value must pass. */
export function routeFor(approvers: Approver[], value: number): string[] {
  const out: string[] = [];
  approvers.filter(a => value > a.above).forEach(a => { if (out.indexOf(a.role) < 0) out.push(a.role); });
  return out;
}
