# Safety Lab Aero — IT allowlist request

**Hand this to the customer's IT or security team during setup.** It is written
to be forwarded as-is: no sales language, no product pitch, just the specific
change and the reason for it. An admin can act on it without talking to us.

---

## What we're asking for

Please exclude Safety Lab Aero's sign-in emails from automated link inspection,
and allow our sending domain.

**Domain:** `safetylabaero.com`

## Why

Our account-verification and password-reset emails contain **single-use links**.
Automated link-scanning opens the link to inspect it before the recipient does.
Because the link can only be used once, the scan consumes it, and the user is
then told the link is invalid or expired — an email that arrived correctly and a
link that was never broken.

This is not specific to us; it affects any service using one-time email links.

## The change, by platform

### Microsoft 365 — Defender for Office 365 (Safe Links)

Microsoft 365 Defender portal → **Email & collaboration → Policies & rules →
Threat policies → Safe Links** → edit the policy that covers the relevant users →
**Do not rewrite the following URLs**, and add:

```
https://safetylabaero.com/*
```

If your tenant sends our mail through a Supabase-hosted auth endpoint, add that
host too — we will confirm the exact value for your instance on request.

*(Optional, only if our mail is being filtered as well as scanned:* Threat
policies → **Tenant Allow/Block Lists → Domains & addresses** → allow
`safetylabaero.com`.)

### Google Workspace

Admin console → **Apps → Google Workspace → Gmail → Safety** → under
*Links and external images*, exclude `safetylabaero.com` from link scanning.
Optionally add the domain to **Spam, Phishing and Malware → Email allowlist**.

### Proofpoint / Mimecast / other gateways

Add `safetylabaero.com` to the URL-rewriting or URL-defence **exclusion** list.
An allowlist entry alone is not sufficient — the setting that matters is the one
that stops the gateway *following* the URL, not the one that stops it blocking
the mail.

## What this does not change

Allowlisting affects link inspection only. It does not grant Safety Lab Aero any
access to your tenant, mailboxes or directory, and it does not disable scanning
for any other sender.

## How to confirm it worked

Have one user request a verification email and click the link. If they reach the
application rather than an "invalid or expired" message, the exclusion is active.

## If you would rather not change the policy

Tell us. The sign-in screen has a **Send a new link** button, and a freshly
issued link will usually survive if it is clicked promptly. It is a workaround
rather than a fix, and we would rather you knew that than discovered it.

---

*Safety Lab Aero · safetylabaero.com*
