import { withTransaction, type Queryable } from '../db/pool';
import { assertDonationTransition, assertInStatus, assertPickupTransition } from '../domain/stateMachines';
import { donationRepository } from '../repositories/donationRepository';
import { matchRepository } from '../repositories/matchRepository';
import { pickupRepository } from '../repositories/pickupRepository';
import { userRepository } from '../repositories/userRepository';
import { forbidden, notFound } from '../utils/errors';
import { notificationService } from './notificationService';

/**
 * Pickup lifecycle (spec §13):
 *   Match ACCEPTED -> Pickup SCHEDULED (done in matchingService.acceptMatch)
 *   Pickup SCHEDULED -> PICKED_UP   &&  Donation MATCHED -> PICKED_UP
 *   Pickup PICKED_UP -> COMPLETED   &&  Donation PICKED_UP -> COMPLETED
 * Both state changes happen in one transaction so they can never diverge.
 */
export const pickupService = {
  async listMine(db: Queryable, userId: string, role: string) {
    if (role === 'RECIPIENT') return pickupRepository.listForRecipient(db, userId);
    if (role === 'DONOR') return pickupRepository.listForDonor(db, userId);
    // admin: everything
    const r = await db.query(`SELECT p.*, m.donation_id, m.recipient_id FROM pickups p JOIN matches m ON m.match_id = p.match_id ORDER BY p.created_at DESC`);
    return r.rows;
  },

  async get(db: Queryable, pickupId: string) {
    const pickup = await pickupRepository.findById(db, pickupId);
    if (!pickup) throw notFound(`Pickup '${pickupId}' not found.`);
    return pickup;
  },

  async markPickedUp(db: Queryable, pickupId: string, actor: { userId: string; role: string }) {
    return withTransaction(db, async (tx) => {
      const pickup = await pickupRepository.findByIdForUpdate(tx, pickupId);
      if (!pickup) throw notFound(`Pickup '${pickupId}' not found.`);
      const match = await matchRepository.findByIdForUpdate(tx, pickup.match_id);
      if (!match) throw notFound('Match for this pickup no longer exists.');
      if (actor.role === 'RECIPIENT' && match.recipient_id !== actor.userId) {
        throw forbidden('This pickup belongs to another recipient.');
      }
      const donation = await donationRepository.findByIdForUpdate(tx, match.donation_id);
      if (!donation) throw notFound('Donation for this pickup no longer exists.');

      assertPickupTransition(pickup.status, 'PICKED_UP');
      assertDonationTransition(donation.status, 'PICKED_UP');
      await pickupRepository.setStatus(tx, pickupId, 'PICKED_UP');
      await donationRepository.updateStatus(tx, donation.donation_id, 'PICKED_UP');

      await notificationService.notify(tx, donation.donor_id, 'PICKUP_PICKED_UP',
        `Pickup confirmed: ${donation.quantity_servings} servings of ${donation.food_type} were picked up.`);
      await notificationService.notify(tx, match.recipient_id, 'PICKUP_PICKED_UP',
        `Pickup recorded for ${donation.quantity_servings} servings of ${donation.food_type}.`);

      return pickupRepository.findById(tx, pickupId);
    });
  },

  async markCompleted(db: Queryable, pickupId: string, actor: { userId: string; role: string }) {
    return withTransaction(db, async (tx) => {
      const pickup = await pickupRepository.findByIdForUpdate(tx, pickupId);
      if (!pickup) throw notFound(`Pickup '${pickupId}' not found.`);
      const match = await matchRepository.findByIdForUpdate(tx, pickup.match_id);
      if (!match) throw notFound('Match for this pickup no longer exists.');
      if (actor.role === 'RECIPIENT' && match.recipient_id !== actor.userId) {
        throw forbidden('This pickup belongs to another recipient.');
      }
      const donation = await donationRepository.findByIdForUpdate(tx, match.donation_id);
      if (!donation) throw notFound('Donation for this pickup no longer exists.');

      assertPickupTransition(pickup.status, 'COMPLETED');
      assertDonationTransition(donation.status, 'COMPLETED');
      await pickupRepository.setStatus(tx, pickupId, 'COMPLETED');
      await donationRepository.updateStatus(tx, donation.donation_id, 'COMPLETED');

      // Update impact-relevant counters atomically with the transition.
      await userRepository.addMealsToDonor(tx, donation.donor_id, donation.quantity_servings);
      await userRepository.adjustAssignedServings(tx, match.recipient_id, -donation.quantity_servings);

      await notificationService.notify(tx, donation.donor_id, 'REDISTRIBUTION_COMPLETED',
        `Redistribution completed — thank you! ${donation.quantity_servings} servings reached people in need.`);
      await notificationService.notify(tx, match.recipient_id, 'REDISTRIBUTION_COMPLETED',
        `Redistribution of ${donation.quantity_servings} servings completed.`);

      return pickupRepository.findById(tx, pickupId);
    });
  },
};
