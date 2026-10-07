import { Router } from 'express';
import { z } from 'zod';
import { requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Attendance, Distributor, Retailer, Visit } from '../models/index.js';
import { distanceBetween } from '../services/tracking.js';
import { dayKey, dayRange, rangeFromQuery } from '../utils/dates.js';
import { haversineKm } from '../utils/geo.js';
import { badRequest, notFound, paged } from '../utils/http.js';
import { userScopeFilter } from '../utils/scope.js';

const r = Router();
r.use(requireUserType('employee'));

const VISIT_RADIUS_M = 300;
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const visitSchema = z.object({
  clientName: z.string().min(1),
  clientType: z.enum(['distributor', 'retailer', 'prospect', 'other']).default('other'),
  distributor: objectId.optional(),
  retailer: objectId.optional(),
  purpose: z.string().min(1),
  notes: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  time: z.coerce.date().optional(),
  clientId: z.string().optional(),
});

/**
 * Check in at a client. Validates location against the client's saved GPS (if any) and
 * computes the distance travelled since the previous visit (or day start) from the GPS trail.
 */
export async function createVisit(user, body) {
  const time = body.time || new Date();
  const date = dayKey(time);
  if (body.clientId) {
    const dup = await Visit.findOne({ user: user._id, clientId: body.clientId });
    if (dup) return dup;
  }

  const open = await Visit.findOne({ user: user._id, date, 'checkOut.time': null });
  if (open) throw badRequest(`Check out of "${open.clientName}" before starting a new visit`);

  let locationValid = true;
  let locationRemark;
  const client = body.retailer ? await Retailer.findById(body.retailer) : body.distributor ? await Distributor.findById(body.distributor) : null;
  if (client?.location?.lat != null) {
    const meters = Math.round(haversineKm(body, client.location) * 1000);
    locationValid = meters <= VISIT_RADIUS_M;
    if (!locationValid) locationRemark = `Checked in ${meters} m away from client's registered location`;
  }

  const prev = await Visit.findOne({ user: user._id, date }).sort({ 'checkIn.time': -1 });
  const att = await Attendance.findOne({ user: user._id, date });
  const since = prev?.checkOut?.time || prev?.checkIn.time || att?.checkIn?.time || dayRange(date).start;
  const distanceKm = await distanceBetween(user._id, since, time);

  return Visit.create({
    user: user._id,
    date,
    clientName: body.clientName,
    clientType: body.clientType,
    distributor: body.distributor,
    retailer: body.retailer,
    purpose: body.purpose,
    notes: body.notes,
    checkIn: { time, lat: body.lat, lng: body.lng, accuracy: body.accuracy },
    distanceKm,
    locationValid,
    locationRemark,
    clientId: body.clientId,
  });
}

export async function checkOutVisit(user, id, body) {
  const visit = await Visit.findOne({ _id: id, user: user._id });
  if (!visit) throw notFound('Visit not found');
  if (visit.checkOut?.time) return visit;
  visit.checkOut = { time: body.time || new Date(), lat: body.lat, lng: body.lng, accuracy: body.accuracy };
  if (body.notes) visit.notes = [visit.notes, body.notes].filter(Boolean).join('\n');
  const away = haversineKm(visit.checkIn, visit.checkOut) * 1000;
  if (away > VISIT_RADIUS_M) {
    visit.locationValid = false;
    visit.locationRemark = [visit.locationRemark, `Checked out ${Math.round(away)} m from check-in point`].filter(Boolean).join('; ');
  }
  return visit.save();
}

r.post('/', validate(visitSchema), async (req, res) => res.status(201).json(await createVisit(req.user, req.valid.body)));

r.post(
  '/:id/check-out',
  validate(z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional(), notes: z.string().optional(), time: z.coerce.date().optional() })),
  async (req, res) => res.json(await checkOutVisit(req.user, req.params.id, req.valid.body)),
);

r.get('/', async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || (req.query.team ? undefined : req.user._id));
  const { from, to } = rangeFromQuery(req.query);
  const filter = { ...scope, 'checkIn.time': { $gte: from, $lt: to } };
  if (req.query.date) filter.date = req.query.date;
  res.json(await paged(Visit, filter, req.query, { sort: { 'checkIn.time': -1 }, populate: { path: 'user', select: 'name employeeCode' } }));
});

r.get('/:id', async (req, res) => {
  const scope = await userScopeFilter(req.user);
  const visit = await Visit.findOne({ _id: req.params.id, ...scope }).populate('user', 'name').populate('retailer', 'name shopName').populate('distributor', 'name code');
  if (!visit) throw notFound('Visit not found');
  res.json(visit);
});

export default r;
