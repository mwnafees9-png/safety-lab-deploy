# Safety Lab Aero: commercial context for the next session (12 Sep 2026)

Companion to `NEXT_SESSION_2026-09-12.md` (engineering). This file is the deal state: Radia, Tidal Flight, Sarla, Electra, and the Kaleigh Gerlich (Boeing) thread. Everything here is as Waqas stated it; open questions are marked. Do not send anything customer-facing without his confirmation.

Company voice for anything public or customer-facing: "we", never "I". Self-deprecating humor about Waqas is fine; never at the product's expense. American English. No em dashes in customer-facing copy.

---

## Pricing framework (applies across deals)

Rack rate is $2,500 per engineer seat per month. Radia and Tidal are discounted to $2,000 per seat per month, dropping to $1,750 per seat beyond five seats; larger volumes by quote. India rate is $1,250 per seat per month, invoiced in USD. Reviewer / read-only seats are unlimited and free on every deal. Training is staged and uncapped (Safety core first, RAM, then Human Factors, then reviewers/PMs, then refreshers) with reusable reference material the customer can use to train its own service providers. Same price regardless of the user's country (except the India rate, which is country-specific by design).

Deployment on every deal: the customer's own environment (their cloud, on-prem, or browser-only), their own AI key (Anthropic or Azure OpenAI; GovCloud/Azure Gov for controlled work), ITAR fence included free. No customer data on Safety Lab systems. This is the product, not an option; the hosted site at safetylabaero.com is for trials, demos, and internal use only.

Perpetual license: offered as an alternative to subscription. Working numbers (not yet quoted to anyone): about 4x the annual (3x to 5x if negotiating), maintenance and updates free for the first two years, then about 20 percent per year; if a customer declines maintenance after year two they keep the version they bought. Subscription keeps all updates included, which stays a selling point.

Custom features and IP: if the customer wants a feature built and wants to own it exclusively, Safety Lab charges a development cost and does not release it to the general product. If Safety Lab keeps the IP and the feature goes into the product, it is comped.

Documents live in the house format (family diagonal logo, periwinkle subtitle, document-control table, static TOC): ROM generators are `/root/work/wp/build_rom.js` (Radia), `build_rom_tidal.js`, `build_rom_sarla.js` in the cloud session; PDFs and docx were delivered to Waqas in chat on 8 and 10 Sep. The Data Security white paper SL-WP-0003 v3.0 and the Deployment Guide SL-DG-0001 are on HOLD for external distribution until customer-hosted and the packaged AI backends are live and Waqas has eyeballed them.

---

## 1. Radia (the live deal; the one to win)

What they are: an outsized-freighter program (Windrunner). The Aeolus / HL-1 demo project in the app was reworked FROM Radia's real program and de-identified; never name Radia or Windrunner in anything customer-facing or in the demo.

Where it stands: demo given 4 Sep 2026. Enterprise ROM issued: SL-ROM-0001 v2.0 (rebuilt 10 Sep). Radia is in trial-license terms review; their supply chain will not decide until after a 30-business-day trial. Ansys (medini) is the incumbent alternative; Ansys had an expired $50k to $60k starter offer on the table, which is what our starter ramp answers.

Contacts: Lenny Noice, Systems Engineering & Integration, the SLA-facing contact (lenny.noice@radia.com, +1-855-723-4299 ext 709). Kirsty Lawson (radia.com) relayed the legal-prep questions. Jonathan, their reviewer (the Thursday review call). Brad Nordman, cc. Evaluation team: Brian C., Radia's Safety Lead, works from Montreal (a non-US person, which is their export-control question); AFuzion team in Los Angeles; Greg in Texas; Lenny in Oregon.

The deal as quoted (ROM v2.0): five engineer seats at $2,000 per seat per month. Starter ramp chosen by Waqas: $60k year 1, $90k year 2, $120k year 3 ($270k over three years); full rate is $120k per year. Unlimited free reviewer seats. Staged uncapped training. Same price regardless of country. Safety-only option at a reduced price if they truly will not use Human Factors (recommendation: keep HF on so they can import and trace to it). Custom-feature IP terms as above. Quote honored through the turn of the year and extendable as their process runs (a Q1 2027 start does not change the number). Perpetual: a placeholder line only; the term (3, 5, 10 years, or true perpetual) and price are to be negotiated once Lenny answers whether they want true perpetual or a fixed multi-year term. The ~$480k number has NOT been given to Radia; hold it until Lenny answers the term question. Complimentary 40-hour/month domain-expert support was removed from the ROM; safety/domain-expert services are a paid option at $200/hr on request.

Their five legal-prep questions (8 Sep) and our answers, grounded in the EULA: (1) they will upload proprietary data; recommend representative or non-controlled data for the hosted trial. (2) Where data lives: the trial runs on SLA's hosted US evaluation cloud (Supabase/AWS plus Cloudflare); production is customer-hosted, in Radia's own environment. Do not present customer-hosted as fully shipped; it is mid-build (DB half proven, AI round-trip not yet proven live). (3) Radia keeps complete ownership of Customer Data and Output (EULA §5/§8); SLA's only license is anonymized aggregate statistics, and that is offerable OFF; no model training, ever. (4) Brian using it from Canada is Radia's export-compliance call; SLA is not a registered exporter; the ITAR flag blocks public-cloud AI routing; customer-hosted keeps data inside Radia's boundary. (5) On non-continuation: a 90-day export window then deletion, or delete on request; customer-hosted and browser-only data never sits on SLA systems.

