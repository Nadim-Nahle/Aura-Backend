import { getFirestore } from 'firebase-admin/firestore';
import { ReportsService } from './reports.service';

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
}));

describe('ReportsService', () => {
  const usersQuery = { select: jest.fn(), get: jest.fn() };
  const expensesQuery = { select: jest.fn(), get: jest.fn() };
  const firestore = {
    collection: jest.fn((name: string) =>
      name === 'users' ? usersQuery : expensesQuery,
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getFirestore as jest.Mock).mockReturnValue(firestore);
    usersQuery.select.mockReturnValue(usersQuery);
    expensesQuery.select.mockReturnValue(expensesQuery);
  });

  it('calculates complete member and expense totals on the server', async () => {
    usersQuery.get.mockResolvedValue({
      docs: [
        {
          data: () => ({
            membership: 'regular',
            privateSessions: '12',
            endDate: '2026-09-01T00:00:00.000Z',
          }),
        },
        {
          data: () => ({
            membership: 'student',
            privateSessions: 'none',
            endDate: '2025-01-01T00:00:00.000Z',
          }),
        },
      ],
    });
    expensesQuery.get.mockResolvedValue({
      docs: [{ data: () => ({ price: 25 }) }],
    });

    const result = await new ReportsService().getSummary(
      new Date('2026-08-16T00:00:00.000Z'),
    );

    expect(result.summary).toEqual({
      totalMembers: 2,
      activeMembers: 1,
      payingMembers: 2,
      expiringSoon: 1,
      estimatedRevenue: 185,
      expensesTotal: 25,
      estimatedNet: 160,
    });
  });
});
