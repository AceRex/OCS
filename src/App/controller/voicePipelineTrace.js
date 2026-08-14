/**
 * Always-on voice→display pipeline trace (one line per decision).
 * Stages match the debug checklist: ASR → GATE → RESOLVE → CONF → SETTLE → IPC → RENDER.
 */

const STAGE_KEYS = ['asr', 'gate', 'resolve', 'conf', 'settle', 'ipc', 'render'];

/**
 * @param {object} opts
 * @param {string|number} opts.utt
 * @param {string} [opts.heard]
 * @param {Record<string, string>} opts.stages - values like ok|fail|skip|pending + optional detail
 * @returns {string} single-line trace for console + debug bar
 */
export function formatPipelineTrace({ utt, heard, stages }) {
    const parts = STAGE_KEYS.map((k) => {
        const v = stages && stages[k] != null ? String(stages[k]) : '-';
        return `${k}=${v}`;
    });
    const heardBit = heard ? ` heard="${String(heard).slice(0, 80)}"` : '';
    return `PIPE utt=${utt ?? '?'}${heardBit} ${parts.join(' ')}`;
}

/**
 * Push a pipeline trace to console and optional UI sink.
 * @param {object} opts
 * @param {(line: string) => void} [opts.onLine]
 */
export function emitPipelineTrace(opts) {
    const line = formatPipelineTrace(opts);
    console.log('[Voice]', line);
    if (typeof opts.onLine === 'function') opts.onLine(line);
    return line;
}

/**
 * Pure gate+resolve+confidence evaluation for regression tests (no React / IPC).
 * @returns {{ stages, match, dropReason }}
 */
export async function evaluateScripturePath({
    text,
    books,
    bibleApi = null,
    context = null,
    confidence = null,
    pass = 'A',
    triggerArmed = false,
    sensitivity = 'strict',
    confTierA = 0.48,
    confTierB = 0.65,
    matchReferenceShape,
    smartBibleMatch,
    isShortContextJump,
}) {
    const stages = {
        asr: text && String(text).trim() ? `ok` : 'fail:empty',
        gate: 'pending',
        resolve: 'pending',
        conf: 'pending',
        settle: 'skip',
        ipc: 'skip',
        render: 'skip',
    };

    if (!text || !String(text).trim()) {
        stages.asr = 'fail:empty';
        return { stages, match: null, dropReason: 'asr_empty' };
    }

    const shape = matchReferenceShape(text);
    const ambientShaped = !!shape.complete;
    const shortJump = !!shape.shortContext || (isShortContextJump && isShortContextJump(text));
    const fromPassB = pass === 'B';

    const allowScripture =
        fromPassB ||
        triggerArmed ||
        ambientShaped ||
        (shortJump && (triggerArmed || fromPassB || context)) ||
        sensitivity === 'loose';

    if (!allowScripture) {
        stages.gate = 'fail:no_shape_or_trigger';
        return { stages, match: null, dropReason: 'gate' };
    }
    stages.gate = ambientShaped
        ? `ok:shape:${shape.kind}`
        : shortJump
            ? 'ok:short_context'
            : fromPassB || triggerArmed
                ? 'ok:armed'
                : 'ok:loose';

    if (confidence != null && Number.isFinite(confidence)) {
        if (ambientShaped && confidence < confTierA) {
            stages.conf = `fail:${confidence.toFixed(2)}<${confTierA}`;
            return { stages, match: null, dropReason: 'confidence_a' };
        }
        if (!ambientShaped && confidence < confTierB && !fromPassB) {
            stages.conf = `fail:${confidence.toFixed(2)}<${confTierB}`;
            return { stages, match: null, dropReason: 'confidence_b' };
        }
        stages.conf = `ok:${Number(confidence).toFixed(2)}`;
    } else {
        stages.conf = 'ok:null';
    }

    const allowPass3 = fromPassB || triggerArmed;
    const allowPass2 = fromPassB || triggerArmed || sensitivity === 'loose' || ambientShaped;
    const allowBookOnly = fromPassB || triggerArmed || ambientShaped || /\bbook\s+of\b/i.test(text);

    const match = await smartBibleMatch(text, books, bibleApi, context, {
        allowPass2,
        allowPass3,
        requireShape: !fromPassB && !triggerArmed,
        allowBookOnly,
    });

    if (!match) {
        stages.resolve = 'fail:null';
        return { stages, match: null, dropReason: 'resolve' };
    }

    const bookName = books[match.bookIndex]?.name || '?';
    stages.resolve = `ok:${bookName}_${match.chapter}:${match.startVerse}`;
    return { stages, match, dropReason: null };
}
