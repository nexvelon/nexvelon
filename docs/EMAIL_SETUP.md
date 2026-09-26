# EMAIL_SETUP.md — deliverability & sending identity (MAIL-1)

This is the reference for how Nexvelon sends email and how the domain is
configured so that email lands in the inbox, not junk. Read the top section for
the "why," then follow the numbered steps for the "what to do." Nothing here
requires code — it is DNS (at your domain registrar) and Resend settings.

> **The situation that started this.** A quote emailed to a client's Gmail
> landed in **Junk**. It was sent from `inquiries@nexvelonglobal.com` via Resend.
> This document is the fix and the permanent record of the configuration.

---

## 1. What the app sends, and from where (after MAIL-1)

Every outbound email now goes through **one** code path
(`lib/email/dispatch.ts`). There are two categories:

- **Client-facing mail** (quotes, purchase orders, work orders, RMAs, client
  invitations, onboarding confirmations): sent **FROM one authenticated address**
  — `quotes@nexvelonglobal.com` — with the **sending rep's name** as the display
  name ("Jane Rep via Nexvelon"), **reply-to set to the rep's own email** (so a
  client's reply reaches the rep), and a **BCC to `quotes@nexvelonglobal.com`**
  so you keep a copy of everything.
- **Internal / automated mail** (sign-in codes, low-stock alerts, the ops
  onboarding notice): sent from `noreply@` / `inquiries@`, never BCC'd to the
  client copy address.

Every send is recorded in the `email_log` table (who it went to, from, reply-to,
bcc, the Resend message id, and whether it succeeded or failed), so "did the
client ever get it?" is answered from the database, not from memory.

**Configurable without a code change** (Vercel environment variables):

| Variable | What it sets | Default |
|---|---|---|
| `RESEND_CLIENT_FROM_EMAIL` | the single client-facing From address | `quotes@nexvelonglobal.com` |
| `RESEND_CLIENT_BCC` | the standing BCC copy address | `quotes@nexvelonglobal.com` |
| `RESEND_CLIENT_FROM_NAME` | the org suffix in the display name | `Nexvelon` |
| `RESEND_FROM_EMAIL` | internal/transport From | `Nexvelon <noreply@nexvelonglobal.com>` |
| `RESEND_API_KEY` | the Resend API key | (secret, already set) |

---

## 2. What your DNS actually says today (diagnosis)

These were read from public DNS for `nexvelonglobal.com` during MAIL-1. **Good
news: the domain is already largely authenticated for Resend.** The records
below already exist:

- **Root SPF** (`nexvelonglobal.com`, TXT):
  `v=spf1 include:spf.protection.outlook.com -all`
  → authorizes **Microsoft 365** to send as the root domain, and hard-fails
  everything else (`-all`). This is correct for your mailboxes.
- **Resend DKIM** (`resend._domainkey.nexvelonglobal.com`, TXT): **present** — a
  DKIM public key. This is how Resend cryptographically signs your mail.
- **Resend return-path** (`send.nexvelonglobal.com`): SPF
  `v=spf1 include:amazonses.com ~all` **present**, and an MX to
  `feedback-smtp.us-east-1.amazonses.com` **present**. (Resend sends over Amazon
  SES infrastructure; this subdomain is its bounce/return path.)
- **Microsoft 365 DKIM** (`selector1`/`selector2._domainkey`): present.
- **DMARC** (`_dmarc.nexvelonglobal.com`, TXT): `v=DMARC1; p=none;`
  → present, but **monitor-only** and with **no reporting address**, so you
  currently have **no visibility** into whether mail is passing.
- **MX**: Microsoft 365 (`nexvelonglobal-com.mail.protection.outlook.com`).

**What this means:** a quote sent via Resend from `@nexvelonglobal.com` should
pass SPF (via the `send.` subdomain) and DKIM (via `resend._domainkey`), and
those align with the From domain, so DMARC should pass. **Authentication is
therefore most likely NOT the cause of the junking.**

### Why it most likely went to junk, ranked

1. **New-domain reputation (most likely).** `nexvelonglobal.com` is a young
   domain with little sending history. Gmail junks mail from unknown senders
   even when SPF/DKIM/DMARC pass — authentication is necessary but not
   sufficient. Reputation is earned with consistent, low-volume, engaged-with
   sending over days/weeks.
2. **No DMARC visibility.** With `p=none` and no `rua` reporting address, you
   cannot confirm alignment is actually passing. Adding reporting (step 3 below)
   is the single most useful diagnostic — it turns guessing into data.
3. **Content / relationship signals.** A first-contact email to a brand-new
   recipient, with a prominent button and a long one-time link, from a sender
   the recipient has never corresponded with, scores worse. Sending with the
   rep's name + reply-to (which MAIL-1 now does) helps, because replies and
   opens build reputation.
4. **Least likely: outright SPF/DKIM failure** — the records are in place.

> Confirm #1–#2 with the real message headers (step 6) before spending effort
> elsewhere. If the headers show `dkim=pass` and `dmarc=pass`, the problem is
> reputation/content, not DNS.

---

## 3. What to do at your registrar — numbered, no DNS experience needed

Your DNS is edited at the **domain registrar** where `nexvelonglobal.com` is
managed (the company you bought the domain from — e.g. GoDaddy, Namecheap,
Cloudflare, Squarespace). Log in, find **"DNS"** / **"DNS records"** /
**"Manage DNS."** Each record has a **Type**, a **Host/Name**, a **Value**, and
a **TTL** (leave TTL at the default, or 3600).

### Step 3.1 — Add a DMARC reporting address (do this first)

You have a DMARC record but it reports nowhere. Change it so you receive reports.

1. Find the existing TXT record with **Host** `_dmarc` and value
   `v=DMARC1; p=none;`.
