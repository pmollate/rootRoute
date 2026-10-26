import { dbOk } from '../src/core/db/pool.js';

/** Route tests need the test database filled by `python -m analytics.pipeline --test-db` and migrations. */
export const hasDb = await dbOk();
