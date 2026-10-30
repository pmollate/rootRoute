/**
 * E19: the Azure Maps Web SDK version the confirm page loads. Pinned exactly, and equal to `azure-maps-control` in
 * package.json (a test checks both). The atlas.microsoft.com CDN serves only the rolling major (`/mapcontrol/3/`), so the
 * app serves the pinned npm files itself: the page loads no third-party script (SEC-LINK-07).
 */
export const ATLAS_VERSION = '3.7.4';
export const ATLAS_FILES = ['atlas.min.js', 'atlas.min.css'] as const;
export type AtlasFile = (typeof ATLAS_FILES)[number];
export const atlasUrl = (file: AtlasFile) => `/confirm-map/${ATLAS_VERSION}/${file}`;
