import { prisma } from './prisma';

/**
 * Canonical 18-stage loan-application timeline definition (Mandate 2).
 * order/key/label/group/hasDate exactly as specified. Seeded idempotently the
 * first time a client's timeline is requested; stage 1 starts `active`.
 */
export interface StageDef {
  key: string;
  label: string;
  group: string;
  hasDate: boolean;
}

export const STAGE_DEFS: StageDef[] = [
  { key: 'info_received', label: 'Information Received', group: 'Onboarding', hasDate: false },
  { key: 'servicing_done', label: 'Servicing Assessment Done', group: 'Onboarding', hasDate: false },
  { key: 'application_submitted', label: 'Application Submitted', group: 'Submission', hasDate: false },
  { key: 'mir_received', label: 'MIR Received', group: 'Submission', hasDate: false },
  { key: 'conditional_preapproval', label: 'Conditional Pre-Approval Received', group: 'Pre-Approval', hasDate: false },
  { key: 'unconditional_preapproval', label: 'Unconditional Pre-Approval Received', group: 'Pre-Approval', hasDate: false },
  { key: 'cos_received', label: 'Contract of Sale Received', group: 'Contract', hasDate: false },
  { key: 'preapproval_converted', label: 'Pre-Approval Converted to Final Approval', group: 'Approval', hasDate: false },
  { key: 'finance_clause_due', label: 'Finance Clause Due Date', group: 'Approval', hasDate: true },
  { key: 'finance_approval', label: 'Finance Approval Received', group: 'Approval', hasDate: false },
  { key: 'paperwork_issued_bank', label: 'Loan Documents Issued by Bank', group: 'Documentation', hasDate: false },
  { key: 'paperwork_received_client', label: 'Documents Received by Client', group: 'Documentation', hasDate: false },
  { key: 'paperwork_returned_bank', label: 'Documents Returned to Bank', group: 'Documentation', hasDate: false },
  { key: 'settlement_date', label: 'Settlement Date', group: 'Settlement', hasDate: true },
  { key: 'settlement_done', label: 'Settlement Completed', group: 'Settlement', hasDate: false },
  { key: 'paperwork_bank_final', label: 'Final Paperwork Received by Bank', group: 'Post-Settlement', hasDate: false },
  { key: 'keys_handed', label: 'Keys / Possession Handed Over', group: 'Post-Settlement', hasDate: false },
  { key: 'complete', label: 'Application Complete', group: 'Complete', hasDate: false },
];

export const TOTAL_STAGES = STAGE_DEFS.length;

/**
 * Minimal structural shape of an ApplicationStage row used by the helpers
 * below. Declared explicitly so this module type-checks even before the
 * Prisma client has been generated (the production build runs
 * `prisma generate` first, but `tsc`/CI may run before that).
 */
interface StageRow {
  id: string;
  status: string;
}

/**
 * Idempotently ensure the 18 timeline stages exist for a user. If none exist,
 * they are created with stage 1 (`info_received`) active and the rest upcoming.
 * Returns the ordered stage rows.
 */
export async function ensureTimeline(userId: string) {
  const existing = await prisma.applicationStage.findMany({
    where: { userId },
    orderBy: { orderIndex: 'asc' },
  });
  if (existing.length > 0) return existing;

  await prisma.$transaction(
    STAGE_DEFS.map((def, i) =>
      prisma.applicationStage.create({
        data: {
          userId,
          key: def.key,
          label: def.label,
          group: def.group,
          orderIndex: i + 1,
          hasDate: def.hasDate,
          status: i === 0 ? 'active' : 'upcoming',
        },
      })
    )
  );

  return prisma.applicationStage.findMany({
    where: { userId },
    orderBy: { orderIndex: 'asc' },
  });
}

/**
 * After a stage is marked completed, promote the first remaining `upcoming`
 * stage (by order) to `active` — unless one is already active. Skipped stages
 * are left as-is. Returns nothing; callers re-fetch the timeline.
 */
export async function activateNextUpcoming(userId: string): Promise<void> {
  const stages = await prisma.applicationStage.findMany({
    where: { userId },
    orderBy: { orderIndex: 'asc' },
  });
  const hasActive = stages.some((s: StageRow) => s.status === 'active');
  if (hasActive) return;
  const next = stages.find((s: StageRow) => s.status === 'upcoming');
  if (next) {
    await prisma.applicationStage.update({
      where: { id: next.id },
      data: { status: 'active' },
    });
  }
}
