// The tutor panel.
//
// ON-DEMAND ONLY. This must never open itself because the learner is getting
// answers wrong. The app already has a designed failure state - a hint at two
// wrong, the slide reopening at three - and a panel that jumps in first would
// replace deliberate teaching with a chatbot. It announces itself once so
// people know it is here, and after that it waits to be asked.
//
// The session cookie is HttpOnly, so nothing here can read it; the server
// decides on every request who is asking and whether they may.

// Note this deliberately does NOT render its own Google button, and points at
// the account strip instead. Two reasons, both real: google.accounts.id
// .initialize() is global, so a second button clobbers the first one's nonce;
// and renderSignInButton reports failures through setState, which fires
// onAuthChange, which repaints this panel - an infinite render loop.
import { api, authState, onAuthChange } from './auth.js';
import { describeScreen, describeScreenLabel } from './assistant-context.js';
import { escapeHtml } from './ui.js';

/** Per-device UI state. Deliberately NOT the progress record - see below. */
const SEEN_KEY = 'theory101.tutor.v1';

const MAX_MESSAGE = 500;
/** Kept in step with the server, which re-applies it. */
const HISTORY_TURNS = 3;

let config = { configured: false, signedIn: false, cooldownMs: 10000, remaining: null };
let thread = [];          // { role: 'user' | 'assistant' | 'error', content }
let open = false;
let busy = false;
let cooldownUntil = 0;
let tick = null;
let root = null;
let announced = false;
let showBubble = false;

// --- Small helpers ----------------------------------------------------------

function alreadyAnnounced() {
  // localStorage under its own key, NOT the progress record: validateProgress
  // rebuilds that record from a whitelist and drops unknown keys, so a flag
  // stored there would be deleted on the next sync and the bubble would come
  // back. It is also a per-device preference, not part of the course record.
  try {
    return localStorage.getItem(SEEN_KEY) === 'seen';
  } catch {
    return false;
  }
}

function markAnnounced() {
  try {
    localStorage.setItem(SEEN_KEY, 'seen');
  } catch {
    /* private browsing - the bubble simply shows again next time */
  }
}

const cooldownLeft = () => Math.max(0, cooldownUntil - Date.now());

// --- Rendering --------------------------------------------------------------

function sendLabel() {
  if (busy) return 'Thinking…';
  const left = cooldownLeft();
  return left > 0 ? `Wait ${Math.ceil(left / 1000)}s` : 'Ask';
}

function paint() {
  if (!root) return;
  const { user, configured: signInConfigured } = authState();
  const left = cooldownLeft();

  root.innerHTML = `
    ${open ? '' : `
      <button class="tutor-toggle" type="button" data-toggle
              aria-expanded="false" aria-controls="tutor-panel">Ask the tutor</button>`}
    <section class="tutor${open ? ' open' : ''}" id="tutor-panel"
             aria-label="Tutor" ${open ? '' : 'inert'}>
      <header class="tutor-head">
        <h2>Tutor</h2>
        <!-- The close control lives here, not on the floating toggle: the panel
             covers that corner once it is open. -->
        <button class="tutor-close" type="button" data-toggle
                aria-label="Close the tutor">&times;</button>
        <p class="tutor-where">Looking at ${escapeHtml(describeScreenLabel())}</p>
      </header>
      <div class="tutor-thread" data-thread role="log" aria-live="polite"></div>
      ${user ? `
        <form class="tutor-form" data-form>
          <label class="visually-hidden" for="tutor-input">Ask a question</label>
          <textarea id="tutor-input" data-input rows="2" maxlength="${MAX_MESSAGE}"
                    placeholder="Ask about what's on screen…"></textarea>
          <div class="tutor-actions">
            <span class="tutor-budget">${config.remaining === null ? ''
              : `${config.remaining} left today`}</span>
            <button class="tutor-send" type="submit" data-send
                    ${busy || left > 0 ? 'disabled' : ''}>${sendLabel()}</button>
          </div>
        </form>`
      : `<div class="tutor-signin">
           <p>Sign in to ask the tutor. Everything else works without an account.</p>
           <!-- Only point at the button when there actually is one. The account
                strip hides itself when GOOGLE_CLIENT_ID is unset, and directing
                someone to a control that is not on screen is worse than saying
                nothing. -->
           <p class="tutor-signin-where">${signInConfigured
             ? 'The sign-in button is on the welcome screen and at the bottom of the dashboard.'
             : 'Sign-in is not set up on this server, so the tutor cannot be used here.'}</p>
         </div>`}
      <p class="visually-hidden" aria-live="polite" data-ready></p>
    </section>
    ${showBubble ? `
      <div class="tutor-bubble" role="status">
        <p>I can help while you practise. I'll nudge you toward the method,
           not the answer.</p>
        <button type="button" data-ok>Okay</button>
      </div>` : ''}`;

  paintThread();

  root.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => toggle());
  });
  root.querySelector('[data-ok]')?.addEventListener('click', dismissBubble);
  root.querySelector('[data-form]')?.addEventListener('submit', submit);
  root.querySelector('[data-input]')?.addEventListener('keydown', (event) => {
    // Enter sends, Shift+Enter breaks the line - the convention everywhere else.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  });
}

/**
 * Model output is inserted as TEXT, never HTML. This is the actual control on
 * anything the model says, whatever a learner talked it into saying.
 */
function paintThread() {
  const box = root?.querySelector('[data-thread]');
  if (!box) return;
  box.innerHTML = '';

  if (!thread.length) {
    const empty = document.createElement('p');
    empty.className = 'tutor-empty';
    empty.textContent = "I can see the question you're on. I'll point you at the method, "
      + 'but I won\'t give you the answer.';
    box.appendChild(empty);
  }

  for (const turn of thread) {
    const line = document.createElement('p');
    line.className = `tutor-turn tutor-${turn.role}`;
    line.textContent = turn.content;
    box.appendChild(line);
  }
  if (busy) {
    const wait = document.createElement('p');
    wait.className = 'tutor-turn tutor-waiting';
    wait.textContent = 'Thinking…';
    box.appendChild(wait);
  }
  box.scrollTop = box.scrollHeight;
}

/** Only the label and the button change while cooling; don't repaint the thread. */
function paintCooldown() {
  const button = root?.querySelector('[data-send]');
  if (!button) return;
  const left = cooldownLeft();
  button.textContent = sendLabel();
  button.disabled = busy || left > 0;
  if (left <= 0 && tick) {
    clearInterval(tick);
    tick = null;
    // Announced once, not every second - a per-second live region is punishing.
    const ready = root.querySelector('[data-ready]');
    if (ready) ready.textContent = 'Ready to ask again';
  }
}

function startCooldown(ms) {
  cooldownUntil = Date.now() + ms;
  clearInterval(tick);
  tick = setInterval(paintCooldown, 250);
  paintCooldown();
}

// --- Behaviour --------------------------------------------------------------

function toggle(next = !open) {
  open = next;
  paint();
  if (open) root.querySelector('[data-input]')?.focus();
  else root.querySelector('[data-toggle]')?.focus();
}

async function submit(event) {
  event?.preventDefault();
  const input = root.querySelector('[data-input]');
  const message = input?.value.trim();
  if (!message || busy || cooldownLeft() > 0) return;

  thread.push({ role: 'user', content: message });
  busy = true;
  paint();

  try {
    const body = await api('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({
        message,
        context: describeScreen(),
        history: thread.filter((t) => t.role !== 'error').slice(-HISTORY_TURNS * 2 - 1, -1),
      }),
    });
    thread.push({ role: 'assistant', content: body.reply });
    if (typeof body.remaining === 'number') config.remaining = body.remaining;
    busy = false;
    paint();
    startCooldown(body.cooldownMs ?? config.cooldownMs);
  } catch (error) {
    busy = false;
    // Keep what they typed - losing it to a network blip is its own insult.
    thread.push({ role: 'error', content: errorText(error) });
    paint();
    const wait = error.body?.retryAfterMs;
    if (typeof wait === 'number' && wait > 0) startCooldown(wait);
    if (error.status === 401) refreshConfig();
    const box = root.querySelector('[data-input]');
    if (box) box.value = message;
  }
}

