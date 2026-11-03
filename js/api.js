// Talks to your Supabase project. No supabase-js library: just fetch.
//
// Everything goes through the plate_* database functions (see supabase/schema.sql), called as
//   POST {project url}/rest/v1/rpc/<function>
// with the public ("anon" / publishable) key in the `apikey` header and your shared token in the body.
// The key alone can do nothing: the tables are locked and every function checks the token.

export class NetError extends Error {
  constructor(message) { super(message); this.network = true; }
}
export class ServerError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** Problems with the connection setup itself (not one bad entry): sync must stop and tell the user. */
const FATAL = new Set(['bad_token', 'bad_key', 'bad_url', 'no_schema']);
export const isFatal = (err) => FATAL.has(err?.code);

function cleanConn(conn) {
  const url = String(conn?.url ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(url)) {
    throw new ServerError('The project URL should look like https://abcdefgh.supabase.co', 'bad_url');
  }
  const key = String(conn?.key ?? '').trim();
  if (!key) throw new ServerError('Paste the public key (anon / publishable) from Supabase: Project Settings, API.', 'bad_key');
  return { url, key, token: String(conn?.token ?? '').trim() };
}

async function rpc(conn, fn, args = {}, timeoutMs = 20000) {
  const c = cleanConn(conn);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.key },
        body: JSON.stringify({ p_token: c.token, ...args }),
        signal: ctl.signal,
      });
    } catch {
      throw new NetError("Can't reach the database (network error or timeout)");
    }
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }

    if (res.ok) {
      if (body === null) throw new NetError('The database answered with something unexpected.');
      return body;
    }
    const msg = String(body?.message ?? '');
    if (res.status >= 500) {
      throw new NetError('The database did not answer properly. If your Supabase project is paused, restore it from the Supabase dashboard.');
    }
    if (res.status === 401 || res.status === 403) {
      if (/api key|apikey|jwt/i.test(msg) || body?.code === 'PGRST301') {
        throw new ServerError('Supabase rejected the public key. Copy it again from Project Settings, API.', 'bad_key');
      }
      throw new ServerError(msg || 'Wrong or missing token.', 'bad_token');
    }
    if (res.status === 404 || body?.code === 'PGRST202') {
      throw new ServerError('The database tables are not set up yet. Run supabase/schema.sql in the Supabase SQL Editor (see SETUP.md).', 'no_schema');
    }
    throw new ServerError(msg || `The database returned an error (${res.status}).`, body?.code);
  } finally {
    clearTimeout(timer);
  }
}

export const ping = (conn) => rpc(conn, 'plate_ping');
export const list = (conn, from, to) => rpc(conn, 'plate_list', { p_from: from, p_to: to });
export const config = (conn) => rpc(conn, 'plate_config');
export const upsert = (conn, entries) => rpc(conn, 'plate_upsert', { p_entries: entries });
export const saveItem = (conn, item) => rpc(conn, 'plate_save_item', { p_item: item });
export const deleteItem = (conn, name) => rpc(conn, 'plate_delete_item', { p_name: name });
export const saveSettings = (conn, settings) => rpc(conn, 'plate_save_settings', { p_settings: settings });
