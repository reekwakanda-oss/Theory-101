// Sign-in, from the browser's side.
//
// Deliberately thin. The session lives in an HttpOnly cookie this file cannot
// read, which is the point: if this script were ever compromised it still
// could not exfiltrate the session. Everything here is UI state - the server
// re-derives who you are from the cookie on every request.
//
// The app must stay fully usable with all of this switched off, so every call
// fails soft: no server, no configured client id, or no network leaves you
// working locally exactly as before.

const GSI_SRC = 'https://accounts.google.com/gsi/client';

let state = { user: null, configured: false, ready: false, error: null };
const listeners = new Set();

export function authState() {
  return state;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Update and notify - but only when something actually changed.
 *
 * The guard is load-bearing, not an optimisation. Listeners repaint, repainting
 * re-renders the sign-in button, and a button that cannot load (blocked script,
 * offline, bad client id) reports the same failure again. Without the
 * comparison that is an infinite render loop, and it fires in exactly the
 * situation where the app most needs to stay calm.
 */
function setState(next) {
  const merged = { ...state, ...next };
  const changed = Object.keys(merged).some((key) => merged[key] !== state[key]);
  state = merged;
  if (!changed) return;
  for (const fn of listeners) fn(state);
}

/**
 * Shared fetch wrapper. Exported because the tutor panel needs more than the
 * message on a failure - it reads `retryAfterMs` and `reason` off a 429 to run
 * its countdown. Existing callers only look at `.message` and are unaffected.
 */
export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', // send the session cookie, never to anyone else
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

/** Ask the server who we are. Safe to call when there is no server at all. */
export async function refreshAuth() {
  try {
    const { user, configured } = await api('/api/me');
    setState({ user, configured, ready: true, error: null });
  } catch {
    // Static hosting, or the server is down: carry on as a local-only app.
    setState({ user: null, configured: false, ready: true, error: null });
  }
  return state;
}

let gsiPromise = null;

function loadGsi() {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google sign-in did not load')));
    script.onerror = () => reject(new Error('Google sign-in could not be reached'));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

/**
 * Draw Google's official button into `container`.
 *
 * `collectLocalProgress` is called at the moment of sign-in, so whatever was
 * practised while signed out travels with the request and gets merged into the
 * account rather than being stranded on the device.
 */
export async function renderSignInButton(container, { collectLocalProgress = () => null } = {}) {
  container.innerHTML = '';
  try {
    // A fresh single-use nonce per attempt, issued by our server. It comes
    // back inside Google's signed token, which is how the server knows the
    // token was minted for this sign-in and not replayed from another.
    const { nonce, clientId, configured } = await api('/api/auth/nonce');
    if (!configured) {
      setState({ configured: false });
      return;
    }
    const google = await loadGsi();

    google.accounts.id.initialize({
      client_id: clientId,
      nonce,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async ({ credential }) => {
        try {
          setState({ error: null });
          const { user } = await api('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({ credential, nonce, localProgress: collectLocalProgress() }),
          });
          setState({ user });
        } catch (error) {
          setState({ error: error.message });
        }
      },
    });

    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
    });
  } catch (error) {
    setState({ error: error.message });
  }
}

export async function signOut() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // Even if the call fails, drop the local view of the session.
  }
  setState({ user: null });
}

/** Remove the account and everything stored against it. */
export async function deleteAccount() {
  await api('/api/account', { method: 'DELETE' });
  setState({ user: null });
}

// --- Progress over the wire -------------------------------------------------

export async function fetchRemoteProgress() {
  const { progress } = await api('/api/progress');
  return progress;
}

export async function pushRemoteProgress(progress) {
  await api('/api/progress', { method: 'PUT', body: JSON.stringify({ progress }) });
}
