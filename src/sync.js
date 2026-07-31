// Keeps the local working copy and the signed-in account in step.
//
// The shape of the deal: localStorage stays authoritative for the running app
// so nothing ever blocks on the network, and this module mirrors it to the
// server in the background. Signed out, none of it runs and the app behaves
// exactly as it did before accounts existed.

import { load, replaceAll, subscribe } from './storage.js';
import { authState, onAuthChange, fetchRemoteProgress, pushRemoteProgress } from './auth.js';
import { validateProgress, mergeProgress } from './progress-schema.js';

/** Long enough to coalesce a burst of answers, short enough to survive a tab close. */
const PUSH_DEBOUNCE_MS = 1500;

let status = 'off';   // off | synced | saving | error
let pushTimer = null;
let unsubscribeStore = null;
const watchers = new Set();

export function syncStatus() {
  return status;
}

export function onSyncChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  for (const fn of watchers) fn(status);
}

async function push() {
  if (!authState().user) return;
  setStatus('saving');
  try {
    await pushRemoteProgress(validateProgress(load()));
    setStatus('synced');
  } catch {
    // Offline or the server is unhappy. The local copy is untouched and still
    // correct, so this is a deferral rather than a failure - the next write
    // retries. Nothing the learner did is at risk.
    setStatus('error');
  }
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DEBOUNCE_MS);
}

/**
 * Reconcile on sign-in or reload: take the account's record, fold in whatever
 * this device has, install the result locally and send it back. Merging is
 * additive, so neither side can erase the other.
 */
async function reconcile() {
  try {
    const remote = await fetchRemoteProgress();
    const local = validateProgress(load());
    const merged = remote ? mergeProgress(validateProgress(remote), local) : local;
    replaceAll(merged);
    await pushRemoteProgress(merged);
    setStatus('synced');
    return merged;
  } catch {
    setStatus('error');
    return null;
  }
}

/**
 * Begin mirroring. `onReconciled` fires once the account's progress has been
 * folded in, so the caller can repaint with the real numbers.
 */
export function startSync(onReconciled = () => {}) {
  const apply = async (auth) => {
    clearTimeout(pushTimer);
    unsubscribeStore?.();
    unsubscribeStore = null;

    if (!auth.user) {
      setStatus('off');
      return;
    }
    const merged = await reconcile();
    unsubscribeStore = subscribe(schedulePush);
    if (merged) onReconciled(merged);
  };

  onAuthChange(apply);
  apply(authState());

  // A tab closing mid-debounce would otherwise drop the last few answers.
  window.addEventListener('pagehide', () => {
    if (!authState().user || pushTimer === null) return;
    clearTimeout(pushTimer);
    const body = JSON.stringify({ progress: validateProgress(load()) });
    // keepalive lets the request outlive the page; sendBeacon cannot set the
    // JSON content type this endpoint requires.
    fetch('/api/progress', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  });
}
