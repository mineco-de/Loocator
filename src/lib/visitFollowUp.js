// Logik für die Nachfrage "Hast du diese Toilette aufgesucht?", ausgelagert damit sie ohne DOM
// getestet werden kann. Alle Zeitangaben in Millisekunden; `now` wird übergeben statt Date.now()
// aufzurufen, damit die Grenzen in Tests exakt prüfbar sind.
(function (global) {
    const MIN_AGE_MS = 15 * 60 * 1000;          // erst nach 15 min nachfragen (Nutzer ist evtl. noch unterwegs)
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // danach ist die Erinnerung zu alt
    const VOTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // so lange darf man nach "Ja, war dort" bewerten

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    // Beide Kategorien (Nutzbarkeit + Sauberkeit) sind schon bewertet: es gibt nichts mehr zu fragen.
    function isFullyVoted(voted, id) {
        const entry = isObject(voted) ? voted[id] : null;
        return Boolean(entry && entry.usable && entry.cleanliness);
    }

    // lastOpened: { id, ts, ... } der zuletzt geöffneten Toilette (oder null/kaputt)
    // visited:    { [id]: { confirmedAt } } bereits mit "Ja, war dort" bestätigte Toiletten
    // voted:      { [id]: { usable, cleanliness } } schon abgegebene Stimmen (loocator_voted)
    function shouldPromptFollowUp(lastOpened, visited, voted, now) {
        if (!isObject(lastOpened) || lastOpened.id === undefined || lastOpened.id === null) return false;
        if (typeof lastOpened.ts !== 'number') return false;

        const age = now - lastOpened.ts;
        if (age < MIN_AGE_MS || age > MAX_AGE_MS) return false;

        if (isObject(visited) && visited[lastOpened.id]) return false; // schon bestätigt
        if (isFullyVoted(voted, lastOpened.id)) return false;
        return true;
    }

    // Darf diese Toilette auch aus der Ferne bewertet werden (Nutzer hat "Ja, war dort" gesagt)?
    function canVoteRemotely(visited, id, now) {
        const entry = isObject(visited) ? visited[id] : null;
        if (!entry || typeof entry.confirmedAt !== 'number') return false;
        return now - entry.confirmedAt <= VOTE_WINDOW_MS;
    }

    const api = { shouldPromptFollowUp, canVoteRemotely, isFullyVoted, MIN_AGE_MS, MAX_AGE_MS, VOTE_WINDOW_MS };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.LoocatorLib = global.LoocatorLib || {};
        global.LoocatorLib.visitFollowUp = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