Open before anything else goes out: confirm the exact hosting region and whether to name sub-processors (Supabase/AWS/Cloudflare) to their reviewer; the reply email to Lenny (all eight negotiating positions plus refinements) was finalized 8 Sep as a draft with a casual "Waqas" sign-off; Waqas to confirm whether it went.

What to ask for at signing: a reference call, a usable quote from Lenny or the safety lead, permission to name Radia (nameable on signing, behind the marquee bar for public use), and a case study at six months. Never say "we beat Ansys" in public; say "Radia evaluated the incumbent tools and chose Safety Lab."

Risk: Radia is over 60 percent of projected revenue. Keep them happy rather than squeezed.

## 2. Tidal Flight

What they are: early-stage, pre-Series-A aircraft program. Contact: Pranav Krishnamurthy.

Terms (Waqas, 10 Sep): two engineer seats FREE until Tidal closes its Series A; on close they convert to the discounted rate, $2,000 per seat per month ($48k per year for two seats; $1,750 per seat beyond five; larger volumes by quote). Two seats is Waqas's estimate of their need; if they scale to five we discount them. Unlimited free reviewer seats; staged uncapped training; same price regardless of country; deployment in Tidal's own environment with their own AI key.

ROM: SL-ROM-0002 "Enterprise Licensing for Tidal Flight" v1.0, built 10 Sep, delivered to Waqas. Genericized where unknown: aircraft program and cert basis (generic Part 25/23/27/29/SC-VTOL list), SSO written as SAML/OIDC (Entra/Google/Okta).

Open: the free period has NO backstop date in the ROM. Recommend a cap (for example, free until Series A or 12 months, whichever comes first) before it goes out, otherwise an investor discounts this deal to zero. Confirm whether the ROM has been sent.

Revenue treatment: $0 contracted until the Series A closes; $48k per year after.

## 3. Sarla

What they are: India-based aviation prospect. Point of contact not yet on file (the ROM cover reads "Sarla, engineering leadership").

Terms (Waqas, 10 Sep): India rate, $1,250 per seat per month in USD; two named engineer seats = $30,000 per year (about 26.4 lakh INR at an indicative 88 INR/USD; confirm FX if it matters). Straightforward paid, standard 12-month term, no free period. Larger seat counts by quote. Unlimited free reviewer seats; staged uncapped training; deployment in Sarla's own environment with their own AI key. The "same price regardless of country" line is deliberately dropped here. ITAR wording softened to "controlled AI routing" since they are an Indian company.

ROM: SL-ROM-0003 "Enterprise Licensing for Sarla" v1.0, built 10 Sep, swept clean of Radia/Tidal references, delivered to Waqas.

Open: the contact name; the program and cert basis; whether the ROM has been sent.

## 4. Electra

Arrangement (Waqas, 12 Sep): Electra gets the software free in perpetuity. The free license does NOT include Safety Lab's AI key; Electra uses its own AI key. In the app, the electra.aero email domain is comped at Pro+ (`isCompedEmail` / `compedTierFor` in `misc_fn_modules.js`).

Treatment: a design-partner logo, not ARR. In any investor material it goes in "customers and design partners", never in revenue.

Open: (a) whether there is anything in writing; recommend a one-page letter covering the free license, name-use and reference rights, what Safety Lab gets for it (reference, case study, feedback), and what "in perpetuity" means on acquisition. (b) Verify Electra's accounts are actually on the bring-your-own-key path and not drafting through Safety Lab's proxy on the Pro+ allowance; the proxy meters by license token, not domain. A proxy rule refusing comped domains without a BYO key would make this structural.

## 5. Revenue picture when the three convert

Contracted at signing: about $90k per year (Radia year-1 ramp $60k plus Sarla $30k). When Tidal's Series A closes: $138k. At Radia full rate: $198k per year. Electra: $0, by design. Concentration: Radia over 60 percent.

Valuation framing Waqas has heard (not advice): an AI-native, customer-hosted aerospace safety company with four live programs, three paying, supports roughly $8M to $15M pre-money at seed; the top end needs Radia signed at full rate, Tidal converted, and a named pipeline behind them. The next bracket needs $500k to $1M ARR, six to ten paying logos, a renewal at full rate, and customer-hosted running in production at a customer. The three deals fund the company without raising.

---

## 6. Kaleigh Gerlich (Boeing)

On record: Boeing Engineering Director, formerly 777-9 engineering/safety. Outreach message SENT 10 Aug 2026 as part of that day's batch. The message led with Waqas's own 777-9 requirements-team founding story and the 30-to-40-person, $4k-per-meeting reconciliation meetings. The play was dual: widebody-scale validation of the product, and a guest-piece angle for the Altitude newsletter. She is on the NEVER-NUDGE list (with Chevillard at EASA and Manasa Srinivas at Wisk): one touch, then silence; no follow-up messages unless she replies. The outreach file was `Customer Outreach/Outreach_Gerlich_*.md` and the cadence source was `Customer Outreach/Followup_Tracker_20260813.md`; that folder is no longer in the deploy repo (moved with the Desktop clean-up on 7 Sep; check OneDrive / "Safety Lab Documents").

Not on record (Waqas to fill in for the next session): whether she replied and when; whether a call happened and what was said; whether the Altitude guest piece is in play; whether Boeing is being treated as a validation partner, a prospect, or a content channel; and whether the never-nudge rule still stands or she has become an active thread.

Standing rules that apply if the thread is live: Boeing-scale validation is the ask, not a sale; nothing about Radia, Tidal, Sarla, or Electra is shared across threads; no pitch deck, the demo is the pitch; EASA/Chevillard remains a regulator contact, never a prospect, and is not mentioned in any commercial conversation.
