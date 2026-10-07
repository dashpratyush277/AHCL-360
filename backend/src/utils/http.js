export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Parse ?page & ?limit into mongoose skip/limit. */
export function paginate(query, defaultLimit = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/** Run a find query with pagination and return { items, total, page, limit }. */
export async function paged(Model, filter, query, { sort = { createdAt: -1 }, populate } = {}) {
  const { page, limit, skip } = paginate(query);
  let q = Model.find(filter).sort(parseSort(query.sort) || sort).skip(skip).limit(limit);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
  return { items, total, page, limit };
}

/** "?sort=-createdAt,name" -> { createdAt: -1, name: 1 } */
function parseSort(s) {
  if (!s) return null;
  return Object.fromEntries(
    String(s)
      .split(',')
      .filter(Boolean)
      .map((f) => (f.startsWith('-') ? [f.slice(1), -1] : [f, 1])),
  );
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
