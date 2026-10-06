import type { Queryable } from '../db/pool';
import { assertDonationTransition, assertInStatus } from '../domain/stateMachines';
import { donationRepository, type DonationRow } from '../repositories/donationRepository';
import { matchRepository } from '../repositories/matchRepository';
import { pickupRepository } from '../repositories/pickupRepository';
import { reviewRepository } from '../repositories/reviewRepository';
import { userRepository } from '../repositories/userRepository';
import { forbidden, notFound } from '../utils/errors';
import {
  asObject,
  optionalString,
  optionalTimestamp,
  requiredInt,
  requiredString,
  optionalNumber,
} from '../utils/validation';
import { geocodingService } from './geocodingService';
import { notificationService } from './notificationService';

/** Derived UML operations on a donation row. */
export function isActive(d: DonationRow): boolean {
  return ['POSTED', 'MATCHED'].includes(d.status) && new Date(d.expires_at) > new Date();
}

export function remainingTimeSeconds(d: DonationRow): number {
  return Math.max(0, Math.floor((new Date(d.expires_at).getTime() - Date.now()) / 1000));
}

export const donationService = {
  /** Donor submits surplus food. Always enters PENDING_REVIEW (spec §7). */
  async createDonation(db: Queryable, donorId: string, body: unknown) {
    const b = asObject(body);
    const foodType = requiredString(b, 'foodType', 80).toLowerCase().replace(/\s+/g, '_');
    const description = optionalString(b, 'description', 1000);
    const quantityServings = requiredInt(b, 'quantityServings', 1, 1_000_000);
    const pickupAddress = optionalString(b, 'pickupAddress', 300);
    const latitude = optionalNumber(b, 'latitude', -90, 90);
    const longitude = optionalNumber(b, 'longitude', -180, 180);
    const expiresAt =
      b.expiresInHours !== undefined
        ? new Date(Date.now() + Number(b.expiresInHours) * 3_600_000)
        : (() => {
            const d = optionalTimestamp(b, 'expiresAt');
            if (!d) return new Date(Date.now() + 4 * 3_600_000); // default 4 h window
            return d;
          })();
    const pickupStart = optionalTimestamp(b, 'pickupStart');
    const pickupEnd = optionalTimestamp(b, 'pickupEnd');

    const location = await geocodingService.resolve(db, { latitude, longitude, address: pickupAddress });

    const donation = await donationRepository.create(db, {
      donorId, foodType, description, quantityServings, pickupAddress,
      latitude: location.latitude, longitude: location.longitude,
      pickupStart, pickupEnd, expiresAt,
    });

    // Notify admins that a review is required (spec §14).
    const admins = await userRepository.listAdmins(db);
    await notificationService.notifyMany(
      db,
      admins.map((a) => a.user_id),
      'ADMIN_REVIEW_REQUIRED',
      `New donation ${donation.donation_id.slice(0, 8)}… (${quantityServings} servings of ${foodType}) awaits review.`,
    );

    return { donation, locationSource: location.source };
  },

  async listMine(db: Queryable, donorId: string) {
    return donationRepository.listByDonor(db, donorId);
  },

  /** Donation detail with its audit trail (review, matches, pickup) — feeds
   *  the status timeline in the UI. */
  async getDetail(db: Queryable, donationId: string, requester: { userId: string; role: string }) {
    const donation = await donationRepository.findById(db, donationId);
    if (!donation) throw notFound(`Donation '${donationId}' not found.`);
    if (requester.role === 'DONOR' && donation.donor_id !== requester.userId) {
      throw forbidden('Donors can only view their own donations.');
    }
    const [reviews, matches] = await Promise.all([
      reviewRepository.listByDonation(db, donationId),
      matchRepository.listByDonation(db, donationId),
    ]);
    const pickups = [];
    for (const m of matches) {
      const list = await pickupRepository.listForRecipient(db, m.recipient_id);
      pickups.push(...list.filter((p) => p.match_id === m.match_id));
    }
    return { donation, reviews, matches, pickups };
  },

  /** Donor cancels an eligible donation (pre-pickup). */
  async cancelDonation(db: Queryable, donationId: string, donorId: string) {
    const donation = await donationRepository.findById(db, donationId);
    if (!donation) throw notFound(`Donation '${donationId}' not found.`);
    if (donation.donor_id !== donorId) throw forbidden('Only the owning donor can cancel this donation.');
    assertInStatus('donation', donation.status, ['PENDING_REVIEW', 'POSTED'], 'cancel');
    assertDonationTransition(donation.status, 'CANCELLED');
    await donationRepository.updateStatus(db, donationId, 'CANCELLED');
    return donationRepository.findById(db, donationId);
  },
};
