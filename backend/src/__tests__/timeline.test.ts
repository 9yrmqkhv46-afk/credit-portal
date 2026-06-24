import { prisma } from '../lib/prisma';
import { ensureTimeline, activateNextUpcoming, TOTAL_STAGES } from '../lib/timeline';

/**
 * Timeline integration tests (Mandate 2) against the local SQLite dev.db.
 * Each test provisions a throwaway CLIENT user and removes it afterwards so the
 * suite is repeatable and leaves no residue.
 */
describe('Application timeline', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `timeline-test-${Date.now()}@example.com`,
        name: 'Timeline Test',
        password: 'x',
        role: 'CLIENT',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.applicationStage.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test('auto-seeds 18 stages with stage 1 active and the rest upcoming', async () => {
    const stages = await ensureTimeline(userId);
    expect(stages).toHaveLength(TOTAL_STAGES);
    expect(stages).toHaveLength(18);
    expect(stages[0].status).toBe('active');
    expect(stages[0].key).toBe('info_received');
    expect(stages.slice(1).every((s: { status: string }) => s.status === 'upcoming')).toBe(true);
    // hasDate flags land on the right stages.
    expect(stages.find((s: { key: string }) => s.key === 'finance_clause_due')?.hasDate).toBe(true);
    expect(stages.find((s: { key: string }) => s.key === 'settlement_date')?.hasDate).toBe(true);
  });

  test('is idempotent — a second ensure does not duplicate stages', async () => {
    await ensureTimeline(userId);
    const count = await prisma.applicationStage.count({ where: { userId } });
    expect(count).toBe(18);
  });

  test('marking a stage complete advances the next upcoming stage to active', async () => {
    const stages = await prisma.applicationStage.findMany({
      where: { userId },
      orderBy: { orderIndex: 'asc' },
    });
    const first = stages[0];

    // Simulate the admin PATCH "complete" action.
    await prisma.applicationStage.update({
      where: { id: first.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    await activateNextUpcoming(userId);

    const after = await prisma.applicationStage.findMany({
      where: { userId },
      orderBy: { orderIndex: 'asc' },
    });
    expect(after[0].status).toBe('completed');
    expect(after[0].completedAt).not.toBeNull();
    expect(after[1].status).toBe('active');
    expect(after[2].status).toBe('upcoming');
  });
});
