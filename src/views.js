// Screens: welcome, intro slides, dashboard, drill, lesson.

import { CONCEPTS, conceptById, conceptIndex, startIndexFor, CONCEPT_IDS } from './concepts.js';
import { DRILLS, drillById } from './drills.js';
import { LESSONS, lessonById } from './lessons.js';
import { load, update, conceptState, drillState, reset } from './storage.js';
import {
  STREAK_TARGET, recordConceptAnswer, recordDrillAnswer, completeReview,
  isMastered, dueConcepts,
} from './mastery.js';
import { RANKS, rankAt, nextRankHint, difficultyFor, medianTime } from './ranks.js';
import { createQuiz } from './quiz.js';
import { streakPips, escapeHtml } from './ui.js';
import { ensureAudio } from './audio.js';

const FOCUS_AREAS = [
  { id: 'reading', label: 'Reading notation' },
  { id: 'ear', label: 'Ear training' },
  { id: 'scales', label: 'Scales & keys' },
  { id: 'chords', label: 'Chords & harmony' },
];

const PROFICIENCIES = [
  { id: 'beginner', label: 'Complete beginner', detail: 'Start from note names. Nothing assumed.' },
  { id: 'some', label: 'Some experience', detail: 'I can read a little. Skip to intervals.' },
  { id: 'confident', label: 'Confident', detail: 'Take me straight to the drills.' },
];

let activeQuiz = null;

function teardown() {
  activeQuiz?.dispose();
  activeQuiz = null;
}

// --- Welcome (idea #1) ------------------------------------------------------