function errorText(error) {
  if (error.status === 401) return 'Your session ended. Sign in again to keep asking.';
  if (error.body?.reason === 'daily') {
    const resetAt = error.body.resetAt ? new Date(error.body.resetAt) : null;
    return `${error.message}${resetAt ? ` Back at ${resetAt.toLocaleTimeString()}.` : ''}`;
  }
  return `${error.message} Nothing you've done is affected.`;
}

function dismissBubble() {
  if (!showBubble) return;
  showBubble = false;
  document.removeEventListener('click', outsideClick);
  paint();
}

function outsideClick(event) {
  if (!event.target.closest?.('.tutor-bubble')) dismissBubble();
}

/**
 * A one-time hello, so people know the tutor is here. It is rendered as part of
 * paint() rather than appended, because paint() rebuilds the whole subtree - an
 * appended node would vanish on the next repaint.
 *
 * This is the ONLY thing that appears without being asked for, and it says what
 * the tutor will and will not do. It never comes back.
 */
function announce() {
  if (announced || alreadyAnnounced() || !config.configured) return;
  announced = true;
  showBubble = true;
  markAnnounced(); // on render, not on dismissal, so it cannot loop
  paint();

  setTimeout(dismissBubble, 12000);
  // Deferred, or the click that opened this very frame would close it at once.
  setTimeout(() => document.addEventListener('click', outsideClick), 0);
}

async function refreshConfig() {
  try {
    const body = await api('/api/assistant');
    config = { ...config, ...body };
    if (typeof body.retryAfterMs === 'number' && body.retryAfterMs > 0) {
      startCooldown(body.retryAfterMs);
    }
  } catch {
    // No server, or a static host. The tutor simply does not exist here.
    config = { ...config, configured: false };
  }
  return config;
}

// --- Mounting ---------------------------------------------------------------

export async function mountTutor() {
  root = document.getElementById('tutor-root');
  if (!root) return;

  await refreshConfig();
  // A button that permanently reads "unavailable" is noise. If the tutor is not
  // set up, the app simply does not mention it - the same way sign-in degrades.
  if (!config.configured) return;

  paint();

  let wasSignedIn = Boolean(authState().user);
  onAuthChange(() => {
    const signedIn = Boolean(authState().user);
    // Only re-ask the server when signing in or out actually happened. Any
    // other auth-state change (an error message, say) just needs a repaint.
    if (signedIn === wasSignedIn) {
      paint();
      return;
    }
    wasSignedIn = signedIn;
    refreshConfig().then(() => {
      paint();
      if (signedIn) announce();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) toggle(false);
  });

  if (authState().user) announce();
}

/** Called by the router so the header can say what the tutor is looking at. */
export function tutorRouteChanged() {
  if (root && config.configured) paint();
}