2. **Edit** it (do not add a second `_dmarc` record) to:
   ```
   v=DMARC1; p=none; rua=mailto:dmarc@nexvelonglobal.com; fo=1;
   ```
   - `rua=mailto:...` — where the daily aggregate reports are sent. Use a real
     mailbox you can open (e.g. `dmarc@nexvelonglobal.com`, or your own address).
   - `fo=1` — ask for a failure sample when either SPF or DKIM fails.
   - Keep `p=none` for now — this is **monitoring**, it changes nothing about
     delivery yet.

- **Type:** TXT · **Host/Name:** `_dmarc` · **TTL:** 3600

### Step 3.2 — Confirm the SPF record is a SINGLE record

A domain may have **only one** SPF TXT record. Two SPF records = both silently
fail. Look at the TXT records on the **root** (`@` / blank host).

1. There should be **exactly one** value starting with `v=spf1`. Today it is:
   `v=spf1 include:spf.protection.outlook.com -all`. **Leave it as is** — it is
   correct for Microsoft 365, and Resend does **not** need to be in the root SPF
   because Resend sends from the `send.` subdomain (which has its own SPF).
2. If you ever see a **second** `v=spf1` record on the root, do not keep both.
   Merge them into one by combining the `include:` parts, e.g.
   `v=spf1 include:spf.protection.outlook.com include:amazonses.com -all`, and
   delete the extra record. (You do **not** need this today.)

### Step 3.3 — Make sure `quotes@nexvelonglobal.com` exists and you read it

Client mail now sends **from** `quotes@` and **BCCs** `quotes@`. That address
must be a real, monitored mailbox (or alias) in Microsoft 365:

1. In Microsoft 365 admin, confirm `quotes@nexvelonglobal.com` exists as a
   mailbox or a shared mailbox/alias that delivers somewhere you check.
2. This is where your BCC copies of every client email land, and where a
   client's reply goes if they reply-all. (Direct replies go to the rep, per
   reply-to.)

### Step 3.4 — Confirm the domain in Resend

1. Log in to **resend.com** → **Domains**.
2. `nexvelonglobal.com` should show **Verified** (green). If any record shows
   "pending," Resend prints the exact TXT/MX/CNAME it wants — add those at the
   registrar exactly as shown, then click **Verify**.
3. In the app, `quotes@nexvelonglobal.com` is the send address. Because Resend's
   DKIM is set at the domain level, sending as `quotes@` (or any `@nexvelonglobal.com`
   address) is already covered — no per-address setup is needed.

---

## 4. DMARC policy — the plan

- **Now: `p=none`** (monitoring). You will receive daily `rua` reports (step
  3.1). Delivery is unaffected; you are collecting evidence.
- **After ~2 weeks of clean reports** (reports show your legitimate mail passing
  SPF and DKIM, aligned): move to **`p=quarantine`**:
  ```
  v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@nexvelonglobal.com; fo=1;
  ```
  This tells receivers to treat unauthenticated mail *claiming* to be you as
  suspicious — it protects your domain from spoofing and **improves** how much
  receivers trust your real mail. Only move here once reports are clean, or you
  risk quarantining your own mail.
- **Later, optional: `p=reject`** once you are confident. Strongest protection.

---

## 5. Propagation & what "done" looks like

- DNS changes take from a few minutes up to **48 hours** to propagate (usually
  under an hour). The record's TTL is the rough upper bound per resolver.
- **Done** = the checks in step 6 show your new DMARC value live, Resend shows
  **Verified**, and a real test email to Gmail shows `SPF: PASS`, `DKIM: PASS`,
  `DMARC: PASS` in its headers.

---

## 6. How to verify (exact commands / tools)

**Check a record is live** (run in a terminal; works on Mac/Linux):

```bash
dig +short TXT _dmarc.nexvelonglobal.com          # your new DMARC value
dig +short TXT nexvelonglobal.com                 # the single root SPF
dig +short TXT resend._domainkey.nexvelonglobal.com   # Resend DKIM (a p=... key)
dig +short TXT send.nexvelonglobal.com            # Resend return-path SPF
```

No terminal? Use **https://mxtoolbox.com** — enter the domain and pick "DMARC
Lookup," "SPF Record Lookup," etc.

**Check a real message passed authentication:**

1. Send yourself (and ideally a Gmail address) a real quote from the app.
2. In Gmail, open the message → **⋮ → Show original**. Look for:
   `SPF: PASS`, `DKIM: 'PASS' with domain nexvelonglobal.com`,
   `DMARC: 'PASS'`.
3. If all three PASS but it's still in Junk, mark **"Not spam"** and reply once —
   that teaches Gmail this sender is wanted, which is exactly the reputation
   signal a new domain needs.

**Get a deliverability score:** send a quote (or any client email) to the
address shown at **https://www.mail-tester.com**, then open your score. It flags
SPF/DKIM/DMARC, blacklists, and content issues, and gives a /10 score. Aim for
9–10/10.

> **Deliverability cannot be unit-tested.** The code guarantees the identity,
> the plain-text part, absolute links, and the logging (all covered by tests).
> Whether Gmail *chooses the inbox* depends on DNS + reputation, which only a
> real send can confirm — hence step 6.

---

## 7. Building reputation (a new domain)

- Start with low volume; send to people who expect it and will open/reply.
- Ask your first few clients to reply or mark "not spam" — engagement is the
  strongest positive signal.
- Keep sending consistent (not zero for weeks then a burst).
- Avoid all-caps subjects, excessive exclamation marks, and link shorteners (the
  code already blocks shorteners and root-relative links).
- Reassess with mail-tester after a couple of weeks, then move DMARC to
  `p=quarantine`.
