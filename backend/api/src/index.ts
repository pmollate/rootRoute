import { config } from './core/config.js';
import { buildApp } from './server.js';

const app = await buildApp();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
