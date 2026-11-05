// Photo logging, browser side. The Gemini call itself happens in the Netlify Function
// (netlify/functions/analyze-photo.mjs) so the Gemini key never reaches the phone.

/** Entries from the function -> log lines the normal parser understands. Pure, so it is tested. */
export function entriesToLines(entries) {
  const part = (v, suffix) => (v === null || v === undefined ? null : `${v}${suffix}`);
  return entries.map((e) => [
    e.slot, String(e.name).replace(/\|/g, '/'), `${e.kcal} kcal`, part(e.protein_g, 'g P'),
    part(e.carbs_g, 'g C'), part(e.fat_g, 'g F'), part(e.fibre_g, 'g Fib'),
  ].filter(Boolean).join(' | ')).join('\n');
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('Could not read the photo.'));
  r.readAsDataURL(blob);
});

/** Shrinks a phone photo to about 1280 px JPEG (a few hundred KB) and drops its location data. */
export async function compressImage(file, { maxSide = 1280, quality = 0.82 } = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo format is not supported. Try a JPEG or PNG.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width || bitmap.naturalWidth, h = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare the photo.');
  return { base64: await blobToBase64(blob), mime: 'image/jpeg', blob, width: canvas.width, height: canvas.height };
}

async function call(payload, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch('/api/analyze-photo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
  } catch {
    throw new Error("Can't reach the photo service. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (res.ok && json?.ok) return json;
  if (res.status === 404 || !json) {
    throw new Error('Photo logging is not available on this site yet. It needs the Netlify setup described in SETUP.md.');
  }
  throw new Error(json.error || `Photo logging failed (${res.status}).`);
}

export function analyzePhoto(conn, { base64, mime, note }) {
  return call({ token: conn.token, image: base64, mimeType: mime, note, hour: new Date().getHours() + new Date().getMinutes() / 60 }, 28000);
}

export function photoStatus(conn) {
  return call({ token: conn.token, action: 'status' }, 15000);
}
