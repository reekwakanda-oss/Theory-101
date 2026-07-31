// Router. No framework, no build step - open index.html and it runs.

// First, and for a reason: theme.js paints the chosen material onto <html> as
// it evaluates, and an import is evaluated before this module's body runs. Any
// later and the page would show the default stone before switching.
import './theme.js';
import { mountThemePanel } from './theme-panel.js';
import { load } from './storage.js';
import {
  renderWelcome, renderIntro, renderDashboard, renderDrill, renderLesson,
} from './views.js';
import { refreshAuth, onAuthChange } from './auth.js';
import { startSync } from './sync.js';
import { setRoute } from './assistant-context.js';
import { mountTutor, tutorRouteChanged } from './assistant.js';

const root = document.getElementById('app');

let current = null;

function go(route) {
  current = route;
  // `current` stays private here, so the route is pushed to the tutor rather
  // than pulled - that keeps assistant-context.js from importing this module
  // and closing a cycle.
  setRoute(route);
  tutorRouteChanged();
  window.scrollTo(0, 0);
  switch (route.view) {
    case 'intro': return renderIntro(root, go, route);
    case 'dashboard': return renderDashboard(root, go, route);
    case 'drill': return renderDrill(root, go, route);
    case 'lesson': return renderLesson(root, go, route);
    case 'welcome':
    default: return renderWelcome(root, go);
  }
}

function startingRoute() {
  const state = load();
  if (!state.onboarded) return { view: 'welcome' };
  if (!state.introDone) return { view: 'intro' };
  return { view: 'dashboard' };
}

/** Repaint in place, so a screen showing progress picks up new numbers. */
function repaint() {
  const route = current ?? startingRoute();
  // A quiz in flight owns its screen; interrupting it would discard the
  // question the learner is mid-way through answering.
  if (route.view === 'drill' || route.view === 'intro' || route.view === 'lesson') return;
  go(route);
}

go(startingRoute());

// Auth and sync are strictly additive: the app above has already rendered and
// works whether or not any of this resolves.
mountTutor();
mountThemePanel();

refreshAuth().then(() => {
  repaint();
  startSync((merged) => {
    // The account's progress has just landed. On a new device the app booted
    // from empty localStorage and put us on the welcome screen; if this
    // learner has already been through it, send them where they left off
    // rather than making them onboard a second time. Only when they have not
    // navigated yet - never yank someone out of a screen they chose.
    if (current?.view === 'welcome' && merged.onboarded) go(startingRoute());
    else repaint();
  });
});
onAuthChange(() => repaint());
