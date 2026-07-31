// The shared question runner. Intro practice, skill drills and lesson activities
// all use it, so the answer/feedback/hint behaviour is identical everywhere.
//
// The failure state is designed here on purpose - it's where "ethereal" and
// "mastery-gated" would otherwise collide. Wrong answers cost nothing but the
// streak: a hint appears, then help. No lives, no penalties, no lockout.

import { playMidi, playSequence, ensureAudio } from './audio.js';
import { renderVisual, escapeHtml } from './ui.js';

const FEEDBACK_MS = { correct: 620, wrong: 1500 };

/**
 * How many times to redraw before accepting a repeat. Some pools are genuinely
 * small - the treble drill at Iron has five notes in it - so an unlucky run of
 * repeats is normal and looping until the draw differs would hang the app.
 */
const MAX_REDRAWS = 12;

/**
 * What makes two questions "the same" to a learner.
 *
 * The prompt alone is not enough: every question in the note drills reads
 * "Name the note.", and it is the notehead that differs. The ear drills go
 * further - "Name the chord quality you hear." with the answer "Major" covers
 * every major triad there is, and what actually distinguishes them is the
 * pitches. For a question asked in sound, the sound is the question.
 */
function signatureOf(question) {
  return JSON.stringify([
    question.prompt,
    question.answer,
    question.visual ?? null,
    question.play?.midis ?? null,
    question.playSequence ?? null,
  ]);
}

/**
 * Draw a question that isn't the one just asked. Generators pick at random and
 * have no memory, so back-to-back duplicates happen often enough to feel like
 * a bug - it reads as the app being stuck rather than as chance.
 */
function drawUnlike(generate, lastSignature) {
  let question = generate();
  for (let i = 0; i < MAX_REDRAWS && signatureOf(question) === lastSignature; i++) {
    question = generate();
  }
  return question;
}

/**
 * @param {HTMLElement} root      where to render
 * @param {object} opts
 *   generate()                   -> question
 *   onResult({correct, seconds, question})
 *   hint                         string shown after enough wrong answers
 *   wrongForHint / wrongForHelp  thresholds
 *   onHelp()                     called when the learner has struggled enough
 *   header()                     optional HTML rendered above the question
 */
export function createQuiz(root, opts) {
  const {
    generate, onResult, hint = '', wrongForHint = 2, wrongForHelp = 3,
    onHelp = null, header = () => '',
  } = opts;

  let question = null;
  let lastSignature = null;
  let askedAt = 0;
  let wrongRun = 0;
  let locked = false;
  let timer = null;
  let disposed = false;

  function playCurrent() {
    if (!question) return;
    ensureAudio();
    if (question.playSequence) playSequence(question.playSequence);
    else if (question.play) playMidi(question.play.midis, question.play);
  }

  function render() {
    if (disposed) return;
    const showHint = wrongRun >= wrongForHint && hint;
    const canPlay = Boolean(question.play || question.playSequence);

    root.innerHTML = `
      ${header()}
      <div class="question">
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        ${question.visual ? `<div class="visual">${renderVisual(question.visual)}</div>` : ''}
        ${canPlay ? `<button class="play" type="button" data-play>
            <span class="play-icon" aria-hidden="true">♪</span> Play
          </button>` : ''}
        <div class="choices">
          ${question.choices.map((choice) => `
            <button class="choice" type="button" data-choice="${escapeHtml(choice)}">
              ${escapeHtml(choice)}
            </button>`).join('')}
        </div>
        ${showHint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
      </div>`;

    root.querySelector('[data-play]')?.addEventListener('click', playCurrent);
    root.querySelectorAll('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => choose(button.dataset.choice, button));
    });
  }

  function choose(value, button) {
    if (locked) return;
    locked = true;

    const correct = value === question.answer;
    const seconds = (performance.now() - askedAt) / 1000;

    button.classList.add(correct ? 'correct' : 'wrong');
    if (!correct) {
      root.querySelectorAll('[data-choice]').forEach((el) => {
        if (el.dataset.choice === question.answer) el.classList.add('reveal');
      });
    }
    root.querySelectorAll('[data-choice]').forEach((el) => { el.disabled = true; });

    wrongRun = correct ? 0 : wrongRun + 1;
    const proceed = onResult({ correct, seconds, question });

    if (!correct && wrongRun >= wrongForHelp && onHelp) onHelp();

    // Returning false means the caller is taking over the screen (mastery, say).
    // Without this the runner would advance to a new question underneath them.
    if (proceed === false) return;

    timer = setTimeout(next, correct ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong);
  }

  function next() {
    if (disposed) return;
    question = drawUnlike(generate, lastSignature);
    lastSignature = signatureOf(question);
    askedAt = performance.now();
    locked = false;
    render();
    if (question.autoPlay) setTimeout(playCurrent, 220);
  }

  function dispose() {
    disposed = true;
    clearTimeout(timer);
  }

  next();
  return {
    dispose,
    replay: playCurrent,
    refresh: render,
    /**
     * What is on screen right now, for the tutor panel to read when the learner
     * asks it something. Pulled rather than pushed: read at the moment of the
     * question it can never be stale, and it costs nothing while the panel is
     * closed. Nothing else in the app uses this.
     */
    current: () => (disposed || !question ? null : {
      question,
      wrongRun,
      hint,
      hintShown: wrongRun >= wrongForHint && Boolean(hint),
    }),
  };
}
