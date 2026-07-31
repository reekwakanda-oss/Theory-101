// The application server: static files plus a small authenticated API.
// Zero npm dependencies - node:http, node:sqlite and node:crypto only.
//
// Run it with:  node server/server.js
// It replaces `python -m http.server`, which cannot hold sessions and speaks
// HTTP/1.0 (a new TCP connection per asset - painful through a tunnel).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import {
  PORT, HOST, GOOGLE_CLIENT_ID, SECURE_COOKIES, ALLOWED_ORIGINS,
  MAX_BODY_BYTES, RATE_LIMITS, NONCE_TTL_MS, assertProductionSafety,
  ASSISTANT_ENABLED, ASSISTANT_COOLDOWN_MS, ASSISTANT_DAILY_LIMIT,
} from './config.js';
import {
  validateContext, claimAssistantTurn, releaseAssistantTurn, assistantStatus, askTutor,
} from './assistant.js';
import * as store from './db.js';
import {
  verifySignIn, issueSession, userForToken, revoke, newNonce,
  SESSION_COOKIE, AuthError,
} from './auth.js';
// Shared with the browser on purpose: one definition of what a progress record
// is, so client and server can never disagree about it. The server still
// validates everything it receives - sharing the rules is not trusting the
// caller to have applied them.
import { validateProgress, mergeProgress } from '../src/progress-schema.js';

const ROOT = resolve(process.cwd());
/** Never served, whatever the URL says. */
const FORBIDDEN = ['server', '.git', 'node_modules', '.impeccable', '.claude', '.agents'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

// --- Small helpers ----------------------------------------------------------

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body)
      ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...securityHeaders(),
    ...headers,
  });
  res.end(payload);
}

/**
 * Sent on every response.
 *
 * The CSP is strict because it can be: the app has no inline scripts, no
 * inline event handlers and no eval, so script-src needs no 'unsafe-inline'.
 * The only third party permitted is Google's sign-in widget.
 */
