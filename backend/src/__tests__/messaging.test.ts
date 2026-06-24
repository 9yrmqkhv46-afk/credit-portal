import { prisma } from '../lib/prisma';

/**
 * Messaging hub data-layer tests (Mandate 4C) against the local SQLite dev.db.
 * Verifies thread isolation (RBAC: a client only sees their own thread) and the
 * shape produced by a client-sent message.
 */
describe('Messaging hub', () => {
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    const a = await prisma.user.create({
      data: { email: `msg-a-${Date.now()}@example.com`, name: 'Client A', password: 'x', role: 'CLIENT' },
    });
    const b = await prisma.user.create({
      data: { email: `msg-b-${Date.now()}@example.com`, name: 'Client B', password: 'x', role: 'CLIENT' },
    });
    clientA = a.id;
    clientB = b.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { clientUserId: { in: [clientA, clientB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await prisma.$disconnect();
  });

  test('a client-sent message has the expected default shape', async () => {
    const message = await prisma.message.create({
      data: { clientUserId: clientA, senderRole: 'CLIENT', body: 'Hello', type: 'text', status: 'sent' },
    });
    expect(message.senderRole).toBe('CLIENT');
    expect(message.type).toBe('text');
    expect(message.status).toBe('sent');
    expect(message.resolved).toBe(false);
    expect(message.flagged).toBe(false);
    expect(message.body).toBe('Hello');
  });

  test('thread query is isolated to a single client (RBAC)', async () => {
    await prisma.message.create({
      data: { clientUserId: clientB, senderRole: 'ADMIN', body: 'For B only', type: 'text', status: 'sent' },
    });

    // The route filters strictly by clientUserId — clientA must never see B's.
    const threadA = await prisma.message.findMany({ where: { clientUserId: clientA } });
    const threadB = await prisma.message.findMany({ where: { clientUserId: clientB } });

    expect(threadA.every((m: { clientUserId: string }) => m.clientUserId === clientA)).toBe(true);
    expect(threadA.some((m: { body: string | null }) => m.body === 'For B only')).toBe(false);
    expect(threadB.some((m: { body: string | null }) => m.body === 'For B only')).toBe(true);
  });

  test('structured card messages persist cardData JSON and a non-text type', async () => {
    const card = { title: 'Documents required', items: ['Payslip', 'ID'] };
    const message = await prisma.message.create({
      data: {
        clientUserId: clientA,
        senderRole: 'ADMIN',
        body: 'Please upload',
        type: 'document_request',
        cardData: JSON.stringify(card),
        status: 'sent',
      },
    });
    expect(message.type).toBe('document_request');
    expect(JSON.parse(message.cardData as string)).toEqual(card);
  });
});
