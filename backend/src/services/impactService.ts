import type { Queryable } from '../db/pool';

/**
 * Impact service (spec §15, §26). Every metric is computed from persisted
 * timestamps/rows — nothing is faked.
 *
 * ASSUMPTION (documented, not a measured fact): the domain model stores
 * servings, not weight. We convert with WASTE_KG_PER_SERVING = 0.45 kg,
 * a common planning figure (~450 g per prepared meal). Override via env.
 */

const WASTE_KG_PER_SERVING = Number(process.env.WASTE_KG_PER_SERVING ?? 0.45);

export const impactService = {
  async summary(db: Queryable) {
    const completed = await db.query<{ meals: string; count: string }>(
      `SELECT COALESCE(SUM(quantity_servings),0)::text AS meals, COUNT(*)::text AS count
       FROM donations WHERE status = 'COMPLETED'`,
    );

    // Time-to-Match (primary proposal metric): matched_at - posted_at,
    // only for donations that actually reached a match.
    const ttm = await db.query<{ avg_seconds: number | null; median_seconds: number | null; samples: string }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (matched_at - posted_at))) AS avg_seconds,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (matched_at - posted_at))) AS median_seconds,
              COUNT(*)::text AS samples
       FROM donations WHERE posted_at IS NOT NULL AND matched_at IS NOT NULL`,
    );

    const unmatched = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM donations WHERE status = 'POSTED'`,
    );
    const reviewed = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM donations
       WHERE status IN ('POSTED','MATCHED','PICKED_UP','COMPLETED','EXPIRED')`,
    );
    const expired = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM donations WHERE status = 'EXPIRED'`,
    );
    const waitlisted = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM matching_waitlist`,
    );

    const topDonors = await db.query<{ donor_id: string; name: string; meals: string; donations: string }>(
      `SELECT d.donor_id, u.name,
              SUM(d.quantity_servings)::text AS meals, COUNT(*)::text AS donations
       FROM donations d JOIN users u ON u.user_id = d.donor_id
       WHERE d.status = 'COMPLETED'
       GROUP BY d.donor_id, u.name
       ORDER BY SUM(d.quantity_servings) DESC
       LIMIT 5`,
    );

    const mealsRedistributed = Number(completed.rows[0]!.meals);
    const reviewedCount = Number(reviewed.rows[0]!.count);
    const unmatchedCount = Number(unmatched.rows[0]!.count);

    return {
      mealsRedistributed, // completed redistributions only
      completedDonations: Number(completed.rows[0]!.count),
      wasteDivertedKg: Math.round(mealsRedistributed * WASTE_KG_PER_SERVING * 100) / 100,
      wasteAssumptionKgPerServing: WASTE_KG_PER_SERVING,
      timeToMatch: {
        avgSeconds: ttm.rows[0]!.avg_seconds === null ? null : Math.round(Number(ttm.rows[0]!.avg_seconds)),
        medianSeconds: ttm.rows[0]!.median_seconds === null ? null : Math.round(Number(ttm.rows[0]!.median_seconds)),
        samples: Number(ttm.rows[0]!.samples),
      },
      unmatchedCount,
      unmatchedRate: reviewedCount === 0 ? 0 : Math.round((unmatchedCount / reviewedCount) * 1000) / 1000,
      waitlistedCount: Number(waitlisted.rows[0]!.count),
      expiredCount: Number(expired.rows[0]!.count),
      topDonors: topDonors.rows.map((r) => ({
        donorId: r.donor_id, name: r.name, meals: Number(r.meals), donations: Number(r.donations),
      })),
    };
  },
};
