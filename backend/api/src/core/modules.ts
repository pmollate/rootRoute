import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const EXT = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

/** Register every api/src/modules/<area>/routes.(ts|js) under the /api prefix. */
export async function registerModules(app: FastifyInstance): Promise<string[]> {
  const dir = fileURLToPath(new URL('../modules/', import.meta.url));
  const loaded: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const file = `${dir}${name}/routes.${EXT}`;
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { default: FastifyPluginAsync };
    await app.register(mod.default, { prefix: '/api' });
    loaded.push(name);
  }
  return loaded;
}
