// What the learner is looking at, as data.
//
// This is the answer to "can the assistant see my screen". It does not need to:
// the app already knows precisely what is displayed, so it sends that instead of
// a picture. Cheaper, exact, and nothing leaves the page that the app did not
// already have.
//
// The output is deliberately STRUCTURED, not prose. The server turns it into
// the words the model reads, so the browser cannot dictate the prompt. Ids are
// re-checked against the server's own copy of the content before use.
//
// It does not import main.js - that would close a cycle - so the router pushes
// the route in via setRoute().

import { CONCEPTS, conceptById, conceptIndex, CONCEPT_IDS } from './concepts.js';
import { DRILLS } from './drills.js';
import { quizSnapshot } from './views.js';
import { load, drillState, conceptState } from './storage.js';
import { STREAK_TARGET, isMastered, dueConcepts } from './mastery.js';
import { difficultyFor, medianTime } from './ranks.js';

let route = { view: 'welcome' };

export function setRoute(next) {
  route = next ?? { view: 'welcome' };
}

export function currentRoute() {
  return route;
}

/** Compact enough to name in a prompt without shipping the whole SVG. */
function describeVisual(visual) {
  if (!visual) return null;
  if (visual.type === 'staff') return `a ${visual.clef} staff with one notehead`;
  if (visual.type === 'keyboard') return 'a keyboard with one key lit';
  return null;
}

function describeQuestion(snapshot) {
  if (!snapshot?.question) return null;
  const q = snapshot.question;
  return {
    prompt: q.prompt,
    choices: Array.isArray(q.choices) ? q.choices.slice(0, 6) : [],
    answer: q.answer,
    visual: describeVisual(q.visual),
  };
}

export function describeScreen() {
  const snapshot = quizSnapshot();
  const state = load();
  const context = { screen: route.view ?? 'welcome' };

  if (snapshot) {
    context.question = describeQuestion(snapshot);
    context.wrongRun = snapshot.wrongRun;
    context.hintShown = snapshot.hintShown;
  }

  if (context.screen === 'intro') {
    // Mirrors the concept choice in renderIntro: an explicit conceptId when
    // reviewing, otherwise wherever the learner has got to.
    const id = route.conceptId
      ?? CONCEPTS[Math.min(state.introIndex, CONCEPTS.length - 1)].id;
    context.conceptId = id;
    context.reviewing = Boolean(route.review);
    context.streak = conceptState(id).streak;
    context.target = STREAK_TARGET;
  }

  if (context.screen === 'drill') {
    const progress = drillState(route.id);
    context.drillId = route.id;
    context.rank = progress.rank;
    context.difficulty = difficultyFor(progress.rank);
    context.streak = progress.streak;
    context.best = progress.best;
    const median = medianTime(progress.times);
    if (Number.isFinite(median)) context.medianSeconds = Math.round(median * 10) / 10;
  }

  if (context.screen === 'lesson') {
    context.lessonId = route.id;
    // No snapshot means they are reading rather than answering.
  }

  if (context.screen === 'dashboard') {
    context.masteredCount = CONCEPT_IDS.filter(isMastered).length;
    context.totalConcepts = CONCEPTS.length;
    context.due = dueConcepts(CONCEPT_IDS).slice(0, 6);
    context.ranks = DRILLS.map((d) => `${d.title}:${drillState(d.id).rank}`);
  }

  if (context.screen === 'welcome') {
    context.proficiency = state.proficiency ?? null;
  }

  if (Array.isArray(state.focus) && state.focus.length) context.focus = state.focus;
  return context;
}

/** A short label for the panel header, so the learner sees what it can see. */
export function describeScreenLabel() {
  const context = describeScreen();
  if (context.screen === 'drill') {
    return DRILLS.find((d) => d.id === context.drillId)?.title ?? 'a drill';
  }
  if (context.screen === 'intro') {
    const concept = conceptById(context.conceptId);
    return concept ? `${concept.title} (concept ${conceptIndex(context.conceptId) + 1})` : 'the introduction';
  }
  if (context.screen === 'lesson') return 'a lesson';
  if (context.screen === 'dashboard') return 'the dashboard';
  return 'the welcome screen';
}
