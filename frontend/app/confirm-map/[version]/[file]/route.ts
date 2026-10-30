import { ATLAS_FILES, ATLAS_VERSION, readAtlas } from '@/lib/confirm/atlas';

/**
 * E19: the pinned Azure Maps Web SDK (script and stylesheet) from the app's own origin, built once as static files.
 * A library file like the ones in public/: no data, no token, no setting (SEC-LINK-07, -08). Any other path is 404.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => ATLAS_FILES.map((file) => ({ version: ATLAS_VERSION, file }));

type Ctx = { params: Promise<{ version: string; file: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { version, file } = await params;
  const f = await readAtlas(version, file);
  if (!f) return new Response('Not found', { status: 404 });
  // The version is in the path, so the file never changes under its URL.
  return new Response(new Uint8Array(f.body), { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=31536000, immutable' } });
}
