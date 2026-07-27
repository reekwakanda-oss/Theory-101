// Router. No framework, no build step - open index.html and it runs.

import { load } from './storage.js';
import {
  renderWelcome, renderIntro, renderDashboard, renderDrill, renderLesson,
} from './views.js';

const root = document.getElementById('app');

function go(route) {
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

const state = load();
if (!state.onboarded) go({ view: 'welcome' });
else if (!state.introDone) go({ view: 'intro' });
else go({ view: 'dashboard' });
