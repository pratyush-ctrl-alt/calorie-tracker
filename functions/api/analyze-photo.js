// Cloudflare Pages Function for POST /api/analyze-photo (the URL comes from this file's path).
// All the logic lives in server/analyze-photo.mjs so it can be tested with plain Node.
import handler from '../../server/analyze-photo.mjs';

export const onRequestPost = ({ request, env }) => handler(request, env);

// Anything other than POST gets the same "Use POST." answer as before.
export const onRequest = ({ request, env }) => handler(request, env);