export function renderWelcome(root, go) {
  teardown();
  const state = load();
  let proficiency = state.proficiency ?? 'beginner';
  let focus = new Set(state.focus?.length ? state.focus : FOCUS_AREAS.map((f) => f.id));

  function paint() {
    root.innerHTML = `
      <section class="welcome">
        <header class="welcome-head">
          <p class="eyebrow">Theory 101</p>
          <h1>Learn the language<br>underneath the music.</h1>
          <p class="lede">One idea at a time, then practice until it's yours.
             No streaks to defend, no timers you didn't ask for.</p>
        </header>

        <div class="field">
          <h2>Where are you starting?</h2>
          <div class="cards">
            ${PROFICIENCIES.map((p) => `
              <button class="card${p.id === proficiency ? ' selected' : ''}"
                      type="button" data-prof="${p.id}">
                <span class="card-title">${p.label}</span>
                <span class="card-detail">${p.detail}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="field">
          <h2>What do you want to work on?</h2>
          <p class="sub">Changes what the dashboard shows first. Nothing gets hidden.</p>
          <div class="chips">
            ${FOCUS_AREAS.map((f) => `
              <button class="chip${focus.has(f.id) ? ' selected' : ''}"
                      type="button" data-focus="${f.id}">${f.label}</button>`).join('')}
          </div>
        </div>

        <button class="primary" type="button" data-begin>Begin</button>
      </section>`;

    root.querySelectorAll('[data-prof]').forEach((el) => {
      el.addEventListener('click', () => { proficiency = el.dataset.prof; paint(); });
    });
    root.querySelectorAll('[data-focus]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.focus;
        if (focus.has(id)) focus.delete(id); else focus.add(id);
        if (focus.size === 0) focus = new Set(FOCUS_AREAS.map((f) => f.id));
        paint();
      });
    });
    root.querySelector('[data-begin]').addEventListener('click', () => {
      ensureAudio(); // claim the user gesture so drills can play sound later
      update((s) => {
        s.onboarded = true;
        s.proficiency = proficiency;
        s.focus = [...focus];
        s.introIndex = startIndexFor(proficiency);
        s.introDone = proficiency === 'confident';
      });
      go(proficiency === 'confident' ? { view: 'dashboard' } : { view: 'intro' });
    });
  }
  paint();
}

// --- Intro slides (ideas #2, #4) --------------------------------------------

export function renderIntro(root, go, { conceptId = null, review = false } = {}) {
  teardown();
  const state = load();
  const index = conceptId ? conceptIndex(conceptId) : Math.min(state.introIndex, CONCEPTS.length - 1);
  const concept = CONCEPTS[index];
  let mode = review ? 'practice' : 'slide';
  let showSlide = false;

  function finish() {
    if (review) {
      completeReview(concept.id);
      go({ view: 'dashboard' });
      return;
    }
    const nextIndex = index + 1;
    if (nextIndex >= CONCEPTS.length) {
      update((s) => { s.introDone = true; s.introIndex = CONCEPTS.length - 1; });
      go({ view: 'dashboard', celebrate: true });
    } else {
      update((s) => { s.introIndex = nextIndex; });
      go({ view: 'intro' });
    }
  }

  function paintSlide() {
    root.innerHTML = `
      <section class="concept">
        <header class="concept-head">
          <button class="link" type="button" data-exit>← Dashboard</button>
          <p class="eyebrow">Concept ${index + 1} of ${CONCEPTS.length}</p>
          <h1>${concept.title}</h1>
        </header>
        <article class="slide">${concept.slide}</article>
        <button class="primary" type="button" data-practise>Practise this</button>
      </section>`;
    root.querySelector('[data-practise]').addEventListener('click', () => {
      ensureAudio();
      mode = 'practice';
      paintPractice();
    });
    root.querySelector('[data-exit]').addEventListener('click', () => go({ view: 'dashboard' }));
  }

  function paintPractice() {
    root.innerHTML = `
      <section class="concept">
        <header class="concept-head">
          <button class="link" type="button" data-exit>← Dashboard</button>
          <p class="eyebrow">${review ? 'Review' : `Concept ${index + 1} of ${CONCEPTS.length}`}</p>
          <h1>${concept.title}</h1>
        </header>
        <div class="slide-slot"></div>
        <div class="quiz-slot"></div>
        <button class="link centred" type="button" data-toggle-slide></button>
      </section>`;

    const slideSlot = root.querySelector('.slide-slot');
    const quizSlot = root.querySelector('.quiz-slot');
    const toggle = root.querySelector('[data-toggle-slide]');

    function paintSlideSlot() {
      slideSlot.innerHTML = showSlide ? `<article class="slide inline">${concept.slide}</article>` : '';
      toggle.textContent = showSlide ? 'Hide the explanation' : 'Show the explanation';
    }
    toggle.addEventListener('click', () => { showSlide = !showSlide; paintSlideSlot(); });
    root.querySelector('[data-exit]').addEventListener('click', () => go({ view: 'dashboard' }));
    paintSlideSlot();

    activeQuiz = createQuiz(quizSlot, {
      generate: () => concept.generate(),
      hint: concept.hint,
      onHelp: () => { showSlide = true; paintSlideSlot(); },
      header: () => {
        const streak = conceptState(concept.id).streak;
        return `<div class="progress-row">
                  ${streakPips(streak, STREAK_TARGET)}
                  <span class="progress-label">${streak} of ${STREAK_TARGET} in a row</span>
                </div>`;
      },
      onResult: ({ correct }) => {
        const result = recordConceptAnswer(concept.id, correct);
        if (result.streak >= STREAK_TARGET) {
          teardown();
          paintMastered();
        }
      },
    });
  }

  function paintMastered() {
    root.innerHTML = `
      <section class="concept mastered">
        <p class="eyebrow">${review ? 'Reviewed' : `Concept ${index + 1} of ${CONCEPTS.length}`}</p>
        <h1>${concept.title}</h1>
        <p class="lede">${STREAK_TARGET} in a row. That one's yours.</p>
        <button class="primary" type="button" data-next>
          ${review ? 'Back to dashboard'
            : index + 1 >= CONCEPTS.length ? 'Finish the introduction' : 'Next concept'}
        </button>
      </section>`;
    root.querySelector('[data-next]').addEventListener('click', finish);
  }

  if (mode === 'slide') paintSlide(); else paintPractice();
}

// --- Dashboard (ideas #3, #4, #5) -------------------------------------------

function rankBadge(rankIndex) {
  const rank = rankAt(rankIndex);
  return `<span class="rank rank-${rank.id}">${rank.label}</span>`;
}

export function renderDashboard(root, go, { celebrate = false } = {}) {
  teardown();
  const state = load();
  const due = dueConcepts(CONCEPT_IDS);
  const masteredCount = CONCEPT_IDS.filter(isMastered).length;

  const focus = new Set(state.focus?.length ? state.focus : FOCUS_AREAS.map((f) => f.id));
  const byFocus = (a, b) => (focus.has(b.focus) ? 1 : 0) - (focus.has(a.focus) ? 1 : 0);
  const drills = [...DRILLS].sort(byFocus);
  const lessons = [...LESSONS].sort(byFocus);

  root.innerHTML = `
    <section class="dashboard">
      <header class="dash-head">
        <p class="eyebrow">Theory 101</p>
        <h1>${celebrate ? 'Introduction complete.' : 'Where would you like to work?'}</h1>
        <p class="lede">${masteredCount} of ${CONCEPTS.length} concepts mastered.</p>
      </header>

      ${!state.introDone ? `
        <button class="banner" type="button" data-continue-intro>
          <span class="banner-title">Continue the introduction</span>
          <span class="banner-detail">Concept ${Math.min(state.introIndex + 1, CONCEPTS.length)} of ${CONCEPTS.length}
            — ${escapeHtml(CONCEPTS[Math.min(state.introIndex, CONCEPTS.length - 1)].title)}</span>
        </button>` : ''}

      ${due.length ? `
        <div class="section">
          <h2>Due for review</h2>
          <p class="sub">You mastered these a while ago. Knowledge fades — a quick pass keeps it.</p>
          <div class="tiles">
            ${due.map((id) => {
              const concept = conceptById(id);
              return `<button class="tile review" type="button" data-review="${id}">
                        <span class="tile-title">${escapeHtml(concept.title)}</span>
                        <span class="tile-blurb">Review — ${STREAK_TARGET} in a row</span>
                      </button>`;
            }).join('')}
          </div>
        </div>` : ''}

      <div class="section">
        <h2>Skill drills</h2>
        <p class="sub">Ranked on accuracy and speed. The questions get harder as you get faster.</p>
        <div class="tiles">
          ${drills.map((drill) => {
            const drillProgress = drillState(drill.id);
            const next = nextRankHint(drillProgress.best, drillProgress.times);
            const median = medianTime(drillProgress.times);
            return `<button class="tile" type="button" data-drill="${drill.id}">
                      <span class="tile-head">
                        <span class="tile-title">${escapeHtml(drill.title)}</span>
                        ${rankBadge(drillProgress.rank)}
                      </span>
                      <span class="tile-blurb">${escapeHtml(drill.blurb)}</span>
                      <span class="tile-foot">
                        ${next
                          ? `Next: ${next.label} — needs ${escapeHtml(next.needs.join(' and '))}`
                          : 'Diamond. Nothing left to prove here.'}
                        ${Number.isFinite(median) ? `<em>${median.toFixed(1)}s avg</em>` : ''}
                      </span>
                    </button>`;
          }).join('')}
        </div>
      </div>

      <div class="section">
        <h2>Lessons</h2>
        <p class="sub">Longer form, each ending in an activity.</p>
        <div class="tiles">
          ${lessons.map((lesson) => `
            <button class="tile" type="button" data-lesson="${lesson.id}">
              <span class="tile-title">${escapeHtml(lesson.title)}</span>
              <span class="tile-blurb">${escapeHtml(lesson.blurb)}</span>
            </button>`).join('')}
        </div>
      </div>

      <footer class="dash-foot">
        <button class="link" type="button" data-restart>Start over</button>
      </footer>
    </section>`;

  root.querySelector('[data-continue-intro]')?.addEventListener('click', () => go({ view: 'intro' }));
  root.querySelectorAll('[data-review]').forEach((el) => {
    el.addEventListener('click', () => go({ view: 'intro', conceptId: el.dataset.review, review: true }));
  });
  root.querySelectorAll('[data-drill]').forEach((el) => {
    el.addEventListener('click', () => { ensureAudio(); go({ view: 'drill', id: el.dataset.drill }); });
  });
  root.querySelectorAll('[data-lesson]').forEach((el) => {
    el.addEventListener('click', () => { ensureAudio(); go({ view: 'lesson', id: el.dataset.lesson }); });
  });
  root.querySelector('[data-restart]').addEventListener('click', () => {
    if (confirm('Clear all progress and start from the welcome screen?')) {
      reset();
      go({ view: 'welcome' });
    }
  });
}

// --- Drill ------------------------------------------------------------------

export function renderDrill(root, go, { id }) {
  teardown();
  const drill = drillById(id);
  if (!drill) return go({ view: 'dashboard' });

  root.innerHTML = `
    <section class="drill">
      <header class="concept-head">
        <button class="link" type="button" data-exit>← Dashboard</button>
        <p class="eyebrow">Skill drill</p>
        <h1>${escapeHtml(drill.title)}</h1>
      </header>
      <div class="quiz-slot"></div>
    </section>`;

  root.querySelector('[data-exit]').addEventListener('click', () => go({ view: 'dashboard' }));

  activeQuiz = createQuiz(root.querySelector('.quiz-slot'), {
    generate: () => drill.generate(difficultyFor(drillState(drill.id).rank)),
    hint: '',
    // The header repaints with the next question, so don't refresh here - that
    // would wipe the correct/wrong feedback the learner is still looking at.
    onResult: ({ correct, seconds }) => recordDrillAnswer(drill.id, correct, seconds),
    header: () => {
      const progress = drillState(drill.id);
      const rank = rankAt(progress.rank);
      const next = nextRankHint(progress.best, progress.times);
      const target = RANKS[Math.min(progress.rank + 1, RANKS.length - 1)].streak || 5;
      return `<div class="drill-status">
                <div class="progress-row">
                  ${rankBadge(progress.rank)}
                  <span class="progress-label">${progress.streak} in a row · best ${progress.best}</span>
                </div>
                <p class="next-rank">${next
                  ? `${next.label} needs ${escapeHtml(next.needs.join(' and '))}`
                  : `${rank.label} — the top tier`}</p>
                ${streakPips(Math.min(progress.streak, target), target)}
              </div>`;
    },
  });
}

// --- Lesson -----------------------------------------------------------------

export function renderLesson(root, go, { id }) {
  teardown();
  const lesson = lessonById(id);
  if (!lesson) return go({ view: 'dashboard' });
  let mode = 'read';

  function paintReading() {
    root.innerHTML = `
      <section class="lesson">
        <header class="concept-head">
          <button class="link" type="button" data-exit>← Dashboard</button>
          <p class="eyebrow">Lesson</p>
          <h1>${escapeHtml(lesson.title)}</h1>
        </header>
        ${lesson.sections.map((section) => `
          <article class="slide">
            <h2>${escapeHtml(section.heading)}</h2>
            ${section.body}
          </article>`).join('')}
        <button class="primary" type="button" data-activity>${escapeHtml(lesson.activity.title)}</button>
      </section>`;
    root.querySelector('[data-exit]').addEventListener('click', () => go({ view: 'dashboard' }));
    root.querySelector('[data-activity]').addEventListener('click', () => {
      ensureAudio();
      mode = 'activity';
      paintActivity();
    });
  }

  function paintActivity() {
    let correct = 0;
    let asked = 0;
    root.innerHTML = `
      <section class="lesson">
        <header class="concept-head">
          <button class="link" type="button" data-exit>← Dashboard</button>
          <p class="eyebrow">${escapeHtml(lesson.title)}</p>
          <h1>${escapeHtml(lesson.activity.title)}</h1>
        </header>
        <div class="quiz-slot"></div>
        <button class="link centred" type="button" data-read>Back to the lesson</button>
      </section>`;
    root.querySelector('[data-exit]').addEventListener('click', () => go({ view: 'dashboard' }));
    root.querySelector('[data-read]').addEventListener('click', () => { mode = 'read'; teardown(); paintReading(); });

    activeQuiz = createQuiz(root.querySelector('.quiz-slot'), {
      generate: () => lesson.activity.generate(),
      hint: '',
      header: () => `<div class="progress-row">
                       <span class="progress-label">${correct} of ${asked} correct</span>
                     </div>`,
      onResult: ({ correct: wasCorrect }) => {
        asked += 1;
        if (wasCorrect) correct += 1;
      },
    });
  }

  if (mode === 'read') paintReading();
}
