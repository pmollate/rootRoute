import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ATLAS_FILES, ATLAS_VERSION, type AtlasFile } from './atlasVersion';

export { ATLAS_FILES, ATLAS_VERSION, atlasUrl } from './atlasVersion';

// Server code only: reads the installed package. Never import from a client component.

const TYPES: Record<AtlasFile, string> = { 'atlas.min.js': 'text/javascript; charset=utf-8', 'atlas.min.css': 'text/css; charset=utf-8' };

/**
 * One of the SDK's two files from node_modules (a dependency, so it is installed in production too), or null for any
 * other version or name: the route serves nothing else from node_modules.
 */
export async function readAtlas(version: string, file: string): Promise<{ body: Buffer; type: string } | null> {
  if (version !== ATLAS_VERSION || !(ATLAS_FILES as readonly string[]).includes(file)) return null;
  const body = await readFile(path.join(process.cwd(), 'node_modules', 'azure-maps-control', 'dist', file));
  return { body, type: TYPES[file as AtlasFile] };
}
