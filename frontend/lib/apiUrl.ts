// Server code only: reads API_URL from the environment. Never import from a client component.

/**
 * The API's base URL for server-side calls (the /api proxy and the address link page), without a trailing slash.
 * `API_URL` is the setting (config/environments, App Service); the old NEXT_PUBLIC_API_URL build value is read until
 * step 7 retires it; with neither set, a local `npm run dev:all` API.
 */
export const apiUrl = (): string =>
  (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
