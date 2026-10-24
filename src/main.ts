import { config } from './config.ts';
import { buildServer } from './http/server.ts';

const app = buildServer();
await app.listen({ port: config.port, host: '0.0.0.0' });
