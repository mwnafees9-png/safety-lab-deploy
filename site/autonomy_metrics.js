// ============================================================================
// autonomy_metrics.js — A2 + A3. The speedometer for the assistant.
//
// WHAT THIS IS FOR. The A-series target is 85–90% of drafted sections accepted
// without edit. Until 1 Aug that number could not be observed at all: the review
// panel recorded accept and dismiss, never edit, so "accepted without edit" and
// "accepted after correction" were the same event. A1 added the edit gate. This
// module is the readout over it.
//
// WHY THE ARITHMETIC MATTERS. Row acceptance is the PRODUCT of field accuracy.
// An FHA row is ~6 judgements, so 98% per field gives 88% at row level and 97%
// gives 83%. A one-point drop in field accuracy costs five points of acceptance.
// That is why this reports per FEATURE and not just an overall number — a single
// blended figure hides which surface is actually dragging.
//
// THE METRIC IS GAMEABLE AND IS DELIBERATELY PAIRED. Acceptance rate rises if
// the assistant simply drafts less: a two-line entry is accepted unchanged more
// often than a thorough one. Steering on acceptance alone optimises straight
// into an assistant that says almost nothing very reliably. So every acceptance
// figure here is reported next to COVERAGE — how many of the fields a lane
// offers actually came back populated. Neither number means anything alone.
//
// WHAT IS HONESTLY NOT MEASURED YET, and is labelled as such rather than
// estimated:
//   · abstention precision — needs the model to be able to say "insufficient
//     project data" per field. That is A10. Nothing abstains today, so there is
//     no denominator and this module refuses to invent one.
//   · turns-to-accept — approximated as drafts-offered per item accepted. It is
//     a proxy, not the real quantity, and is presented with that caveat.
//
// SCOPE. AiMemory is IndexedDB, per browser, per device. These are YOUR numbers
// on THIS machine, not a fleet view. Nothing here transmits anything anywhere —
// aggregating across accounts would be permitted under EULA §8 as anonymised
// statistics, but that is a separate decision and a separate build.
// ============================================================================
(function () {
    'use strict';

    // ---- pure core ---------------------------------------------------------
    // Split out so the whole thing is testable headlessly with no DOM and no
    // IndexedDB: compute(records) -> report. Everything below it is rendering.

    // Normalised similarity, used for "how much of the draft survived".
    // Levenshtein is O(n·m), so long prose is truncated to keep a big register
    // from freezing the settings panel. Truncation is disclosed in the output.
    var _SIM_CAP = 600;
    function _similarity(a, b) {
        a = String(a == null ? '' : a); b = String(b == null ? '' : b);
        var capped = (a.length > _SIM_CAP || b.length > _SIM_CAP);
        if (capped) { a = a.slice(0, _SIM_CAP); b = b.slice(0, _SIM_CAP); }
        if (!a.length && !b.length) return { sim: 1, capped: capped };
        if (!a.length || !b.length) return { sim: 0, capped: capped };
        var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur[0] = i;
            for (j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                    prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
            }
            for (j = 0; j <= b.length; j++) prev[j] = cur[j];
        }
        var dist = prev[b.length];
        return { sim: 1 - (dist / Math.max(a.length, b.length)), capped: capped };
    }

    function _blank() {
        return { drafted: 0, accepted: 0, edited: 0, dismissed: 0,
                 fieldsChanged: 0, simSum: 0, simN: 0,
                 covOffered: 0, covPopulated: 0, abstained: 0, legacy: 0 };
    }

    function compute(records) {
        var byFeature = {}, truncated = false;
        (records || []).forEach(function (r) {
            if (!r || r.kind !== 'delta') return;
            var f = r.feature || '(unattributed)';
            var b = byFeature[f] || (byFeature[f] = _blank());
            var act = r.action;

            if (act === 'draft')     { b.drafted += Math.max(1, Number(r.n) || 1); return; }
            if (act === 'dismiss' || act === 'reject') {
                if (r.offered == null) { b.legacy++; return; }
                b.dismissed++; return;
            }

            // A disposition can only speak to "accepted WITHOUT edit" if editing was
            // possible when it was recorded. Before the edit gate shipped (1 Aug 2026)
            // every disposition was necessarily an accept or a dismiss — so counting
            // them yields exactly 100%, the most flattering number available, for a
            // reason that has nothing to do with draft quality. Observed live: 334
            // clean, 0 corrected, headline 100.0%, every record from a demo.
            // The instrumented payload is the discriminator: only panels that carry
            // coverage counts could also have carried an edit.
            const instrumented = (r.offered != null);
            if (!instrumented) { b.legacy++; return; }

            if (act === 'accept' || act === 'edit') {
                if (act === 'accept') b.accepted++; else b.edited++;
                if (r.offered   != null) b.covOffered   += Number(r.offered)   || 0;
                if (r.populated != null) b.covPopulated += Number(r.populated) || 0;
                if (r.abstained != null) b.abstained    += Number(r.abstained) || 0;   // A10
            }
            if (act === 'edit') {
                var diff = (r.item && r.item.diff) || r.diff || [];
                diff.forEach(function (d) {
                    b.fieldsChanged++;
                    var s = _similarity(d.from, d.to);
                    if (s.capped) truncated = true;
                    b.simSum += s.sim; b.simN++;
                });
            }
        });

        var features = Object.keys(byFeature).sort().map(function (f) {
            var b = byFeature[f];
            var dispositioned = b.accepted + b.edited;          // drafts that landed
            var seen = dispositioned + b.dismissed;             // drafts judged at all
            return {
                feature: f,
                drafted: b.drafted, accepted: b.accepted, edited: b.edited, dismissed: b.dismissed,
                // THE headline: of the drafts good enough to keep, how many needed
                // no correction. Dismissed drafts are excluded on purpose — a
                // discarded draft is a different failure and has its own column.
                acceptClean:  dispositioned ? (b.accepted / dispositioned) : null,
                discardRate:  seen ? (b.dismissed / seen) : null,
                fieldsChangedPerEdit: b.edited ? (b.fieldsChanged / b.edited) : null,
                // How much of the model's wording survived the engineer's pen.
                survivingText: b.simN ? (b.simSum / b.simN) : null,
                // The anti-gaming pair. Acceptance without this is meaningless.
                coverage: b.covOffered ? (b.covPopulated / b.covOffered) : null,
                // A10 — of the fields we asked for, how many the model DECLINED rather
                // than guessed at. This is the rate, not the precision: whether each
                // abstention was CORRECT needs reference answers, which is A4. Reporting
                // a rate as though it were precision would be the same category of error
                // as the severity default it replaced.
                abstentionRate: b.covOffered ? (b.abstained / b.covOffered) : null,
                legacy: b.legacy,
                // Proxy only: drafts offered per draft kept.
                draftsPerKeep: dispositioned ? (b.drafted / dispositioned) : null
            };
        });

        var tot = features.reduce(function (a, f) {
            a.drafted += f.drafted; a.accepted += f.accepted; a.edited += f.edited; a.dismissed += f.dismissed; a.legacy += f.legacy;
            return a;
        }, { drafted: 0, accepted: 0, edited: 0, dismissed: 0, legacy: 0 });
        var totDisp = tot.accepted + tot.edited;

        return {
            features: features,
            overall: {
                drafted: tot.drafted, accepted: tot.accepted, edited: tot.edited, dismissed: tot.dismissed,
                acceptClean: totDisp ? (tot.accepted / totDisp) : null,
                legacy: tot.legacy,
                target: 0.875                                   // the 85–90% band, midpoint
            },
            // Stated, never estimated.
            notMeasured: [
                { metric: 'abstention precision', blockedBy: 'A4',
                  why: 'the RATE is now measured (see the Declined column) — but whether each abstention was RIGHT needs reference answers to compare against' },
                { metric: 'turns-to-accept', blockedBy: 'A2 follow-up',
                  why: 'drafts-per-keep is reported instead; it is a proxy, not the same quantity' }
            ],
            similarityTruncated: truncated,
            // sampleSize counts what the figures are actually BASED ON. Legacy records
            // are reported separately; they are not evidence for the headline.
            sampleSize: totDisp + tot.dismissed
        };
    }

    // ---- rendering ---------------------------------------------------------
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function _pct(v) { return v == null ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }
    function _n1(v)  { return v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1); }

    // Colour ONLY the headline, and only against the declared target. A number
    // with no target is just a number.
    function _tone(v) {
        if (v == null) return 'var(--color-text-tertiary)';
        if (v >= 0.85) return '#0E7A3C';
        if (v >= 0.70) return '#8A6D00';
        return '#B03030';
    }

    function html(rep) {
        // Excluded records are STATED, never silently dropped — a headline that
        // quietly ignored two thirds of the register would be its own kind of lie.
        const legacyNote = (rep && rep.overall && rep.overall.legacy)
            ? '<div style="font-size:11.5px;color:var(--color-text-secondary);margin:2px 0 8px;">'
              + '<b>' + rep.overall.legacy + ' earlier disposition' + (rep.overall.legacy === 1 ? '' : 's') + ' excluded.</b> '
              + 'They predate the edit gate (1 Aug 2026), when recording a correction was not possible — counting them would read as 100% for a reason unrelated to draft quality.</div>'
            : '';
        if (!rep || !rep.sampleSize) {
            return legacyNote + '<div style="font-size:12px;color:var(--color-text-tertiary);padding:8px 0;">' +
                'No dispositions recorded on this device yet. The figures appear once you accept, edit or dismiss an AI draft.</div>';
        }
        var o = rep.overall;
        var head =
            '<div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap;margin:2px 0 10px;">' +
              '<div><div style="font-size:26px;font-weight:800;line-height:1;color:' + _tone(o.acceptClean) + ';">' + _pct(o.acceptClean) + '</div>' +
                '<div style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--color-text-tertiary);margin-top:3px;">accepted without edit</div></div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">target <b>85–90%</b><br>' +
                o.accepted + ' clean · ' + o.edited + ' corrected · ' + o.dismissed + ' discarded' +
                (o.drafted ? (' · ' + o.drafted + ' drafted') : '') + '</div>' +
            '</div>';

        var rows = rep.features.map(function (f) {
            return '<tr>' +
                '<td style="font-size:11.5px;">' + _esc(f.feature) + '</td>' +
                '<td style="text-align:right;font-weight:700;color:' + _tone(f.acceptClean) + ';">' + _pct(f.acceptClean) + '</td>' +
                '<td style="text-align:right;">' + _pct(f.coverage) + '</td>' +
                '<td style="text-align:right;">' + _pct(f.survivingText) + '</td>' +
                '<td style="text-align:right;">' + _pct(f.abstentionRate) + '</td>' +
                '<td style="text-align:right;">' + _n1(f.fieldsChangedPerEdit) + '</td>' +
                '<td style="text-align:right;">' + _pct(f.discardRate) + '</td>' +
                '<td style="text-align:right;color:var(--color-text-tertiary);">' + (f.accepted + f.edited + f.dismissed) + '</td>' +
            '</tr>';
        }).join('');

        var pending = rep.notMeasured.map(function (m) {
            return '<li><b>' + _esc(m.metric) + '</b> — not measured (' + _esc(m.blockedBy) + '): ' + _esc(m.why) + '</li>';
        }).join('');

        return head + legacyNote +
            '<table class="data-table" style="width:100%;font-size:11.5px;"><thead><tr>' +
              '<th style="text-align:left;">Feature</th>' +
              '<th style="text-align:right;">Clean</th>' +
              '<th style="text-align:right;" title="Fields offered that came back populated — the guard against the assistant scoring well by drafting less">Coverage</th>' +
              '<th style="text-align:right;" title="How much of the model wording survived the engineer\'s edit">Survived</th>' +
              '<th style="text-align:right;" title="Fields the model declined to fill rather than guess at — the rate, not whether each was right">Declined</th>' +
              '<th style="text-align:right;">Fields/edit</th>' +
              '<th style="text-align:right;">Discarded</th>' +
              '<th style="text-align:right;">n</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
            '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:9px;">' +
              '<b>Clean and Coverage are read together.</b> Acceptance rises if the assistant drafts less, so a high clean rate beside a low coverage figure is a worse result than it looks, not a better one.' +
              ' <b>Declined is not a fault.</b> A field the model refused to guess at is one you fill in seconds; a field it guessed wrong at is one you have to notice first. Declined rising while Clean holds is the assistant getting more useful, not less.' +
            '</div>' +
            '<ul style="font-size:11px;color:var(--color-text-tertiary);margin:7px 0 0;padding-left:17px;">' + pending +
              (rep.similarityTruncated ? '<li>Some drafts exceeded the ' + _SIM_CAP + '-character comparison cap; “Survived” for those is computed on the leading section only.</li>' : '') +
            '</ul>';
    }

    async function render(hostId) {
        if (typeof document === 'undefined') return;
        var host = document.getElementById(hostId || 'autonomy-metrics');
        if (!host) return;
        var recs = [];
        try { if (window.AiMemory && window.AiMemory.all) recs = await window.AiMemory.all(); } catch (_) {}
        try { host.innerHTML = html(compute(recs)); } catch (e) { host.innerHTML = ''; }
    }

    async function report() {
        var recs = [];
        try { if (window.AiMemory && window.AiMemory.all) recs = await window.AiMemory.all(); } catch (_) {}
        return compute(recs);
    }

    var API = { compute: compute, html: html, render: render, report: report, _similarity: _similarity };
    try { if (typeof window !== 'undefined') { window.AutonomyMetrics = API; window.renderAutonomyMetrics = render; } } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
