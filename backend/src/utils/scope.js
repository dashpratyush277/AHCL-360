import { isAdmin } from '../config/roles.js';
import { Distributor, User } from '../models/index.js';
import { forbidden } from './http.js';

/**
 * User ids whose data the requester may see:
 * admins => null (no restriction), managers => self + all subordinates, others => self.
 */
export async function visibleUserIds(user) {
  if (isAdmin(user)) return null;
  if (user.role === 'manager') return [user._id, ...(await User.subordinateIds(user._id))];
  return [user._id];
}

/** Mongo filter on `field` restricted to visible users; honours ?user=<id> when allowed. */
export async function userScopeFilter(user, requestedUserId, field = 'user') {
  const ids = await visibleUserIds(user);
  if (requestedUserId) {
    if (ids && !ids.some((id) => String(id) === String(requestedUserId))) throw forbidden('Not allowed to view this user');
    return { [field]: requestedUserId };
  }
  return ids ? { [field]: { $in: ids } } : {};
}

export async function assertCanManage(manager, targetUserId) {
  if (isAdmin(manager)) return;
  const subs = await User.subordinateIds(manager._id);
  if (!subs.some((id) => String(id) === String(targetUserId))) throw forbidden('This user does not report to you');
}

/**
 * Distributor ids the requester may access.
 * - admin: null (all)
 * - partner: own distributor (+ children for super distributors)
 * - employee: distributors assigned to them or to their subordinates
 */
export async function visibleDistributorIds(user) {
  if (isAdmin(user)) return null;
  if (user.userType === 'partner') {
    if (!user.distributor) return [];
    if (user.role === 'super_distributor') {
      const children = await Distributor.find({ parent: user.distributor }).distinct('_id');
      return [user.distributor, ...children];
    }
    return [user.distributor];
  }
  const ids = await visibleUserIds(user);
  return Distributor.find({ assignedEmployees: { $in: ids } }).distinct('_id');
}

export async function distributorScopeFilter(user, requested, field = 'distributor') {
  const ids = await visibleDistributorIds(user);
  if (requested) {
    if (ids && !ids.some((id) => String(id) === String(requested))) throw forbidden('Distributor not accessible');
    return { [field]: requested };
  }
  return ids ? { [field]: { $in: ids } } : {};
}

export async function assertDistributorAccess(user, distributorId) {
  await distributorScopeFilter(user, distributorId);
}
