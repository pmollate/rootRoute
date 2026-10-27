import { config } from './core/config.js';
import { buildApp } from './server.js';

import { startIntakePolling } from './modules/intake/poll.js';

const app = await buildApp();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
startIntakePolling(app.log); // E15: check Gmail every INTAKE_POLL_MINUTES (not in tests: they build the app only)
