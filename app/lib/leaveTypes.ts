export type LeaveTypeDef = {
  key: string
  label: string
  default_days: number | null
  requires_docs: boolean
  is_active: boolean
  sort_order: number
}

/** WFH allocation in days from a role string. Juniors = 0 (ineligible). */
export function getWfhAllocation(role: string | null | undefined): number {
  if (!role) return 0
  const r = role.toLowerCase()
  if (r.includes('junior')) return 0
  if (r.endsWith(' mid') || r.includes(' mid ')) return 12
  return 20
}

export function isWfhEligible(role: string | null | undefined): boolean {
  return getWfhAllocation(role) > 0
}

/**
 * Build the initial leave_balances rows for a brand-new user.
 * Auto-seeds: casual + sick (from default_days) + WFH (from role).
 * Maternity / miscarriage / sabbatical are NOT seeded — admin assigns those as needed.
 */
export function buildInitialBalances(
  userId: string,
  role: string | null | undefined,
  leaveTypes: LeaveTypeDef[],
): { user_id: string; leave_type: string; allocated: number; balance: number }[] {
  const rows: { user_id: string; leave_type: string; allocated: number; balance: number }[] = []

  for (const lt of leaveTypes) {
    if (!lt.is_active || lt.default_days === null) continue
    if (!['casual', 'sick'].includes(lt.key)) continue
    rows.push({ user_id: userId, leave_type: lt.key, allocated: lt.default_days, balance: lt.default_days })
  }

  const wfh = getWfhAllocation(role)
  if (wfh > 0) {
    rows.push({ user_id: userId, leave_type: 'wfh', allocated: wfh, balance: wfh })
  }

  return rows
}
