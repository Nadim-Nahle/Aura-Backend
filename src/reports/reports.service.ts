import { Injectable } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';

const MEMBERSHIP_RATES: Record<string, number> = {
  student: 35,
  regular: 50,
};
const PRIVATE_SESSION_RATES: Record<string, number> = {
  '1': 10,
  '12': 100,
  '16': 130,
  '20': 160,
};

export interface AdminReportSummary {
  totalMembers: number;
  activeMembers: number;
  payingMembers: number;
  expiringSoon: number;
  estimatedRevenue: number;
  expensesTotal: number;
  estimatedNet: number;
}

export interface TimedAdminReportSummary {
  summary: AdminReportSummary;
  timings: Record<string, number>;
}

@Injectable()
export class ReportsService {
  async getSummary(now = new Date()): Promise<TimedAdminReportSummary> {
    const firestore = getFirestore();
    const usersStartedAt = performance.now();
    const usersPromise = firestore
      .collection('users')
      .select('membership', 'privateSessions', 'endDate')
      .get()
      .then((snapshot) => ({
        docs: snapshot.docs,
        durationMs: performance.now() - usersStartedAt,
      }));
    const expensesStartedAt = performance.now();
    const expensesPromise = firestore
      .collection('expenses')
      .select('price')
      .get()
      .then((snapshot) => ({
        docs: snapshot.docs,
        durationMs: performance.now() - expensesStartedAt,
      }));
    const [usersResult, expensesResult] = await Promise.all([
      usersPromise,
      expensesPromise,
    ]);

    const nowMs = now.getTime();
    const expiringThreshold = nowMs + 30 * 24 * 60 * 60 * 1000;
    let activeMembers = 0;
    let payingMembers = 0;
    let expiringSoon = 0;
    let estimatedRevenue = 0;

    for (const document of usersResult.docs) {
      const user = document.data();
      const membership = String(user.membership ?? 'none');
      const privateSessions = String(user.privateSessions ?? 'none');
      const endDateMs = Date.parse(String(user.endDate ?? ''));
      const hasMembership = membership !== 'none';

      if (hasMembership) payingMembers += 1;
      if (hasMembership && Number.isFinite(endDateMs) && endDateMs >= nowMs) {
        activeMembers += 1;
        if (endDateMs <= expiringThreshold) expiringSoon += 1;
      }
      estimatedRevenue +=
        (MEMBERSHIP_RATES[membership] ?? 0) +
        (PRIVATE_SESSION_RATES[privateSessions] ?? 0);
    }

    const expensesTotal = expensesResult.docs.reduce(
      (total, document) => total + (Number(document.data().price) || 0),
      0,
    );

    return {
      summary: {
        totalMembers: usersResult.docs.length,
        activeMembers,
        payingMembers,
        expiringSoon,
        estimatedRevenue,
        expensesTotal,
        estimatedNet: estimatedRevenue - expensesTotal,
      },
      timings: {
        summary_users: usersResult.durationMs,
        summary_expenses: expensesResult.durationMs,
      },
    };
  }
}
