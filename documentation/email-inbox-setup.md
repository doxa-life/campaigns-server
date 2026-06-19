# Email Shared-Inbox: DNS, Mailgun & Forwarding Setup

Operational guide for turning on the two-way shared inbox (send replies from `doxa.life`, receive contacts' replies in-app). The application code is already built — this covers the **infrastructure** it depends on: Mailgun domain verification, DNS (MX + sending auth), the inbound/delivery routes ("forwarding"), and the app environment variables.

> Do this once per environment. Inbound email will **not** work until the MX records and Mailgun route are in place.

---

## 1. How it works (at a glance)

```
Contact ──email──▶ doxa.life MX ──▶ Mailgun ──route(forward)──▶ POST /api/webhooks/mailgun/inbound ──▶ app
  ▲                                                                                                      │
  └──────────────── Mailgun messages API ◀── inboxEmailService ◀── reply / auto-ack ◀───────────────────┘
                          (delivery events) ──▶ POST /api/webhooks/mailgun/delivery ──▶ app
```

- **Sending** goes through the Mailgun messages API (`server/utils/inbox-email.ts`), which sets the per-message `From`, `Reply-To`, threading headers, and attachments.
- **Receiving** relies on a Mailgun **inbound route** that forwards every message for the domain to our webhook (`server/api/webhooks/mailgun/inbound.post.ts`).
- **Delivery/bounce events** post to a second webhook (`server/api/webhooks/mailgun/delivery.post.ts`).
- Both webhooks verify Mailgun's HMAC signature; inbound trust additionally requires **DKIM-aligned authentication** of the original message (`server/utils/mailgun-inbound.ts`).

### Address scheme (all on the inbox domain)

| Address | Purpose |
|---|---|
| `contact@doxa.life` | Shared address; system mail and unassigned/first-touch sends (`INBOX_CONTACT_ADDRESS`) |
| `contact+<token>@doxa.life` | A contact's replies — `<token>` routes to the conversation |
| `contact+<token>.<sig>@doxa.life` | Staff **reply-by-email** — `<sig>` cryptographically authenticates the staff sender |
| `<alias>@doxa.life` (e.g. `george@doxa.life`) | Per-user sending identity; inbound to it opens/continues a conversation for that user |
| `bounce@doxa.life` / `bounce+<verp>@doxa.life` | Reserved Mailgun VERP **Return-Path**. RFC 3834 auto-replies (out-of-office) come back here; the inbound handler **drops** them — never routed to a conversation. Real bounces/complaints arrive as delivery events, not inbound mail. |
| *anything else* `@doxa.life` | Catch-all → lands in the shared inbox as an unassigned conversation |

Because of the catch-all, **MX must point the whole domain at Mailgun.**

---

## 2. Prerequisites

- A Mailgun account with access to the **`doxa.life`** domain.
- Access to the **DNS** for `doxa.life` (registrar or DNS host).
- Decide the Mailgun **region** — US or EU. It must match for the dashboard, the MX records, and `MAILGUN_HOST`. The rest of this guide shows **US** values with EU in parentheses.

> ⚠️ **MX warning:** pointing `doxa.life`'s MX at Mailgun reroutes **all** mail for the bare domain. Confirm no existing mailboxes rely on the current MX before changing it. (Per project setup there is no Google Workspace on `doxa.life`, so this is greenfield — but verify.) Website records (A/CNAME for `doxa.life` / `www`) are unaffected; only mail (MX) changes.

---

## 3. Add & verify the domain in Mailgun

1. Mailgun → **Sending → Domains → Add New Domain**. Use **`doxa.life`** (the bare domain, to match `INBOX_DOMAIN`/`MAILGUN_DOMAIN` defaults and so `From: contact@doxa.life` is allowed).
   - *Alternative:* a sending subdomain like `mg.doxa.life` keeps root SPF cleaner, but then set `MAILGUN_DOMAIN=mg.doxa.life` and your `From` addresses must use that domain. The simple root-domain setup below matches the app defaults.
2. Pick the correct **region** (US/EU).
3. Mailgun shows the exact DNS records to add — use those values; section 4 lists what each one is.

---

## 4. DNS records

Add these on `doxa.life`. **Copy the exact host/value for SPF, DKIM, and tracking from the Mailgun dashboard** (DKIM keys are unique per domain); MX and DMARC are standard.

| Type | Host / Name | Value | Notes |
|---|---|---|---|
| **MX** | `doxa.life` (`@`) | `mxa.mailgun.org` (EU: `mxa.eu.mailgun.org`) — priority **10** | Inbound delivery |
| **MX** | `doxa.life` (`@`) | `mxb.mailgun.org` (EU: `mxb.eu.mailgun.org`) — priority **10** | Inbound delivery (second) |
| **TXT (SPF)** | `doxa.life` (`@`) | `v=spf1 include:mailgun.org ~all` | Authorizes Mailgun to send |
| **TXT (DKIM)** | `<selector>._domainkey.doxa.life` | *(long key from Mailgun)* | **Copy from dashboard.** Required for outbound signing **and** inbound auth alignment |
| **TXT (DMARC)** | `_dmarc.doxa.life` | `v=DMARC1; p=none; rua=mailto:dmarc@doxa.life` | Start at `p=none`; tighten to `quarantine`/`reject` after monitoring |
| **CNAME (tracking)** | `email.doxa.life` | `mailgun.org` | Optional — open/click tracking is off for 1:1 mail; add only if Mailgun requires it for verification |

After adding, click **Verify DNS** in Mailgun. Propagation can take minutes to hours. DKIM must verify before inbound messages will be treated as **authenticated** (which gates reply-by-email and ownership verification).

---

## 5. Inbound route (the "forwarding")

This is what forwards received mail into the app.

Mailgun → **Receiving → Create Route**:

- **Expression type:** Match Recipient
- **Recipient:** `.*@doxa.life` (catch-all, regex)
- **Actions:** `Forward` → `https://pray.doxa.life/api/webhooks/mailgun/inbound`
- **Priority:** `0`
- (Leave **Stop** unchecked unless you add more routes; if you do, make this the last/lowest-priority route.)

Mailgun's forward action POSTs the parsed message (sender, recipient, `body-html`, `stripped-text`, `message-headers` including `Authentication-Results`, attachments, plus `timestamp`/`token`/`signature`) to the webhook. The app verifies the signature, checks DKIM alignment, threads it, and files it.

### Optional: forward a specific address to an external mailbox

The app tracks per-user aliases in-app, so you normally **don't** need external forwarding. If you ever want a specific address to *also* drop into someone's personal mailbox, add a **higher-priority** route above the catch-all:

- Recipient: `george@doxa.life`
- Actions: `Forward("george.personal@gmail.com")` and (optionally) `Forward("https://pray.doxa.life/api/webhooks/mailgun/inbound")`
- Check **Stop** if it should not also fall through to the catch-all.

---

## 6. Delivery / event webhook

To capture deliveries and bounces (drives the in-thread delivery flag; never sets `verified`):

Mailgun → **Sending → Webhooks**, add the webhook URL `https://pray.doxa.life/api/webhooks/mailgun/delivery` for these events:

- `delivered`
- `permanent_failure` (and `temporary_failure` if you want soft-bounce visibility)

Event webhooks are signed the same way (signature nested under `signature`); the app verifies them.

---

## 7. App environment variables

Set these in the deployment environment (DigitalOcean App Platform → component env vars). **Never edit `.env` for me — set them yourself.** Defined in `nuxt.config.ts` (`runtimeConfig`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EMAIL_PROVIDER` | yes | `smtp` | Set to **`mailgun`** in production so inbox mail uses the Mailgun API (otherwise SMTP/MailHog) |
| `MAILGUN_API_KEY` | yes | — | Mailgun **Sending API key** |
| `MAILGUN_DOMAIN` | yes | — | `doxa.life` (or your sending subdomain) |
| `MAILGUN_HOST` | region | `api.mailgun.net` | EU: `api.eu.mailgun.net` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | yes | — | **Webhook signing key** (Settings → API Keys → *HTTP webhook signing key*). Distinct from the sending API key |
| `INBOX_CONTACT_ADDRESS` | no | `contact@doxa.life` | Shared/system From + base of the `contact+token` reply addresses |
| `INBOX_DOMAIN` | no | `doxa.life` | Domain used to validate inbound recipients and build aliases |
| `INBOX_REPLY_SECRET` | no | falls back to `JWT_SECRET` | HMAC secret signing the `contact+<token>.<sig>@` staff reply addresses. Set a dedicated value in production |

> The signing key (`MAILGUN_WEBHOOK_SIGNING_KEY`) and the sending key (`MAILGUN_API_KEY`) are **different keys** in Mailgun — webhooks fail signature verification if you swap them.

---

## 8. Verify end-to-end

1. **DNS:** Mailgun domain shows **green/verified** (especially MX + DKIM).
2. **Outbound:** in `/admin/inbox`, send a reply on a test conversation. Confirm the contact receives it, the `From` is correct (`contact@…` unassigned, or `"<First> with Doxa" <alias@…>` once assigned), and `Reply-To` is a `contact+<token>…@doxa.life` address.
3. **Inbound:** reply to that email from an external account (e.g. Gmail). Within a few seconds it should appear in the conversation, the conversation flips to **Open**, and (since Gmail is DKIM-signed) the sender's email becomes **verified**.
4. **Catch-all:** email `anything@doxa.life` from outside → a new **unassigned** conversation appears.
5. **Delivery:** check the message shows a delivered state; send to a known-bad address to see the **failed** flag.

Quick webhook reachability check (should be 200/4xx from the app, not a 404/timeout):

```bash
curl -i -X POST https://pray.doxa.life/api/webhooks/mailgun/inbound
```

(An unsigned request is rejected by the app — that's expected; you're just confirming the route exists.)

---

## 9. Local development

No DNS/Mailgun needed locally. With `EMAIL_PROVIDER` unset (or not `mailgun`), `inboxEmailService` sends via SMTP to **MailHog** (`localhost:1025`); view outgoing mail at **http://localhost:8025**. To exercise the inbound path locally, POST a sample Mailgun payload to `/api/webhooks/mailgun/inbound` (signature verification is skipped under `VITEST`; for manual local testing, mirror a captured Mailgun payload). The e2e tests under `tests/e2e/admin/inbox/` cover the full flow with the Mailgun network call short-circuited.

---

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Inbound mail never arrives in-app | MX not pointing to Mailgun, no inbound route, or route forwarding to the wrong URL |
| Webhook 401/"Invalid signature" | `MAILGUN_WEBHOOK_SIGNING_KEY` missing/wrong (using the API key by mistake), or region mismatch |
| Replies land but sender never becomes `verified`, or reply-by-email gets **held** | DKIM not verified in DNS, or sender domain has no DKIM → message isn't "authenticated" |
| Outbound rejected by Mailgun | `From` domain not a verified Mailgun sending domain, or `MAILGUN_DOMAIN`/region wrong |
| Mail to the domain bounces externally | MX records missing/incorrect or not yet propagated |
| Staff reply-by-email not sent onward | Signed `<sig>` expired/invalid, or sender lacks `inbox.send` → correctly held for review |

---

## 11. Security notes (already enforced in code)

- **Both webhooks verify** Mailgun's HMAC-SHA256 signature (timestamp + token + signing key), reject stale (>10 min) and replayed tokens — `server/utils/mailgun-webhook.ts`.
- **The `From` header is never trusted alone.** Reply-by-email requires a valid signed address **and** DKIM-aligned authentication; otherwise it's held for human review — `server/utils/mailgun-inbound.ts`.
- **Durable-before-ack:** the inbound webhook returns success only after the message is persisted; transient failures return a retryable error so Mailgun retries (idempotent by `Message-Id`).
