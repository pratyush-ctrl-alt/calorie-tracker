// Talks to the Google Apps Script web app. No keys of any kind other than the shared token the
// user types into Settings.
//
// POST bodies are JSON sent as text/plain so the browser makes a "simple" request (no CORS preflight,
// which Apps Script cannot answer). Reads are GETs with query params.

export class NetError extends Error {
  constructor(message) { super(message); this.network = true; }
}
export class ServerError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function request(url, init, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, { ...init, signal: ctl.signal, redirect: 'follow' });
    } catch {
      throw new NetError("Can't reach the Sheet (network error or timeout)");
    }
    try {
      return await res.json();
    } catch {
      throw new NetError('The Apps Script URL did not answer with JSON. Check the URL, and that the web app is shared with "Anyone".');
    }
  } finally {
    clearTimeout(timer);
  }
}

function check(json) {
  if (!json || json.ok !== true) throw new ServerError(json?.error || 'The Sheet returned an error', json?.code);
  return json;
}

function cleanUrl(conn) {
  const url = String(conn?.url ?? '').trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    throw new ServerError('The Apps Script URL should start with https://script.google.com/', 'bad_url');
  }
  return url;
}

export async function get(conn, action, params = {}) {
  const url = cleanUrl(conn);
  const q = new URLSearchParams({ action, token: conn.token ?? '', ...params });
  return check(await request(`${url}${url.includes('?') ? '&' : '?'}${q}`, { method: 'GET' }));
}

export async function post(conn, action, payload = {}) {
  const url = cleanUrl(conn);
  const body = JSON.stringify({ token: conn.token ?? '', action, ...payload });
  return check(await request(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }));
}

export const ping = (conn) => get(conn, 'ping');
export const list = (conn, from, to) => get(conn, 'list', { from, to });
export const config = (conn) => get(conn, 'config');
export const upsert = (conn, entries) => post(conn, 'upsert', { entries });
export const saveItem = (conn, item) => post(conn, 'saveItem', { item });
export const deleteItem = (conn, name) => post(conn, 'deleteItem', { name });
export const saveSettings = (conn, settings) => post(conn, 'saveSettings', { settings });
