import { withTransaction, type Queryable } from '../db/pool';
import { donationRepository } from '../repositories/donationRepository';
import { reviewRepository } from '../repositories/reviewRepository';
import { conflict, notFound } from '../utils/errors';
import { asObject, optionalString, requiredEnum } from '../utils/validation';
import { notificationService } from './notificationService';

/**
 * Admin donation review (spec §7). This is DONATION review — recipient/NGO
 * legitimacy verification is explicitly out of scope for this project.
 */
export const reviewService = {
  async listPending(db: Queryable) {
    return donationRepository.listByStatus(db, 'PENDING_REVIEW');
  },

  async getForReview(db: Queryable, donationId: string) {
    const donation = await donationRepository.findById(db, donationId);
    if (!donation) throw notFound(`Donation '${donationId}' not found.`);
    const reviews = await reviewRepository.listByDonation(db, donationId);
    return { donation, reviews };
  },

  /**
   * Approve/reject a PENDING_REVIEW donation.
   * Row lock (SELECT ... FOR UPDATE) + transaction guarantee the same donation
   * cannot be reviewed inconsistently twice.
   */
  async review(db: Queryable, adminId: string, donationId: string, body: unknown) {
    const b = asObject(body);
    const decision = requiredEnum(b, 'decision', ['APPROVED', 'REJECTED'] as const);
    const remarks = optionalString(b, 'remarks', 1000);

    return withTransaction(db, async (tx) => {
      const donation = await donationRepository.findByIdForUpdate(tx, donationId);
      if (!donation) throw notFound(`Donation '${donationId}' not found.`);
      if (donation.status !== 'PENDING_REVIEW') {
        throw conflict(
          'ALREADY_REVIEWED',
          `Donation is ${donation.status}; only PENDING_REVIEW donations can be reviewed.`,
        );
      }

      const review = await reviewRepository.create(tx, { donationId, adminId, decision, remarks });

      if (decision === 'APPROVED') {
        // PENDING_REVIEW -> POSTED (state machine enforced)
        await donationRepository.updateStatus(tx, donationId, 'POSTED', { postedAt: true });
        await notificationService.notify(
          tx, donation.donor_id, 'DONATION_APPROVED',
          `Your donation of ${donation.quantity_servings} servings was approved and is now live for matching.`,
        );
      } else {
        await donationRepository.updateStatus(tx, donationId, 'REJECTED');
        await notificationService.notify(
          tx, donation.donor_id, 'DONATION_REJECTED',
          `Your donation was rejected during review.${remarks ? ` Remarks: ${remarks}` : ''}`,
        );
      }

      return { review, donation: await donationRepository.findById(tx, donationId) };
    });
  },
};
