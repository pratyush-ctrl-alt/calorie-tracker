// Cloudflare Worker entry point.
// The website itself (dist/, built by the build command) is served by Cloudflare's static assets
// before this code runs; only requests that match no file reach fetch() below.
// The photo logic lives in server/analyze-photo.mjs so it can be tested with plain Node.
import handler from './server/analyze-photo.mjs';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/analyze-photo') return handler(request, env);
    return env.ASSETS.fetch(request); // anything else: the normal "not found" from the static files
  },
};
