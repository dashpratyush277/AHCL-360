import { badRequest } from '../utils/http.js';

/**
 * Validate req[source] against a zod schema. The parsed (coerced/defaulted) value is stored
 * on req.valid[source]; Express 5 makes req.query read-only so we never overwrite it.
 */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw badRequest('Validation failed', details);
    }
    req.valid = { ...(req.valid || {}), [source]: result.data };
    next();
  };