function securityHeaders() {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com/gsi/client",
      "frame-src https://accounts.google.com/gsi/",
      "connect-src 'self' https://accounts.google.com/gsi/",
      // 'unsafe-inline' here is scoped to STYLES and is deliberate: Google's
      // sign-in script injects inline CSS into this document, and without it
      // the button renders broken. A hash would pin to Google's current CSS
      // and fail silently the next time they change it. script-src stays
      // strict, which is the directive that actually stops code execution.
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
      // No avatars are rendered, so no third-party image host is permitted -
      // one fewer request telling Google which pages are being viewed.
      "img-src 'self' data:",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    ...(SECURE_COOKIES ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

function cookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part.trim(), ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function sessionCookie(token, maxAgeSeconds) {
  // HttpOnly is the important one: it puts the session out of reach of
  // JavaScript, so an XSS bug cannot read it. Storing sessions in
  // localStorage - the obvious shortcut - gives that protection up entirely.
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (SECURE_COOKIES) parts.push('Secure');
  return parts.join('; ');
}

/** A request we refuse to finish reading. The connection cannot be reused. */
class PayloadTooLarge extends AuthError {
  constructor() {
    super('Request body too large');
    this.status = 413;
    this.closeConnection = true;
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Stop reading as soon as the cap is passed, rather than buffering the
    // whole thing to find out it was too big.
    if (size > MAX_BODY_BYTES) throw new PayloadTooLarge();
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AuthError('Body was not valid JSON');
  }
}

// --- Rate limiting ----------------------------------------------------------

const buckets = new Map();

function rateLimited(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return true;
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

const clientIp = (req) => req.socket.remoteAddress ?? 'unknown';

// --- CSRF -------------------------------------------------------------------

/**
 * SameSite=Lax already stops the cookie riding along on cross-site POSTs.
 * Checking Origin as well means a browser that mishandles SameSite, or a
 * future switch to None, does not silently open a CSRF hole.
 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations may omit it
  return ALLOWED_ORIGINS.includes(origin);
}

// --- Session ----------------------------------------------------------------

function currentUser(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const user = userForToken(token);
  return user ? { ...user, token } : null;
}

const publicUser = (user) => (user ? {
  name: user.name, email: user.email, picture: user.picture,
} : null);

// --- API --------------------------------------------------------------------

async function handleApi(req, res, path) {
  const method = req.method;

  if (method !== 'GET' && !originAllowed(req)) {
    return send(res, 403, { error: 'Request origin is not allowed' });
  }

  // Where sign-in starts: the browser gets a single-use nonce to hand Google,
  // which comes back inside the signed token and proves the token was minted
  // for this attempt rather than captured from another one.
  if (path === '/api/auth/nonce' && method === 'GET') {
    if (rateLimited(`auth:${clientIp(req)}`, RATE_LIMITS.auth)) {
      return send(res, 429, { error: 'Too many sign-in attempts. Try again shortly.' });
    }
    if (!GOOGLE_CLIENT_ID) {
      return send(res, 503, { error: 'Sign-in is not configured on this server.', configured: false });
    }
    return send(res, 200, { nonce: newNonce(), clientId: GOOGLE_CLIENT_ID, configured: true });
  }

  if (path === '/api/auth/google' && method === 'POST') {
    if (rateLimited(`auth:${clientIp(req)}`, RATE_LIMITS.auth)) {
      return send(res, 429, { error: 'Too many sign-in attempts. Try again shortly.' });
    }
    const body = await readBody(req);
    // Consumes the nonce and verifies the token as one step - see verifySignIn.
    const claims = await verifySignIn(body.credential, body.nonce);
    const user = store.upsertUser({
      sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture,
    });

    // A brand new session token on every sign-in, so a token captured before
    // login cannot be elevated by logging in (session fixation).
    const { token, expiresAt } = issueSession(user.id);

    // Anything practised before signing in is folded in rather than lost.
    if (body.localProgress !== undefined && body.localProgress !== null) {
      const incoming = validateProgress(body.localProgress);
      if (incoming) {
        const existing = store.loadProgress(user.id)?.data ?? null;
        store.saveProgress(user.id, existing ? mergeProgress(existing, incoming) : incoming);
      }
    }

    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
    return send(res, 200,
      { user: publicUser(user), progress: store.loadProgress(user.id)?.data ?? null },
      { 'Set-Cookie': sessionCookie(token, maxAge) });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const user = currentUser(req);
    if (user) revoke(user.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  if (path === '/api/me' && method === 'GET') {
    const user = currentUser(req);
    return send(res, 200, { user: publicUser(user), configured: Boolean(GOOGLE_CLIENT_ID) });
  }

  // What the tutor panel needs to decide whether to mount itself at all, and
  // how long it must wait. The budget is reported, never the key.
  if (path === '/api/assistant' && method === 'GET') {
    const user = currentUser(req);
    return send(res, 200, {
      configured: ASSISTANT_ENABLED,
      signedIn: Boolean(user),
      cooldownMs: ASSISTANT_COOLDOWN_MS,
      dailyLimit: ASSISTANT_DAILY_LIMIT,
      ...(user ? assistantStatus(user.user_id) : {}),
    });
  }

  if (path === '/api/assistant' && method === 'POST') {
    if (!ASSISTANT_ENABLED) {
      return send(res, 503, { error: 'The tutor is not configured on this server.', configured: false });
    }
    // Signed-in only: the per-account budget below is the only limit that
    // cannot be sidestepped by changing IP.
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Sign in to ask the tutor.' });
    if (rateLimited(`ai:${clientIp(req)}`, RATE_LIMITS.assistant)) {
      return send(res, 429, { error: 'Slow down' });
    }

    // Order matters. Validating first means a malformed request never costs a
    // daily question; claiming before the call means a slow provider cannot be
    // used to slip past the cooldown.
    const body = await readBody(req);
    const checked = validateContext(body);
    if (!checked.ok) return send(res, 400, { error: checked.error });

    const claim = claimAssistantTurn(user.user_id);
    if (!claim.ok) {
      return send(res, 429,
        { error: claim.error, reason: claim.reason, retryAfterMs: claim.retryAfterMs, resetAt: claim.resetAt },
        { 'Retry-After': String(Math.ceil(claim.retryAfterMs / 1000)) });
    }

    const result = await askTutor(checked);
    if (!result.ok) {
      // They got nothing, so give the question back - but not the cooldown,
      // or a failing provider invites a retry loop.
      releaseAssistantTurn(user.user_id);
      return send(res, result.status ?? 502, { error: result.error });
    }
    return send(res, 200, {
      reply: result.reply,
      cooldownMs: ASSISTANT_COOLDOWN_MS,
      remaining: claim.remaining,
    });
  }

  if (path === '/api/progress') {
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Not signed in' });

    if (method === 'GET') {
      if (rateLimited(`read:${clientIp(req)}`, RATE_LIMITS.read)) {
        return send(res, 429, { error: 'Slow down' });
      }
      const row = store.loadProgress(user.user_id);
      return send(res, 200, { progress: row?.data ?? null, updatedAt: row?.updatedAt ?? null });
    }

    if (method === 'PUT') {
      if (rateLimited(`write:${clientIp(req)}`, RATE_LIMITS.write)) {
        return send(res, 429, { error: 'Slow down' });
      }
      const body = await readBody(req);
      // Never stored as received. Unknown keys are dropped and values are
      // clamped, so a tampered payload cannot poison the record or grow it.
      const clean = validateProgress(body.progress);
      if (!clean) return send(res, 400, { error: 'Progress payload was not valid' });
      // The row is keyed by the session's user, never by an id from the body.
      const updatedAt = store.saveProgress(user.user_id, clean);
      return send(res, 200, { ok: true, updatedAt });
    }
  }

  if (path === '/api/account' && method === 'DELETE') {
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Not signed in' });
    store.deleteAccount(user.user_id); // cascades to sessions and progress
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  return send(res, 404, { error: 'No such endpoint' });
}

// --- Static files -----------------------------------------------------------

async function serveStatic(req, res, path) {
  const relative = path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, '');
  const target = resolve(ROOT, relative);

  // Containment check: resolve() collapses ../ so anything that escapes the
  // project root is caught here rather than read off the disk.
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    return send(res, 403, 'Forbidden');
  }
  const segments = target.slice(ROOT.length).split(sep).filter(Boolean);
  if (segments.some((s) => FORBIDDEN.includes(s) || s.startsWith('.'))) {
    return send(res, 404, 'Not found');
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) return serveStatic(req, res, join(path, 'index.html'));
    const body = await readFile(target);
    return send(res, 200, body, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      // The app is edited live; never let a stale module linger.
      'Cache-Control': 'no-cache',
    });
  } catch {
    return send(res, 404, 'Not found');
  }
}

// --- Wiring -----------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) return await handleApi(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, path);
  } catch (error) {
    // Error text is never echoed to the client beyond a safe summary; the
    // detail goes to the server log where it belongs.
    const clientSafe = error instanceof AuthError ? error.message : 'Something went wrong';
    if (!(error instanceof AuthError)) console.error('[error]', error);
    const status = error.status ?? (error instanceof AuthError ? 400 : 500);

    if (error.closeConnection) {
      // The request body was abandoned part-read, so this connection still has
      // bytes queued on it. Reusing it would corrupt the next request, and a
      // keep-alive client would see the reset instead of this response - so
      // say so in the headers and drop the socket once the reply is out.
      send(res, status, { error: clientSafe }, { Connection: 'close' });
      res.on('finish', () => req.socket?.destroy());
      return undefined;
    }
    return send(res, status, { error: clientSafe });
  }
});

const problems = assertProductionSafety();
if (problems.some((p) => p.includes('production'))) {
  console.error('Refusing to start:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}
for (const p of problems) console.warn('[warning]', p);

setInterval(() => store.purgeExpired(NONCE_TTL_MS), 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Theory 101 on http://localhost:${PORT}`);
  console.log(`  sign-in: ${GOOGLE_CLIENT_ID ? 'configured' : 'NOT configured (set GOOGLE_CLIENT_ID)'}`);
  console.log(`  tutor:   ${ASSISTANT_ENABLED ? 'configured' : 'NOT configured (set FIREWORKS_API_KEY)'}`);
  console.log(`  cookies: ${SECURE_COOKIES ? 'Secure' : 'not Secure (development only)'}`);
});

export { server };
