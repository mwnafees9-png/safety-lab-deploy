#!/usr/bin/env python3
"""28 Oct 2026: ANEM one click away on every page (Waqas: "I want anem live chat to be able to be accessed right
next to the feedback button in a pill form").

A "✦ ANEM" pill sits immediately left of the Feedback pill at the bottom right, in ANEM's own blue-to-purple, and
opens the same live chat as the sidebar and the top ANEM button (slOpenAnem). The two pills share one row, so they
never overlap whatever the Feedback label's width; narrow screens show both as icon circles, and print and the
full-screen fault tree hide both, as they always hid Feedback. The sidebar entry and the top button stay.

Run from the repo root: python3 tools/patch_anem_pill_20261028.py   (refuses on any missing anchor)
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

h = rd(S('index.html'))
if 'anem-fab' in h: sys.exit('already applied')
h = sub1(h, """    <button id="feedback-fab" class="feedback-fab" onclick="openBetaFeedback()"
            aria-label="Send beta feedback"
            title="Send beta feedback — opens an email pre-filled with your build ID">
        <span class="feedback-fab-icon" aria-hidden="true">✉</span>
        <span class="feedback-fab-label">Feedback</span>
    </button>""", """    <!-- 28 Oct 2026: ANEM's live chat in a pill right next to Feedback (Waqas). One row, so they never overlap. -->
    <div id="sl-fab-row" class="sl-fab-row">
    <button id="anem-fab" class="anem-fab" type="button" onclick="slOpenAnem()"
            aria-label="Open ANEM live chat"
            title="ANEM live chat — ask, draft and review with ANEM">
        <span class="anem-fab-icon" aria-hidden="true">✦</span>
        <span class="anem-fab-label">ANEM</span>
    </button>
    <button id="feedback-fab" class="feedback-fab" onclick="openBetaFeedback()"
            aria-label="Send beta feedback"
            title="Send beta feedback — opens an email pre-filled with your build ID">
        <span class="feedback-fab-icon" aria-hidden="true">✉</span>
        <span class="feedback-fab-label">Feedback</span>
    </button>
    </div>""", 'fab')
wr(S('index.html'), h)

c = rd(S('safety_lab.css'))
c = sub1(c, """/* Compact on narrow viewports — icon-only circle. */
@media (max-width: 720px) {""", """/* 28 Oct 2026: the ANEM pill, left of Feedback, both in one fixed row (the row holds the place the Feedback pill
   used to hold on its own). ANEM wears its own blue-to-purple. */
.sl-fab-row {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 1800;
    display: flex;
    align-items: center;
    gap: 10px;
}
.sl-fab-row .feedback-fab { position: static; }
.anem-fab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 18px 11px 15px;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    font-family: var(--font-system, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #ffffff;
    background: linear-gradient(120deg, #0A84FF 0%, #AF52DE 100%);
    box-shadow:
        0 6px 18px -4px rgba(175, 82, 222, 0.45),
        0 2px 6px -2px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.22);
    transition: transform 180ms var(--ease-out, ease-out), box-shadow 180ms var(--ease-out, ease-out);
}
.anem-fab:hover {
    transform: translateY(-2px);
    box-shadow:
        0 10px 24px -6px rgba(175, 82, 222, 0.55),
        0 4px 10px -3px rgba(0, 0, 0, 0.22),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.anem-fab:active { transform: translateY(0); }
.anem-fab:focus-visible { outline: 3px solid rgba(175, 82, 222, 0.45); outline-offset: 3px; }
.anem-fab-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px; height: 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    font-size: 13px;
    line-height: 1;
}
.anem-fab-label { line-height: 1; }

/* Compact on narrow viewports — icon-only circle. */
@media (max-width: 720px) {
    .sl-fab-row { right: 18px; bottom: 18px; }
    .anem-fab { padding: 12px; }
    .anem-fab-label { display: none; }
    .anem-fab-icon { background: transparent; width: 18px; height: 18px; font-size: 16px; }""", 'css')
c = sub1(c, """@media print {
    .feedback-fab { display: none !important; }
}
body.fta-fullscreen .feedback-fab { display: none !important; }""", """@media print {
    .feedback-fab, .anem-fab { display: none !important; }
}
body.fta-fullscreen .feedback-fab, body.fta-fullscreen .anem-fab { display: none !important; }""", 'hide')
wr(S('safety_lab.css'), c)
print('ok')
