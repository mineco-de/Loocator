const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    shouldPromptFollowUp,
    canVoteRemotely,
    isFullyVoted,
    MIN_AGE_MS,
    MAX_AGE_MS,
    VOTE_WINDOW_MS
} = require('../src/lib/visitFollowUp');

const NOW = 1_800_000_000_000;
const opened = (ageMs, id = 42) => ({ id, ts: NOW - ageMs });

test('Nachfrage erst ab 15 Minuten', () => {
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS - 1), {}, {}, NOW), false);
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), {}, {}, NOW), true);
});

test('Nachfrage nur bis 7 Tage nach dem Öffnen', () => {
    assert.equal(shouldPromptFollowUp(opened(MAX_AGE_MS), {}, {}, NOW), true);
    assert.equal(shouldPromptFollowUp(opened(MAX_AGE_MS + 1), {}, {}, NOW), false);
});

test('keine Nachfrage, wenn nichts (oder Unbrauchbares) gemerkt wurde', () => {
    assert.equal(shouldPromptFollowUp(null, {}, {}, NOW), false);
    assert.equal(shouldPromptFollowUp(undefined, {}, {}, NOW), false);
    assert.equal(shouldPromptFollowUp('kaputt', {}, {}, NOW), false);
    assert.equal(shouldPromptFollowUp({ ts: NOW - MIN_AGE_MS }, {}, {}, NOW), false);
    assert.equal(shouldPromptFollowUp({ id: 1, ts: 'gestern' }, {}, {}, NOW), false);
});

test('keine Nachfrage, wenn "Ja, war dort" schon beantwortet wurde', () => {
    const visited = { 42: { confirmedAt: NOW - 1000 } };
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), visited, {}, NOW), false);
});

test('keine Nachfrage, wenn beide Kategorien schon bewertet sind', () => {
    const both = { 42: { usable: true, cleanliness: true } };
    const onlyOne = { 42: { usable: true } };
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), {}, both, NOW), false);
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), {}, onlyOne, NOW), true);
});

test('kaputter Storage (null/Array/String) wird wie leer behandelt', () => {
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), null, null, NOW), true);
    assert.equal(shouldPromptFollowUp(opened(MIN_AGE_MS), [], 'x', NOW), true);
});

test('Fern-Bewertung: 14 Tage nach der Bestätigung erlaubt, danach nicht mehr', () => {
    const visited = { 42: { confirmedAt: NOW - VOTE_WINDOW_MS } };
    assert.equal(canVoteRemotely(visited, 42, NOW), true);
    assert.equal(canVoteRemotely(visited, 42, NOW + 1), false);
});

test('Fern-Bewertung gilt nur für die bestätigte Toilette', () => {
    const visited = { 42: { confirmedAt: NOW } };
    assert.equal(canVoteRemotely(visited, 43, NOW), false);
    assert.equal(canVoteRemotely(null, 42, NOW), false);
    assert.equal(canVoteRemotely({ 42: {} }, 42, NOW), false);
});

test('IDs aus JSON-Schlüsseln (String) und Overpass-IDs (Zahl) passen zusammen', () => {
    const visited = JSON.parse('{"42":{"confirmedAt":' + NOW + '}}');
    assert.equal(canVoteRemotely(visited, 42, NOW), true);
    assert.equal(isFullyVoted(JSON.parse('{"42":{"usable":true,"cleanliness":true}}'), 42), true);
});
