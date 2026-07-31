// Google identity verification and session management.
//
// The single rule this file exists to enforce: NOTHING the browser says about
// who the user is, is believed. The browser hands over a token signed by
// Google; we check that signature against Google's published public keys and
// derive the identity from the verified payload only. A client-supplied user
// id, email, or "logged in" flag is never trusted anywhere in this codebase.

import { createPublicKey, verify as cryptoVerify, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { GOOGLE_CLIENT_ID, SESSION_TTL_MS, NONCE_TTL_MS } from './config.js';
import * as store from './db.js';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
/** Tolerance for clock drift between us and Google. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

// --- Google's signing keys --------------------------------------------------

let jwksCache = { keys: [], expiresAt: 0 };

async function fetchJwks() {
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new AuthError(`Could not fetch Google signing keys (${response.status})`);
  const body = await response.json();

  // Honour Google's own cache lifetime; they rotate keys on a schedule.
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
  jwksCache = { keys: body.keys ?? [], expiresAt: Date.now() + ttlMs };
  return jwksCache.keys;
}

async function signingKey(kid) {
  if (Date.now() >= jwksCache.expiresAt) await fetchJwks();
  let jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Unknown kid usually means Google rotated early. Refetch once before failing.
    await fetchJwks();
    jwk = jwksCache.keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new AuthError('Token signed with an unrecognised key');
  // Pin the key type as well as the algorithm - see verifyGoogleToken.
  if (jwk.kty !== 'RSA') throw new AuthError('Unexpected signing key type');
  return createPublicKey({ key: jwk, format: 'jwk' });
}

// --- ID token verification --------------------------------------------------

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Verify a Google ID token and return its payload.
 *
 * `expectedNonce` must be a nonce this server issued and has not yet consumed,
 * which is what stops a token captured elsewhere from being replayed here.
 */
export async function verifyGoogleToken(idToken, expectedNonce) {
  if (!GOOGLE_CLIENT_ID) throw new AuthError('Server has no GOOGLE_CLIENT_ID configured');
  if (typeof idToken !== 'string' || idToken.length > 8192) throw new AuthError('Malformed credential');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed credential');
  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  let payload;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    throw new AuthError('Malformed credential');
  }

  // Algorithm is pinned to RS256 BEFORE any key is loaded. Accepting the
  // token's own choice is the classic JWT break: "alg":"none" skips
  // verification entirely, and "HS256" tricks a naive verifier into using
  // Google's PUBLIC key as an HMAC secret - which anyone can do too.
  if (header.alg !== 'RS256') throw new AuthError('Unexpected token algorithm');
  if (!header.kid) throw new AuthError('Token has no key id');

  const key = await signingKey(header.kid);
  const signed = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64url');
  if (!cryptoVerify('RSA-SHA256', signed, key, signature)) {
    throw new AuthError('Token signature is not valid');
  }

  // Signature is good; now the claims. Each of these is load-bearing.
  const now = Date.now();
  if (!VALID_ISSUERS.has(payload.iss)) throw new AuthError('Token issued by someone other than Google');

  // Without the audience check, a token minted for ANY other Google app would
  // be accepted here - and those are handed out to any site the user visits.
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new AuthError('Token was issued for a different application');

  if (typeof payload.exp !== 'number' || payload.exp * 1000 + CLOCK_SKEW_MS < now) {
    throw new AuthError('Token has expired');
  }
  if (typeof payload.iat !== 'number' || payload.iat * 1000 - CLOCK_SKEW_MS > now) {
    throw new AuthError('Token is dated in the future');
  }
  if (!payload.sub) throw new AuthError('Token has no subject');

  // An unverified address must not be trusted: it would let someone claim an
  // address they do not control.
  if (payload.email && payload.email_verified === false) {
    throw new AuthError('Google has not verified this email address');
  }

  if (expectedNonce !== undefined) {
    if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, expectedNonce)) {
      throw new AuthError('Sign-in nonce did not match');
    }
  }

  return payload;
}

/**
 * The whole sign-in check, in the order that makes it sound. Use this rather
 * than verifyGoogleToken directly.
 *
 * Verifying the token alone proves only that it carries the nonce it was
 * handed - not that we ever issued that nonce. Consuming the nonce first is
 * what closes replay, and because a nonce is single-use, a captured token
 * cannot be presented twice. Keeping both steps behind one function means a
 * later caller cannot accidentally do the weaker half.
 */
export async function verifySignIn(credential, nonce) {
  if (!store.consumeNonce(String(nonce ?? ''), NONCE_TTL_MS)) {
    throw new AuthError('Sign-in expired. Please try again.');
  }
  return verifyGoogleToken(credential, String(nonce));
}

/** Length-safe, content-constant-time comparison. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// --- Sessions ---------------------------------------------------------------

export const SESSION_COOKIE = 'sid';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Issue a session for a verified user.
 *
 * The raw token goes to the browser in an HttpOnly cookie and is never written
 * down here; only its SHA-256 is stored. That is the same reasoning as hashing
 * passwords: a database dump should not be a set of working credentials.
 * 256 bits of entropy makes guessing infeasible, so no stretching is needed.
 */
export function issueSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  store.createSession(hashToken(token), userId, expiresAt);
  return { token, expiresAt };
}

export function userForToken(token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 256) return null;
  return store.sessionUser(hashToken(token));
}

export function revoke(token) {
  if (typeof token === 'string') store.revokeSession(hashToken(token));
}

// --- Nonces -----------------------------------------------------------------

export function newNonce() {
  const nonce = randomBytes(24).toString('base64url');
  store.issueNonce(nonce);
  return nonce;
}
