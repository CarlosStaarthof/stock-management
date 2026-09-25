# 021 — Username and PIN sign-in, profile requests, first-run setup and profile management

**Feature id:** 21   **Status:** draft
**Depends on:** #3 `auth_and_roles` (**the mechanism this feature replaces**: `SessionUser`,
`getCurrentUser`, `requireRole` / `assertRole`, `requireUserPage` / `requireAdminPage`,
`shapeForRole`, `landingPathForRole`, `deepKeys` / `assertNoMoneyKeys`, the edge-safe
`baseAuthConfig`, the JWT-as-routing-hint rule and `src/server/auth/password.ts` as the one
credential-crypto module), #4 `domain_schema` (Part 3 as the schema, field for field, and the
tests that assert it), #7 `entry_start` (`/stock-entry`, `counting-as`, the `loading.tsx` rule),
#9 `entry_submit` (the audit-line grammar in `src/lib/count-audit.ts`), #10
`stock_takes_history` and #11 `analysis` (the identity header, its three recorded overflows, and
the derived `force-dynamic` and `loading.tsx` censuses; #11 must be closed first, because this
feature amends 011 AC-1 and AC-20), #20 `test_db_reset` (`TRUNCATED_TABLES` and 020 AC-4's
`information_schema` equality)

**Amended after approval, 2026-09-25: Phase 0 comes first.** Before anything else in this spec is
built, sixteen shipped git assertions written by #4, #7, #8, #10 and #11 are re-spelled so that each
names the feature whose work it describes. Without this, #21 cannot get a green gate before its
commit. Phase 0 is built, gated and committed on its own (AC-44 to AC-47). See *Post-approval
amendments* at the end.

## Revision of 2026-09-23 — username + PIN

The first draft of this spec (37 criteria) implemented **PIN-only** sign-in: the PIN alone
identified the user (decision D5). Its own residual-risk table showed that design gave a patient
attacker about **45 %** odds of a break-in within 30 days on 4-digit PINs. On 2026-09-23 the owner
reversed D5: **people sign in with a username and a PIN.** He also decided that the secret key
(`PIN_PEPPER`) is **kept**, that the first account comes from a **first-run setup screen** guarded
by a one-time `SETUP_CODE`, and that "root" is **just the first `ADMIN`** — two roles only.

D5 is **marked superseded, not deleted** (see the decisions table), so a later reader can see what
was decided, why it was reversed, and what the reversal cost. Everything in the draft that still
holds is kept: everyone uses a PIN, the administrator included; 4 or 6 digits for every role;
self-service requests wait for approval; the admin section; no master PIN and no backdoor; no PIN
value written down anywhere. What D5 alone required — PIN uniqueness, the never-reissued registry
(`IssuedPin`), the lookup-key column, "PIN cannot be used" at approval — is gone. The criteria are
rewritten and renumbered: there are now **43**.

## Purpose

Every person who uses this product signs in with an email address and a password of at least
twelve characters, created for them by an operator at a console (003). That is the wrong shape
for a yard: the counting screen is used one-handed, outdoors, in gloves, on a phone, by people
who do not have or do not use a work email, and nobody can create their own account. The owner
has decided the product signs in with a **username and a PIN**, that anyone may **ask** for a
profile from the sign-in page, that an administrator **approves** each one, that an administrator
manages profiles and roles from inside the product rather than from a database console, and that
the very first administrator is created on a fresh server by a **one-time setup screen**.

Without this feature the product cannot go live (#16): the first yard phone would need an
operator to invent an email address for its user and read a twelve-character password to them.

It is also the most security-sensitive change this repository has made. A 4- or 6-digit PIN is
weaker than every alternative the owner was shown, and he chose it knowingly. This spec's job is
to make it **as safe as that design allows, and to say plainly, with numbers, where it cannot
be** — so that a later reader sees decisions rather than oversights.

## The owner's decisions — binding, each with the tradeoff it accepts

These were made by the owner (Carlos) after being shown the alternatives. They are not re-argued
here. Each is recorded with what it costs, because a decision whose cost is not written down is
indistinguishable from an oversight.

| # | Decision | The tradeoff it accepts |
|---|---|---|
| D1 | **Everyone signs in with a PIN — the admin included.** Email and password go away entirely. | The administrator's profile, which sees every euro in the product, is protected by a username that is not a secret and a 4- or 6-digit PIN. There is no stronger factor for the account that most needs one. |
| D2 | **The sign-in page offers two things: "Sign in" (username and PIN) and "Create profile".** *Wording amended 2026-09-23 with D8; the draft's labels were "Enter PIN" and "Create PIN".* | The page that grants access is also a public form that writes rows. It must be rate limited and must reveal nothing (S2, AC-19, AC-20). |
| D3 | **A new profile is `PENDING` until an `ADMIN` approves it.** A pending, rejected or deactivated profile cannot sign in. | Nobody can start work the moment they are hired: someone with the `ADMIN` role must act first. The product sends no notification — the person asks the owner in person (see *Out of scope*). |
| D4 | **An admin section manages profiles** — approve, reject, change role, reset a PIN, deactivate, clear a lock, and create a profile directly — `ADMIN`-only, refused in the service layer, not the middleware (003 AC-16). | A second place in the product where a role is changed, which is a second place a mistake can remove the last administrator. Guarded in S10 and AC-23. |
| D5 | ~~**PIN only. The PIN alone identifies the user.** No username, staff code, email or name is entered at sign-in.~~ **Superseded on 2026-09-23 by D8.** | *As it stood:* PINs had to be unique across live profiles; a guess could match any account rather than one; and lockout could not be per account, because the server did not know whose PIN was being guessed. Its residual-risk table gave ≈ 45 % odds of a break-in within 30 days and near-certainty within a year on 4 digits, which is why it was reversed. |
| D6 | **4 or 6 digits, for every role.** | A 4-digit PIN has 10,000 values. With a username, one guess can match one account, not any of twenty. The owner may choose 6 digits for his own profile; nothing forces it. |
| D7 | **No master PIN and no backdoor of any kind.** Owner access is his own `ADMIN` profile with his own PIN, plus a **server-side reset script** that replaces `scripts/admin-create.ts`. It keeps 003 AC-7 (no default, no fallback, nothing committed) and 003 AC-6 (prints no secret and no hash). | If every `ADMIN` forgets their PIN, the only way back in is a person with shell access to the server and its environment. That is deliberate: a recovery path reachable from the internet is a backdoor by another name. |
| D8 | **Username + PIN** (2026-09-23). The username is chosen when the profile is created, is unique and case-insensitive, and is separate from the display name. | One more thing to type at a yard. Usernames are chosen by people and are usually first names, so the username is an **identifier, not a secret**: the protection still rests on the PIN and the lock. What it buys is the lock (D12) and the end of every problem D5 created. |
| D9 | **The secret key `PIN_PEPPER` is kept**, as extra protection held outside the database. | Like `AUTH_SECRET`, it must be backed up. Losing it invalidates every PIN at once — recoverable (S4), but every person gets a new PIN. |
| D10 | **The first account comes from a first-run setup screen and a one-time `SETUP_CODE`** set on the server, replacing a script-only bootstrap. | On every fresh database, a public page that can create an `ADMIN` exists until someone uses it. It is guarded by the code, a budget, and a rule decided by the data (S9). |
| D11 | **"Root" is just the first `ADMIN`. Two roles only: `ADMIN`, `YARD_STAFF`.** | There is no super-administrator. Any `ADMIN` can demote or deactivate any other, including the one who ran setup; only the last-administrator rule (S10) stops the last one going. |
| D12 | **A per-account lock that is timed and doubles, with a cap, which an `ADMIN` can clear early, with every lock and failure count visible in the admin section.** Recommended by the coordinator; accepted by the owner. | A timed lock means a stranger cannot lock anyone out for longer than a day without an `ADMIN`'s help — and, for the same reason, it opens again, so **guesses keep accumulating** at a slow, steady rate for as long as an attacker keeps going. Quantified in *Residual risk*, which also corrects the figure the owner was first given. |

**No PIN value and no setup-code value appear anywhere in this repository** — not in this spec,
not in an example, not in a test, not in a seed, not in a fixture. Every PIN and every setup code a
test uses is generated at runtime (AC-8).

## What D8 changes, and what it does not

The draft spent three sections on problems that D5 created. Username + PIN dissolves all three:

- **Uniqueness versus salted hashing.** PIN-only sign-in had to find a profile *from the PIN*, so
  the PIN had to be stored as a deterministic, indexed lookup key, and PINs had to be unique.
  Sign-in now reads **one row, by username**, so the PIN can be stored salted and slow (S3), two
  people may hold the same PIN, and the `IssuedPin` registry, the never-reissued rule and the
  "this PIN cannot be used" approval path all disappear.
- **Enumeration through the request form.** *Create PIN* could have told a stranger which PINs were
  live. *Create profile* never compares a PIN with anything, so it cannot. A narrower version of
  the problem exists for usernames and is settled in S2.
- **Rate limiting without an identity.** The username is the identity a lock needs. The lock is
  per account (S5, S6); the draft's device budgets stay behind it as a secondary bound (S8).

What it **does not** fix: a short PIN can still be exhausted **offline** by anyone who holds a copy
of the database **and** the pepper, however it is hashed — the pepper is what stops that (S3).
Human-chosen PINs are still not uniform. And it adds one new lever: a stranger who knows a
username can keep that account locked (quantified in *Residual risk*).

## What this spec decides, each with the tradeoff it accepts

### S1 — What a username is

**Decided.** A username is 3 to 32 characters after trimming and lower-casing; it begins with a
letter `a`–`z` and continues with `a`–`z`, `0`–`9`, `.`, `_` or `-`. It is **stored lower-case**,
so two spellings that differ only in letter case are one username — at sign-in, at request, at
approval and in the database's unique index. It is **immutable**: nothing renames one. It is
**never reissued**: a row that ever held a username is never deleted, so the username stays taken
for as long as the database exists.

**Why the leading letter.** A username can never be all digits, so a PIN typed into the username
field by mistake is refused as malformed before anything is kept or logged.

**Why ASCII.** Case-insensitivity is then one `lower()` with no Unicode folding rules, and two
usernames cannot be made to look identical with look-alike characters.

**Tradeoff.** A person called Seán signs in as `sean`. A person who leaves keeps their username
forever, so a returning person, or a new person with the same first name, picks another.

### S2 — A taken username is settled at approval, never revealed at request

**Decided.** *Create profile* stores the requested username in `requestedUsername`, which is not
unique and is never compared with anything. The request is accepted identically whether the
username is free, held by a live profile, held by a deactivated one, or requested by someone else
(AC-19). At approval the `ADMIN` sees the requested username pre-filled, may change it, and a
taken one is refused **to the `ADMIN`** with the username named (AC-21).

**Why.** The sign-in page answers only "these two match" or "they don't"; it never says whether a
username exists. If *Create profile* answered "that username is taken", it would be the one
public page that confirmed a username to a stranger — and a confirmed username is exactly what an
attacker needs to aim guesses or a lock. A username is not a secret among colleagues; it is not
published to strangers either.

**Tradeoff.** A requester who picks a taken username learns their actual one from the
administrator who approves them, not from the page.

### S3 — How a PIN is stored: bcrypt over a keyed HMAC

**Decided.**

```
pinDigest(pin) = hex( HMAC-SHA256( PIN_PEPPER, "macroads:pin:v1:" + pin ) )   // 64 characters
pinHash        = bcrypt( pinDigest(pin), cost 10 )                              // bcrypt's own random salt
pinKeyId       = first 16 hex characters of HMAC-SHA256( PIN_PEPPER, "macroads:pin-key-id:v1" )
```

`PIN_PEPPER` is 32 or more random bytes, held in the environment, never in code, git or the
database.

**Why bcrypt now, when the draft dropped it.** The draft's objection was to a bcrypt of the **bare
PIN** stored **beside** a lookup HMAC: that bcrypt could be attacked with no pepper at all. Here
the bcrypt input *is* the HMAC, so there is no pepper-free path — no stored value can be tested
without the pepper — and bcrypt still slows an attacker who has both:

| What leaks | The draft (HMAC only) | This spec (bcrypt over the HMAC) |
|---|---|---|
| The database alone | Nothing usable. | Nothing usable: every stored value is a bcrypt of a digest keyed by 256 bits the database does not hold. |
| The database **and** `PIN_PEPPER` | Every PIN, instantly (a million HMACs). | Every PIN, at up to 10,000 bcrypt trials per profile for 4 digits and 1,000,000 for 6. At cost 10, about 75 ms a trial on one CPU core: roughly **12 minutes** per 4-digit profile and **21 hours** per 6-digit profile; on one consumer GPU, roughly **seconds** and **minutes**. |
| `PIN_PEPPER` alone | Nothing. | Nothing — there is no stored value to test it against, and it signs nothing else (S7). |

Said plainly: **bcrypt slows the offline attack; the pepper is what prevents it.** A 4-digit PIN
cannot be made safe against someone holding both.

**No separate per-profile salt.** bcrypt already draws a random 128-bit salt for every hash and
stores it inside the hash: that *is* the per-profile salt, and it is why two equal PINs never
produce equal stored values. Salting the HMAC input as well would add a column and change no row
of the table above: without the pepper nothing can be tested; with it, the attacker pays one
bcrypt per trial per profile either way.

**Why the hex digest.** bcrypt reads at most 72 bytes, and some implementations stop at a zero
byte. The 64-character hex digest is under the limit and contains no zero byte, so every bit of the
digest counts.

**Cost per sign-in.** One HMAC (microseconds) and **one bcrypt comparison at cost 10 — roughly
50–100 ms of server CPU**, the figure 003's bcrypt already costs. It is paid on every *evaluated*
attempt, including one naming a username nobody holds (against a hash of random bytes made once
per process, so the response time does not reveal whether a username exists). An attempt refused
by a budget or a lock is not evaluated and costs no bcrypt, which bounds the CPU the public page
can be made to spend. **Why cost 10, not 12:** 12 quadruples every sign-in and every test fixture,
and moves the "database and pepper" row from minutes on a GPU to a few more minutes on a GPU. The
pepper, not the cost, is what protects a 4-digit PIN.

`bcryptjs` stays in `package.json`, and `src/server/auth/password.ts` stays the one file that
computes a credential digest (003 AC-5, amended in AC-6).

### S4 — Which pepper a PIN was stored under, and what happens when the pepper is lost

**Decided.** Every stored PIN carries `pinKeyId`, a 16-character fingerprint of the pepper it was
made under. It reveals nothing about the pepper (it is an HMAC of a constant). A PIN whose
`pinKeyId` is not the current one is **not evaluated as a failure**: sign-in answers
`INCORRECT`, records nothing against the account, and logs one `auth.pin_key_mismatch` line; the
admin section and the reset script show that profile's PIN as needing a reset (AC-32).

**Why.** Without it, a mistyped or replaced `PIN_PEPPER` in production looks exactly like
"everybody's PIN is wrong": every attempt counts as a failure, everybody is locked, and an
operator trying to repair it can set a new PIN under the wrong pepper and make it worse. With it,
the fault is named in the logs and on screen, and nobody is locked by it.

**What happens when the pepper is lost** — exactly:

1. The operator sets a **new** `PIN_PEPPER`; the lost one cannot be recovered.
2. Every stored PIN now has a stale `pinKeyId`: every sign-in answers `INCORRECT`, **nobody is
   locked**, and every PIN shows as needing a reset. Every lock record is keyed under the old
   pepper (S5), so every lock is forgotten. **Sessions and device tokens are unaffected** — they
   are signed with `AUTH_SECRET`, not the pepper.
3. Any `ADMIN` who still has a session open (sessions last up to seven days) resets every
   profile's PIN from `/profiles` and reads each new PIN to its person. If no `ADMIN` has a session
   open, the operator runs `pin:reset -- --profile <an ADMIN's id>` with a new PIN (AC-30) — for a
   fresh install, that is the first `ADMIN`, the "root" of D11 — and that `ADMIN` signs in and
   resets everyone else.
4. Pending requests made under the old pepper carry unusable PINs: an `ADMIN` approves and then
   resets them, or rejects them and asks for a new request.

Nothing else is lost: counts, prices, profiles, roles and usernames live in the database, not
under the pepper. `/setup` does **not** come back, because `ADMIN` rows still exist (S9).

**A leaked pepper** is handled the same way: replace it, then reset everyone. A leaked pepper
without the database threatens nothing on its own (S3's table).

**Tradeoff.** One more column. And while a pepper is wrong, a careful observer could tell a live
username with a stale PIN from an unknown one, because the first writes nothing — only for as long
as the outage lasts.

### S5 — The lock is kept per typed username, and nothing typed is stored

**Decided.** The lock is keyed by `accountKey(username)` — HMAC-SHA256 under `PIN_PEPPER` of
`"macroads:account:v1:"` and the lower-cased username — **whether or not a profile holds that
username.** So a lock, its message and its timing are the same for a live username and an invented
one, and "locked" is never evidence that a username exists. The only difference a stranger could
observe is that a live account's count is also reset by its owner's successful sign-ins — which
they can learn only by spending failures on it, from the same budgets.

The lock table and the event log store the **account key, never the typed username**, and logs
name no username. A person who types their username and PIN run together into the username field
has therefore not written their PIN into the database or the logs.

**Tradeoff.** Lock records exist for usernames nobody holds (bounded by the budgets and by
30-day retention, AC-14). Changing the pepper forgets every lock (S4).

### S6 — The lock rule: five wrong, then 15 minutes doubling to a 24-hour cap

**Decided** — adopting the timed, doubling lock the owner accepted (D12), with these numbers:

- **Five** consecutive wrong PINs for one username lock it.
- Lock *k* lasts **15 minutes × 2^(k − 1)**, capped at **24 hours**: 15 min, 30 min, 1 h, 2 h,
  4 h, 8 h, 16 h, then 24 h for the eighth lock and every one after.
- A **successful sign-in** zeroes both the count and the level.
- An `ADMIN`'s **clear** — and a PIN **reset**, from `/profiles` or the script — ends the current
  lock at once and zeroes the count, but **keeps the level**. Clearing in the middle of an attack
  therefore gives an attacker five more guesses, not a fresh run of thirty-five; the person's own
  next successful sign-in zeroes the level.
- A lock refuses **new sign-ins only**. Sessions already open continue — so an owner whose account
  is locked by a stranger can still clear his own lock from the session he already has.
- An attempt refused by a lock is not evaluated and not recorded.
- Attempts on one username are **serialised** by a row lock on its lock record, so twenty
  simultaneous wrong PINs cannot all be evaluated before the lock is seen (AC-12).

**Why timed and not hard.** A hard lock that only an `ADMIN` can clear lets a stranger who knows
usernames lock everyone out on purpose — the administrators included, leaving only the server
script. A timed lock repairs itself.

**Why five.** A gloved thumb mistypes. Five in a row is past fumbling and into not knowing the PIN.

**Why a 24-hour cap.** A person caught in a stranger's lock can always sign in the next day with
nobody's help. A longer cap slows a patient guesser further (a 7-day cap cuts the yearly total at
one account from about 1,855 guesses to about 305) but leaves the real person locked out for up to
a week after an attacker stops. The owner may choose otherwise at approval (*Open questions*).

**Tradeoff — stated in numbers in *Residual risk*:** the lock slows a guesser to five a day; it
never stops one.

### S7 — The device token is signed with `AUTH_SECRET`, not the pepper

**Decided.** The `macroads-device` token (S8) is authenticated with an HMAC under a key derived
from `AUTH_SECRET`, domain-separated from every other use. The draft signed it with the pepper.

**Why.** A token forged under a leaked pepper would move its holder out of the shared new-device
budget. Under `AUTH_SECRET`, a pepper leak threatens nothing but PINs — and an `AUTH_SECRET` leak
already lets an attacker forge sessions, so the token adds no new exposure there. A replaced
pepper also leaves every known device known.

**Tradeoff.** Rotating `AUTH_SECRET` forgets every device as well as every session.

### S8 — The device budgets stay, as the secondary bound

**Decided** — kept from the draft, unchanged in shape and size:

- A **known device** is a browser holding a valid `macroads-device` token: a random id and an
  expiry, issued on **every successful sign-in** and valid for 180 days. It has **its own** budget:
  10 wrong attempts in any rolling 24 hours.
- **Every other request** draws on **one shared budget for all new devices on the internet**: 10
  wrong attempts in any rolling 24 hours.
- An attempt made when its budget is spent is **refused before anything is read** and renders
  `SIGN_IN_PAUSED_MESSAGE`. It reveals nothing, because it is decided before any username or PIN
  is looked at. An `ADMIN` can lift the new-device pause (AC-26).
- Each budget check is serialised by a transaction-scoped lock on its bucket, so concurrent
  attempts cannot overshoot it (AC-14).
- The same shape bounds *Create profile* (10 a day per budget, at most 20 `PENDING` at once) and
  `/setup` (10 wrong codes a day, one bucket).

**What it now does.** Under D5 it was the only defence. Now the lock bounds guesses **at each
account**, and the budget bounds what the untrusted internet can do **across** accounts: how many
guesses it can spread over many usernames, how many accounts it can keep locked (two a day: ten
failures ÷ five), and how much bcrypt work it can make the server do.

**Why not per IP.** As the draft argued: the IP is a header — off-platform it is whatever the
client sends, and on-platform a whole yard's phones share one Wi-Fi address, so a per-IP lock
punishes the yard for one stranger. A shared new-device budget bounds the whole untrusted internet
at a fixed number of guesses a day **however many addresses an attacker controls**, which a per-IP
tier cannot do.

**Tradeoff (unchanged from the draft).** An attacker can pause sign-in from new devices for
everyone, every day, with ten wrong guesses. Every known device, and every session already open,
keeps working.

### S9 — First-run setup, decided by the data

**Decided.**

- `/setup` is available **only while no `User` row has `role = ADMIN`, in any status**, and only
  while `SETUP_CODE` is set to at least **16** characters and `PIN_PEPPER` is usable. Otherwise it
  responds `404`. The check reads the profiles on every request: **no column, table or flag records
  that setup happened.** A deactivated `ADMIN` keeps its role, and the last active `ADMIN` cannot
  be removed (S10), so once any `ADMIN` exists, an `ADMIN` row exists forever and `/setup` never
  returns.
- A submission is handled in this order: availability (else `404`); the setup budget, 10 wrong
  codes in any rolling 24 hours, one bucket for everyone (else `SETUP_PAUSED_MESSAGE`, with the
  code not compared); the code, **compared in constant time** — both sides hashed with SHA-256 and
  compared with `timingSafeEqual`, so neither content nor length leaks through timing — and **never
  logged or rendered back**; then the name, username and PIN. A wrong code writes one
  `SETUP_FAILURE` event. Field errors after a correct code write nothing.
- It creates the first `ADMIN` — `ACTIVE`, with the chosen display name, username and PIN — and,
  in the same transaction, the single row of `SetupClaim`, whose primary key can only be `1`. Two
  simultaneous submissions both pass the availability check; **only one can insert that row**, the
  other's transaction rolls back whole, and it is told setup is no longer available (AC-29). The
  claim is the race guard, not the availability rule.
- Success redirects to `/sign-in?setup=done`. **Setup creates no session**: the new administrator
  signs in like everyone else, which also proves they typed their PIN as they meant to.

**On a database migrated from 003 that already holds an `ADMIN` row** — the development database
— `/setup` is unavailable by design, and the operator gives that row a username and a PIN with
the reset script (AC-30). Every **fresh** database — which is what #16 deploys — starts with setup.

**Tradeoff.** On a fresh deployment, a public page that can create an `ADMIN` exists until the
owner uses it. A stranger who finds it needs the code, gets ten guesses a day at a code of at least
16 characters, and can at worst spend the day's ten and delay the owner's setup by a day.

### S10 — The last active administrator cannot go

**Decided.** Demoting or deactivating an `ADMIN` locks every `ACTIVE` `ADMIN` row (`SELECT … FOR
UPDATE`) in the same transaction, and refuses with `LAST_ADMIN_MESSAGE` if the change would leave
no `ACTIVE` `ADMIN` that holds a username and a PIN. Two administrators demoting each other at the
same moment cannot both succeed (AC-23). Without this rule, `/setup` could come back for anybody
holding the code.

**Tradeoff.** An `ADMIN` cannot step down while alone; they promote someone first.

### S11 — The reset script repairs; it never creates

**Decided.** `npm run pin:reset` replaces `admin:create`. It lists profiles, and sets a PIN (and,
for a row migrated from 003 that has none, a username) on an **existing `ACTIVE`** profile. It has
no default, no fallback, no prompt and no generated PIN; it prints no PIN, no hash and no key
(AC-30). It **creates no profile**: the first `ADMIN` comes from `/setup` (D10).

**Tradeoff.** If a fresh database's setup code is lost before setup, the operator sets a new one;
there is no second bootstrap path, deliberately.

### S12 — The identity header shows the display name

**Decided.** The shared header shows the profile's **display name** — what the person, and anyone
glancing at a yard phone to see who is counting, recognises — and not the username. It wraps at any
character, measured with an 80-character unbroken name (AC-37), which closes the overflow recorded
in 010's fifth and sixth amendments instead of reintroducing it.

**Tradeoff.** A person reads their username only where they type it; they learn it when they
choose it or from the administrator who approved it.

### S13 — Audit lines name the username

**Decided.** #9's grammar `<at> <EVENT> by <name> <<ref>>[: <reason>]` is unchanged, and the
bracketed reference becomes the actor's **username**. Display names are not unique; usernames are,
are never reissued (S1), and — unlike an id — a person can read one. `AuditEntry.actorEmail` is
renamed `actorRef`. Lines already stored with an email in the brackets parse back unchanged
(AC-38).

**Tradeoff.** Usernames appear wherever audit lines are shown. That is acceptable because a
username is an identifier, not a secret (D8).

### S14 — Rejecting keeps the row; deactivating keeps the username

**Decided.** Rejecting a request sets `REJECTED`, clears its requested username and its PIN hash,
and keeps the row. Deactivating a profile sets `DEACTIVATED`, clears its PIN hash and keeps its
username, which is never reissued. No row that holds a credential outlives the state that needs it.

**Tradeoff.** Rejected and deactivated rows accumulate in the list; *Out of scope* records that
nothing deletes them.

## Residual risk — the numbers, recomputed for username + PIN

The planning figures are **N = 20 live profiles**, **A = 2 of them `ADMIN`**. PINs are assumed
uniformly random; the last paragraph says why real ones are worse. A 4-digit PIN has 10,000 values
(9,976 after the trivial-PIN rule — immaterial at this precision), a 6-digit one 1,000,000. The
lock is S6's; the budgets are S8's.

### How fast one account can be guessed

| | Guesses at one account | 4 digits | 6 digits |
|---|---|---|---|
| Before its first lock | 5 | 0.05 % | 5 in a million |
| First 24 hours | 35 (10 through the new-device budget) | 0.35 % (0.1 %) | 35 in a million |
| 30 days | about 180 (about 170 through the new-device budget) | **≈ 1.8 %** | ≈ 0.018 % |
| One year | about 1,855 (about 1,845) | **≈ 18.5 %** | ≈ 0.19 % |
| No limits at all, one bcrypt at a time | every value in about 12 minutes | certain | every value in about 21 hours |

Where the schedule comes from: locks of 15 minutes, 30 minutes, 1, 2, 4, 8 and 16 hours open
seven windows of five guesses in the first 16 hours; from the eighth lock, about 32 hours in,
every lock lasts 24 hours, so the guesser gets five a day, every day, for as long as they keep
going. Through the new-device budget the early windows are squeezed into ten a day, which reaches
the same five-a-day pace about five days in; the totals barely differ.

### The figure the owner was first given was optimistic

The owner was told that with per-account lockout *"a guesser gets ~5 chances in 10,000 at one
account before it locks"*. That sentence is true of the **first** lock, and of a lock that never
opens. It is **not** true of the lock the owner then accepted. A timed lock opens again; doubling
slows a guesser but never stops one. Over **30 days** a patient guesser gets about **170–180
chances in 10,000** at one account — about **thirty-five times** the quoted figure — and over a
**year** about **1,850**, nearly **one in five**. **The coordinator's framing was optimistic**, and
a reader should take the table above, not that sentence, as the risk accepted. The honest one-line
version is: *five chances at first, then five chances a day for as long as the attacker keeps at
it — every one of them visible on `/profiles`.*

A hard lock would have kept it at five, at the cost S6 describes: a stranger could lock everyone,
the administrators included, until someone with server access intervened.

### The whole product

| Attacker | 30 days, 4 digits | 1 year, 4 digits | 30 days, 6 digits | 1 year, 6 digits |
|---|---|---|---|---|
| An outsider who knows the two `ADMIN` usernames — every hit is an `ADMIN` | **≈ 3.0 %** | **≈ 33 %** | ≈ 0.03 % | ≈ 0.37 % |
| An outsider who knows every username and will take any hit | ≈ 3 % | ≈ 31–33 % | ≈ 0.03 % | ≈ 0.37 % |
| An insider who holds a profile, aiming at the two `ADMIN`s | ≈ 3.6 % | ≈ 34 % | ≈ 0.036 % | ≈ 0.37 % |
| An insider spraying the other 19 profiles | ≈ 29 % | ≈ 98 % | ≈ 0.34 % | ≈ 3.5 % |
| An outsider who knows **no** username, guessing from 1,000 plausible names that include all 20 | ≈ 0.06 % | ≈ 0.7 % | ≈ 6 in a million | ≈ 0.007 % |
| *For comparison — the draft's PIN-only design (D5)* | *≈ 45 %* | *≈ 100 %* | *≈ 0.6 %* | *≈ 7 %* |

- **Outsiders.** The new-device budget caps the whole untrusted internet at ten wrong guesses a
  day, however many addresses it uses. An account at the cap absorbs five a day, so two accounts
  use all of it: aiming at two accounts or at twenty gives about the same odds, and aiming at the
  two `ADMIN`s makes every hit an `ADMIN` — every euro in the product.
- **Insiders.** A person who holds any profile can sign in from as many fresh browsers as they
  like, and each gets a known-device token with its own budget; for them **only the per-account
  lock binds**. Against the two `ADMIN`s that is the same five a day each, so the odds are about the
  outsider's. Spraying colleagues' accounts gives much higher odds of *some* hit; a hit on a
  `YARD_STAFF` profile gives no new access, but it does let the insider act under someone else's
  name. The 98 % figure is a year of every colleague being locked out most of every day — not a
  quiet attack.
- **No known username.** Every guess must get both halves right: 20 / 1,000 × 1 / 10,000.
  Usernames are chosen by people, are usually first names, and appear in audit lines, so this is
  the weakest assumption in the table; the owner's own username is probably guessable from the
  company's name.

**What the owner sees, and what changes the numbers.** Every guess above is a failure on
`/profiles` (AC-26), and most of them keep an account locked. None of the figures assumes anybody
reacts. The reaction that changes them is a **reset to a generated 6-digit PIN**: it moves that
account into the 6-digit columns and restarts the guesser from nothing. A clear alone only ends the
current lock. Against the headline risk — a 4-digit `ADMIN` — the change from D5 is from about
45 % in 30 days to about 3 %; the one-year figure is still about one in three, and a generated
6-digit `ADMIN` PIN takes it to about one in 270.

**Denial of service.** A stranger who knows a username can keep that account locked: at the cap,
five wrong PINs a day. Through the new-device budget they can do that to at most **two accounts a
day**, and the same ten guesses pause sign-in from new devices for everyone. An insider minting
device tokens can keep any number of accounts locked. What keeps working: every open session (so
the owner can clear his own lock from the session he already has) and every known device for every
account that is not locked.

**Offline.** With the database alone, nothing. With the database and `PIN_PEPPER`, every 4-digit PIN
in minutes to hours and every 6-digit PIN in hours to days, per S3's table.

**Human-chosen PINs are not uniform**, so every figure above is optimistic. Published analyses of
leaked 4-digit PINs find that a small number of values covers a large share of human choices. This
spec refuses the most common families outright — one digit repeated, and a straight run of
consecutive digits up or down (AC-7) — by a rule, so no PIN value is written down. It cannot refuse
years, dates, repeated pairs or patterns only the chooser finds memorable, and a guesser who tries
those first does better than the table in the first windows. PINs generated by a reset or by an
`ADMIN` creating a profile are uniform.

## Scope boundary

**In:** the `User` reshaping and its migration; `AccountLock`, `AuthEvent` and `SetupClaim`;
username + PIN sign-in through the existing Auth.js credentials provider; the account lock; the
device token and the budgets; *Create profile*; `/setup`; `/profiles` and its actions; the reset
script that replaces `admin:create`; the shared identity header; and every shipped assertion those
force, each named in the criterion that forces it.

**Unchanged, and asserted unchanged:** the two roles and Part 6's matrix; landing by role
(`/stock-entry` for `YARD_STAFF`, `/stock-takes` for `ADMIN`); session lifetime (7 days, refreshed
at most daily); the JWT as a routing hint only, with every server-side decision re-reading the
`User` row; `shapeForRole` and the money boundary; `requireRole` failing closed as a service;
`/stock-entry?denied=<key>` as where a refused staff session lands.

## User stories

- As a **YARD_STAFF** user at a yard, in gloves, I type my username, tap my PIN on a large keypad,
  and land on Stock Entry — no email and no twelve-character password.
- As a **new starter**, I tap *Create profile*, give my name, choose a username and a PIN, and am
  told plainly that an administrator must approve me and will confirm my username.
- As an **ADMIN**, I open *Profiles*, see who is waiting, and approve them as yard staff or as an
  administrator — changing the username if it is taken — or reject them. I can also create a
  profile myself and read the person their PIN.
- As an **ADMIN**, when someone forgets their PIN I reset it and read them a new one; when someone
  is locked out I can clear the lock; when someone leaves I deactivate them and they are locked out
  on their very next request.
- As the **owner**, I can see every profile's failed attempts and locks, how many incorrect PINs
  were typed in the last day, and whether sign-in from new devices is paused — so an attack is
  something I notice rather than something that succeeds quietly.
- As the **owner on a new server**, I open `/setup` once with the setup code I chose and create my
  own administrator profile; after that the page no longer exists.
- As the **owner**, if I forget my own PIN, the person who runs the server can reset it from the
  server; nobody on the internet can.
- As a **stranger**, I get five guesses at an account before it locks and five a day after that,
  ten a day across every account shared with everyone else like me, and *Create profile* tells me
  nothing about which usernames or PINs exist.

## Data touched

### Schema — `User` reshaped; three models and two enums added

```prisma
enum Role          { YARD_STAFF ADMIN }                                  // unchanged
enum ProfileStatus { PENDING ACTIVE REJECTED DEACTIVATED }
enum AuthEventKind { PIN_FAILURE PROFILE_REQUEST SETUP_FAILURE BUDGET_RESET }

model User {
  id                String        @id @default(cuid())
  username          String?       @unique  // lower-case; NULL for a request and for a 003 row not yet given one
  requestedUsername String?                // PENDING only; not unique; never compared
  name              String                 // display name: 1..80 chars, no line break, tab, < or >
  role              Role          @default(YARD_STAFF)
  status            ProfileStatus @default(PENDING)
  pinHash           String?                // bcrypt over the keyed digest; never the PIN
  pinKeyId          String?                // which PIN_PEPPER pinHash was made under
  sessionEpoch      Int           @default(0)  // bumped by a reset: ends every session
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  setupClaim          SetupClaim?
  stockCountsCreated  StockCount[] @relation("StockCountCreatedBy")
  stockCountsApproved StockCount[] @relation("StockCountApprovedBy")
  stockCountsSigned   StockCount[] @relation("StockCountSignedBy")

  @@index([status])
}

/// One per typed username, whether or not a profile holds it (S5). No PIN, no typed text, no user id.
model AccountLock {
  accountKey          String    @id          // accountKey(username): 64 hex
  consecutiveFailures Int       @default(0)
  level               Int       @default(0)  // locks since the last successful sign-in
  lockedUntil         DateTime?
  updatedAt           DateTime  @updatedAt
}

/// Budget bookkeeping and the failure history /profiles shows. No PIN, digest, code, typed text or user id.
model AuthEvent {
  id         String        @id @default(cuid())
  kind       AuthEventKind
  bucket     String        // "pin:new-devices" | "pin:device:<id>" | "request:new-devices" | "request:device:<id>" | "setup"
  accountKey String?       // PIN_FAILURE with a well-formed username only
  at         DateTime      @default(now())

  @@index([bucket, kind, at])
  @@index([accountKey, at])
}

/// The race guard for first-run setup: at most one row, ever (S9). Not the availability rule.
model SetupClaim {
  id        Int      @id                    // CHECK: always 1
  userId    String   @unique
  claimedAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Restrict)
}
```

**Removed from `User`:** `email` (and its unique index), `passwordHash`, `active`. `status`
replaces `active`: one column saying which of four states a profile is in, rather than a boolean
and a guess. **No column anywhere stores a PIN**; `pinHash` stores bcrypt over a digest keyed by a
secret the database does not hold. The draft's `IssuedPin` model and `pinLookup` /
`requestedPinLookup` columns were never shipped and do not exist.

Ten hand-written `CHECK` constraints, in the style #4 used for `Item_description_not_empty`:

| Constraint | Expression |
|---|---|
| `User_username_format` | `"username" IS NULL OR "username" ~ '^[a-z][a-z0-9._-]{2,31}$'` |
| `User_requested_username_format` | `"requestedUsername" IS NULL OR "requestedUsername" ~ '^[a-z][a-z0-9._-]{2,31}$'` |
| `User_request_only_when_pending` | `("requestedUsername" IS NOT NULL) = ("status" = 'PENDING')` |
| `User_pending_shape` | `"status" <> 'PENDING' OR ("username" IS NULL AND "pinHash" IS NOT NULL AND "role" = 'YARD_STAFF')` |
| `User_pin_needs_username` | `"pinHash" IS NULL OR "status" = 'PENDING' OR "username" IS NOT NULL` |
| `User_pin_only_when_live` | `"pinHash" IS NULL OR "status" IN ('PENDING', 'ACTIVE')` |
| `User_pin_key_with_pin` | `("pinHash" IS NULL) = ("pinKeyId" IS NULL)` |
| `SetupClaim_single_row` | `"id" = 1` |
| `AccountLock_key_format` | `"accountKey" ~ '^[0-9a-f]{64}$'` |
| `AuthEvent_account_key_format` | `"accountKey" IS NULL OR "accountKey" ~ '^[0-9a-f]{64}$'` |

Because a stored username can only be lower-case, the unique index on `username` **is** the
case-insensitive uniqueness rule, enforced by the database. An `ACTIVE` profile may have a `NULL`
username and `NULL` PIN: that is every account migrated from 003, which cannot sign in until the
operator gives it both.

### The migration — `<timestamp>_pin_profiles`

One new migration, run through `DIRECT_URL`. It creates the two enums and three tables; adds
`status` and **backfills it from `active` before dropping `active`** (`true` → `ACTIVE`, `false` →
`DEACTIVATED`); adds `username`, `requestedUsername`, `pinHash`, `pinKeyId` and `sessionEpoch`,
setting none of the first four on any existing row; creates the unique index, the foreign key and
the ten `CHECK`s; and drops `email`, `passwordHash` and `active`. It inserts **no** row into any
table. Every row survives, because `StockCount` references `User` with `Restrict` and a person who
counted cannot be deleted — they become `ACTIVE` with no username and no PIN, or `DEACTIVATED`.

**Consequence, stated.** After this migration, on a database that held 003 accounts, nobody can
sign in until the operator gives a migrated `ADMIN` row a username and a PIN with
`pin:reset -- --profile <id>` (AC-30), `/setup` stays unavailable there because an `ADMIN` row
exists (S9), and every session minted before it is refused (AC-17).

### `specs/domain-model.md` Part 3 and the schema tests

Part 3 is the schema field for field, and 004 AC-1 / AC-4 assert that. Part 3's `User` row is
rewritten to the fields above, rows for `AccountLock`, `AuthEvent` and `SetupClaim` and the two
enums are added, and the file records that #21 made the change on the owner's decisions D1–D12.
The shipped tests that assert Part 3 are amended to match — named in AC-1. Part 6 is unchanged: it
already gives `ADMIN` "user management".

### Environment

- `PIN_PEPPER` — **required**; at least 32 bytes, base64. Generated per environment with the same
  one-line command `docs/operations.md` → *Environment* gives for `AUTH_SECRET`, and **backed up outside the
  server** like `AUTH_SECRET` (S4). The development database, the production database and every
  developer each have their own.
- `SETUP_CODE` — **optional**; at least 16 characters when set. Read only by `/setup`, and only
  while no `ADMIN` exists (S9). Removing it after setup is tidy but not required.
- `AUTH_SECRET` — unchanged; now also signs the device token (S7).

`npm run test:db` generates `PIN_PEPPER` and `SETUP_CODE` at runtime for its run and never reads
the developer's. `npm run test:e2e` uses the developer's `.env`, because the served build and the
test process must compute the same digests and device tokens.

## Contract

### Routes

| Route | Access | What it is |
|---|---|---|
| `/sign-in` | public | Username field and PIN pad. `?callbackUrl=`, `?reason=inactive`, `?setup=done`. A link *Create profile* |
| `/sign-in/create` | public | *Create profile*: name, username, PIN, PIN again. Server action |
| `/sign-in/requested` | public | The one acknowledgement every accepted request sees |
| `/setup` | public — **`404` unless setup is available** (S9) | First-run setup: setup code, name, username, PIN, PIN again. Server action |
| `/profiles` | `ADMIN` — `requireAdminPage("profiles")` | The admin section. Eight server actions: approve, reject, change role, reset a PIN, deactivate, clear a lock, create a profile, resume new devices |
| `/api/session` | signed in | `{ id, username, name, role, landingPath }`, else `401` |
| `/api/users` | `ADMIN` | `{ users: [{ id, username, name, role, status }] }`, else `403` / `401` |
| `/api/auth/*` | public | Auth.js handlers — **including the credentials callback, which is limited exactly as the form is** (AC-15) |

`PROTECTED_PATHS` gains `"/profiles"` and the matcher gains `"/profiles/:path*"`. The three
`/sign-in` routes and `/setup` stay public; nothing links to `/setup`. Every new page declares
`export const dynamic = "force-dynamic"`, and no `loading.tsx` is added at or above any of them.

### Services and pure modules

| Module | Exports | Touches Prisma |
|---|---|---|
| `src/server/auth/password.ts` | `pinDigest`, `hashPin`, `verifyPin`, `currentPinKeyId`, `accountKey`, `signDeviceToken`, `verifyDeviceToken`, `setupCodeConfigured`, `setupCodeMatches` — **the one credential-crypto module** and the only reader of `PIN_PEPPER`, `SETUP_CODE` and `AUTH_SECRET` | no |
| `src/server/auth/credential-rules.ts` | `PIN_LENGTHS`, `parsePin`, `isTrivialPin`, `generatePin`, `parseUsername`, `parseProfileName`, `SETUP_CODE_MIN_LENGTH` (16) | no — pure except `generatePin`'s randomness |
| `src/server/auth/account-lock.ts` | `ACCOUNT_LOCK_THRESHOLD` (5), `ACCOUNT_LOCK_BASE_MINUTES` (15), `ACCOUNT_LOCK_CAP_HOURS` (24), `lockDurationMinutes`, `applyOutcome`, `isLocked` | no — **pure** |
| `src/server/auth/attempt-budget.ts` | `PIN_FAILURE_BUDGET` (10), `PROFILE_REQUEST_BUDGET` (10), `SETUP_FAILURE_BUDGET` (10), `BUDGET_WINDOW_HOURS` (24), `PENDING_PROFILE_CAP` (20), `DEVICE_TOKEN_MAX_AGE_DAYS` (180), `EVENT_RETENTION_DAYS` (30), `decideAttempt`, `bucketFor` | no — **pure** |
| `src/server/auth/sign-in-service.ts` | `attemptSignIn` | yes |
| `src/server/auth/profile-request-service.ts` | `requestProfile` | yes |
| `src/server/auth/setup-service.ts` | `setupAvailable`, `completeSetup` — imported by `src/app/setup/**` and tests only | yes |
| `src/server/auth/profile-admin-service.ts` | `listProfiles`, `approveProfile`, `rejectProfile`, `changeProfileRole`, `resetProfilePin`, `deactivateProfile`, `clearAccountLock`, `createProfile`, `pinFailureSummary`, `resumeNewDeviceSignIn` | yes |
| `src/server/auth/operator-service.ts` | `listProfilesForOperator`, `setCredentialsForOperator`, `createActiveProfile` — **imported by `scripts/`, tests and `tests/e2e/support/` only** | yes |
| `src/server/auth/user-service.ts` | `findActiveUserById`, `listUsers` (kept); `createUser`, `verifyCredentials`, `setUserActive`, `deleteUserByEmail` **removed** | yes |
| `src/lib/auth-messages.ts` | every message and label the screens render, plus `USERNAME_MIN_LENGTH` (3), `USERNAME_MAX_LENGTH` (32) and `MAX_NAME_LENGTH` (80), which the rules import | no |
| `src/components/PinPad.tsx` | the keypad (client) | no |
| `src/components/IdentityHeader.tsx` | display name, sign-out, optional links — one header for every signed-in page | no |

```ts
type SessionUser = { id: string; username: string; name: string; role: Role };  // no email, no PIN

type DeviceContext = { deviceToken: string | null };

type SignInOutcome =
  | { outcome: "SIGNED_IN"; user: SessionUser; sessionEpoch: number; deviceToken: string }
  | { outcome: "INCORRECT" }    // wrong PIN, unknown username, pending, rejected, deactivated,
                                // no PIN yet, stored under another pepper, malformed — one answer
  | { outcome: "LOCKED" }       // this username is locked; the PIN was not evaluated
  | { outcome: "PAUSED" }       // this device's budget is spent; nothing was read
  | { outcome: "UNAVAILABLE" }; // PIN_PEPPER missing or unusable; fail closed

attemptSignIn(username: string, pin: string, device: DeviceContext): Promise<SignInOutcome>;

type RequestOutcome = { outcome: "SENT" } | { outcome: "PAUSED" } | { outcome: "UNAVAILABLE" };
requestProfile(
  input: { name: string; username: string; pin: string; pinAgain: string },
  device: DeviceContext,
): Promise<RequestOutcome>;                                     // ValidationError on bad input

type SetupOutcome =
  | { outcome: "CREATED"; profile: ProfileListEntry }
  | { outcome: "CODE_INCORRECT" } | { outcome: "PAUSED" } | { outcome: "UNAVAILABLE" };
setupAvailable(): Promise<boolean>;
completeSetup(input: { code: string; name: string; username: string; pin: string; pinAgain: string }):
  Promise<SetupOutcome>;                          // ValidationError on bad fields, only after the code matched

type AccountLockView = {
  locked: boolean; lockedUntil: string | null;
  consecutiveFailures: number; level: number; failuresLast30Days: number;
};

type ProfileListEntry = {
  id: string; username: string | null; requestedUsername: string | null;
  name: string; role: Role; status: ProfileStatus; createdAt: string;
  credentialSet: boolean;          // holds a username and a PIN
  credentialNeedsReset: boolean;   // its PIN was stored under another PIN_PEPPER (S4)
  lock: AccountLockView | null;    // null when it has no username
};

approveProfile(actor: SessionUser | null, id: string, role: Role, username?: string): Promise<ProfileListEntry>;
rejectProfile(actor: SessionUser | null, id: string): Promise<ProfileListEntry>;
changeProfileRole(actor: SessionUser | null, id: string, role: Role): Promise<ProfileListEntry>;
resetProfilePin(actor: SessionUser | null, id: string, length: 4 | 6):
  Promise<{ profile: ProfileListEntry; newPin: string }>;        // newPin is returned ONCE
deactivateProfile(actor: SessionUser | null, id: string): Promise<ProfileListEntry>;
clearAccountLock(actor: SessionUser | null, id: string): Promise<ProfileListEntry>;
createProfile(actor: SessionUser | null,
  input: { name: string; username: string; role: Role; length: 4 | 6 }):
  Promise<{ profile: ProfileListEntry; newPin: string }>;        // newPin is returned ONCE
pinFailureSummary(actor: SessionUser | null): Promise<{
  newDevices: number; knownDevices: number;   // PIN_FAILURE events in the last 24 hours, by bucket kind
  unknownUsernames: number;                   // of those, the ones that named no profile's username
  newDevicesPaused: boolean;
}>;
resumeNewDeviceSignIn(actor: SessionUser | null): Promise<void>;
```

### The rules this contract encodes

**One attempt, in this order.** From step 2 on, everything happens inside one transaction.

1. `PIN_PEPPER` unusable → `UNAVAILABLE`. Nothing is read or written.
2. **The device budget.** A transaction-scoped advisory lock on the bucket, then its events. Spent →
   `PAUSED`; nothing is read from `User` or `AccountLock`, nothing is written.
3. **Parse.** A malformed username or PIN → `INCORRECT`, one `PIN_FAILURE` in the device bucket
   with no account key; no `User` read, no bcrypt.
4. **The account.** The `AccountLock` row for `accountKey(username)`, created if absent, locked
   `FOR UPDATE`. Locked → `LOCKED`; nothing written, no `User` read, no bcrypt.
5. **The profile.** One `User` read, by `username`.
6. **One bcrypt comparison** — against the profile's `pinHash` when it is `ACTIVE` and its
   `pinKeyId` is current, otherwise against a hash of random bytes made once per process. A match
   → `SIGNED_IN`: the lock row's count and level set to 0, the device token issued or renewed, no
   event written.
7. An `ACTIVE` profile whose PIN was stored under another pepper → `INCORRECT`, nothing written,
   one `auth.pin_key_mismatch` log line naming no username (S4).
8. Anything else → `INCORRECT`: `applyOutcome(FAILURE)` on the lock row, which may start a lock,
   and one `PIN_FAILURE` event carrying the bucket and the account key; events and lock rows past
   retention are deleted.

**One credential check, reached by both transports.** The Auth.js `authorize` callback calls
`attemptSignIn` and nothing else, so the sign-in form's server action and a direct `POST` to
`/api/auth/callback/credentials` meet the **same** budget and the **same** lock. A limiter placed
only in the server action would be bypassed by the second path; AC-15 proves it is not. Each
failed attempt records **exactly one** `PIN_FAILURE` event and one step of the lock, however many
layers it passed through.

**The session carries an epoch.** The JWT carries `sub`, the role hint and `epoch`, copied from
`User.sessionEpoch` at sign-in. `getCurrentUser` returns the user only when the row is `ACTIVE`
**and** the token's epoch equals the row's. A PIN reset increments the epoch, so a PIN that leaked
stops working **and** every session obtained with it ends on its next request. A token with no
epoch claim — every token minted before this feature — is refused.

**Pending profiles are always `YARD_STAFF`, and have no username yet.** The role is chosen by the
approving `ADMIN`, never by the requester; a forged `role` field on *Create profile* is ignored
(AC-18), and `User_pending_shape` makes the database refuse anything else.

**At least one `ACTIVE` `ADMIN` holding a username and a PIN always remains** (S10).

**Setup is decided by the data, and happens once** (S9).

**Audit lines name a username** (S13).

## UI states

`/sign-in`:

- **Empty.** Heading `Sign in`; a text field labelled `Username`; a masked field labelled `PIN`;
  with JavaScript, a 3-column keypad of the ten digits, a delete key and the submit key `Sign in`;
  a link `Create profile`. No error region.
- **Loading.** The submit key shows a pending state and cannot be pressed twice.
- **Error.** `INCORRECT_SIGN_IN_MESSAGE` for any failed attempt, identical in every case;
  `ACCOUNT_LOCKED_MESSAGE` while the username is locked; `SIGN_IN_PAUSED_MESSAGE` when the device's
  budget is spent; `SIGN_IN_UNAVAILABLE_MESSAGE` when the server cannot evaluate PINs; and
  `SESSION_ENDED_MESSAGE` on arrival with `?reason=inactive`. After every outcome the username
  stays in its field and the PIN field is empty.
- **Success.** Redirect to a safe `callbackUrl` if present, else to `landingPathForRole`. Arriving
  with `?setup=done` renders `SETUP_COMPLETE_MESSAGE` above an empty form.

`/sign-in/create`:

- **Empty.** `Your name`, `Username`, `PIN`, `PIN again`, the submit `Send for approval`, a link
  back to `Sign in`.
- **Loading.** The submit shows a pending state.
- **Error.** One field message from the messages module; the name and username are kept, both PIN
  fields are cleared. `PROFILE_REQUESTS_PAUSED` when a budget or the pending cap is spent.
- **Success.** `303` to `/sign-in/requested`, which renders `PROFILE_REQUEST_SENT` — an
  administrator must approve the profile and will confirm the username — and a link to `Sign in`.
  The same page for every accepted request.

`/setup` (only while setup is available; otherwise `404`):

- **Empty.** Heading `Set up Macroads Stock`; a masked `Setup code`, `Your name`, `Username`, `PIN`,
  `PIN again`, the submit `Create administrator`.
- **Loading.** The submit shows a pending state.
- **Error.** `SETUP_CODE_INCORRECT_MESSAGE`, `SETUP_PAUSED_MESSAGE`, or one field message after a
  correct code. The setup code and both PIN fields are empty after every outcome — the code is
  never rendered back.
- **Success.** `303` to `/sign-in?setup=done`.

`/profiles`:

- **Empty.** `NO_PENDING_PROFILES` above an otherwise complete list. There is always at least one
  profile — the `ADMIN` looking at it.
- **Loading.** Plain forms and links; the browser's own progress. No `loading.tsx`.
- **Error.** A refused action (`USERNAME_TAKEN_MESSAGE`, `LAST_ADMIN_MESSAGE`,
  `ONLY_ACTIVE_PIN_RESET`, a field message) renders beside the profile or form it concerns;
  nothing changes.
- **Success.** The list re-renders with the new state. A reset or a direct creation renders the new
  PIN once, in `data-testid="new-pin"`, with `RESET_PIN_SHOWN_ONCE`.
- **Always.** A summary of the last day's failures and the new-device pause; per profile, its
  failures in the last 30 days, its lock while locked, and `CREDENTIAL_NEEDS_RESET_LABEL` when its
  PIN predates the current pepper.

## Phone-first

The sign-in page is used at a yard, on a phone, possibly with gloves.

- **A numeric keypad for the PIN, not the phone's keyboard.** Twelve keys in three columns, every
  key at least **44 × 44** CSS px, measured at **390 px and 320 px**, with no sideways scroll. The
  PIN field itself also carries `inputmode="numeric"`, so a person who taps it gets the phone's
  digit keyboard.
- **The username is typed once, with the phone's keyboard,** into a field at least 44 px tall that
  neither auto-capitalises nor auto-corrects (either would change what was typed). It stays in its
  field after a failed attempt, so a retry is only the PIN.
- **The browser is asked to remember neither field** (`autocomplete="off"`). On a shared yard
  phone a PIN saved in the browser's password manager would be a key left in the door. On a
  personal phone that is the person's own choice, and the product cannot prevent it (*Out of
  scope*).
- **Without JavaScript** the keypad is absent and both fields work on their own: type and submit.
  The keypad is a client enhancement, never the only way in.
- **A half-typed PIN is never kept.** It is not written to `localStorage`, `sessionStorage`, a
  cookie or the URL, and it is cleared when the page becomes hidden (the screen locks, the user
  switches app), when the page is restored from the back-forward cache, and on reload — so a phone
  put down mid-PIN and picked up by someone else shows an empty pad. Re-typing four or six digits
  is cheap. `docs/conventions.md`'s rule *never lose a user's typed count* is about **counts**; a
  PIN is the one thing this product deliberately forgets.
- **The identity header wraps at any character** (S12, AC-37).

## Acceptance criteria

Tests that touch only `credential-rules.ts`, `account-lock.ts`, `attempt-budget.ts`,
`password.ts`, `auth-messages.ts`, `count-audit.ts` or a source scan are `*.test.ts` and run in
`npm run test:unit` with no database. Tests that read the database are `*.db.test.ts` under
`src/server/auth/`, call `resetTestDb()` in `beforeEach`, build their own fixture, and run under a
`PIN_PEPPER` and a `SETUP_CODE` generated at runtime. Browser-level criteria are Playwright specs
named `tests/e2e/pin-*.spec.ts` plus the rewritten `sign-in.spec.ts`. **Every PIN and every setup
code any test uses is generated at runtime** (AC-8).

**Provable with no database:** AC-1's schema half, AC-2's SQL-text half, AC-4's constant half,
AC-5, AC-6, AC-7, AC-8's scan half, AC-11, AC-13, AC-16's token half, AC-28's comparison half,
AC-31, AC-32's mapping half, AC-37's scan half, AC-38's pure half, AC-39, AC-40's diff half, AC-41
and AC-42. Every other criterion needs Postgres or a browser and lives in `*.db.test.ts` or
`tests/e2e/`. **Not provable end to end on the development database:** `/setup`'s form, because
that database always holds an `ADMIN` row; AC-27 to AC-29 prove it against the test database and
assert its `404` end to end.

*Added with Phase 0, 2026-09-25:* the paragraph above covers AC-1 to AC-43. AC-44, AC-45 and
AC-46 need neither a database nor a browser, and neither do AC-47's documentation and commit
halves. AC-46 is a proof the implementer runs and records, not a gate test.

1. **AC-1** — **The schema is Part 3, and Part 3 says what the owner decided.** `prisma/schema.prisma` declares `User` with exactly the scalar fields `id`, `username`, `requestedUsername`, `name`, `role`, `status`, `pinHash`, `pinKeyId`, `sessionEpoch`, `createdAt`, `updatedAt`, in that order — no `email`, no `passwordHash`, no `active`, and no field whose name matches `/pin/i` other than `pinHash` and `pinKeyId` — with `username` declared `String?` and `@unique`. It declares the models `AccountLock` (`accountKey` as `@id`, `consecutiveFailures`, `level`, `lockedUntil`, `updatedAt`), `AuthEvent` (`id`, `kind`, `bucket`, `accountKey`, `at`, with `@@index([bucket, kind, at])` and `@@index([accountKey, at])`) and `SetupClaim` (`id` as `Int @id`, `userId` `@unique` with a relation to `User` declaring `onDelete: Restrict`, `claimedAt`), and the enums `ProfileStatus { PENDING ACTIVE REJECTED DEACTIVATED }` and `AuthEventKind { PIN_FAILURE PROFILE_REQUEST SETUP_FAILURE BUDGET_RESET }` in those orders; `Role` is unchanged. `specs/domain-model.md` Part 3 lists exactly these fields, models and enums and names #21 as the source of the change. The shipped assertions of Part 3 are amended to match and to nothing else: in `tests/unit/schema-and-migration.test.ts` the census becomes **twelve** models and **five** enums and the per-model field lists gain these changes; in `tests/unit/project-contract.test.ts` the "nine models and three enums" test becomes twelve and five; in `src/server/schema/columns.db.test.ts`, 004 AC-1's table census becomes the **twelve** tables and 004 AC-5's `User` columns become the eleven above with Part 3's types and nullabilities; in `src/server/schema/referential.db.test.ts`, 004 AC-19's foreign-key census gains `SetupClaim.userId` as `RESTRICT` (nine `RESTRICT`, twelve in all); and in `src/server/test-db.test.ts`, 020 AC-6's unit half becomes **twelve** `@id` declarations, **ten** carrying `@default(cuid())` and exactly two, `AccountLock.accountKey` and `SetupClaim.id`, carrying no `@default` at all, with `autoincrement` still appearing nowhere. 020 AC-6's database half (no sequence in `pg_class`) is unchanged. `npx prisma validate` and `npx prisma generate` exit `0` with no reachable database.
2. **AC-2** — **One migration, which keeps every row and seeds nothing.** `git diff --name-only <this feature's base commit>..HEAD -- prisma/migrations` lists files in exactly one new directory, `prisma/migrations/<timestamp>_pin_profiles/`. Its SQL creates both enum types and the three tables; adds `status` and sets it from `active` — `ACTIVE` where `active` was true and `DEACTIVATED` where false — **before** the statement that drops `active`; adds `username`, `requestedUsername`, `pinHash`, `pinKeyId` and `sessionEpoch` and sets none of the first four on any existing row; drops `email`, its unique index, `passwordHash` and `active`; and creates the unique index on `username`, the foreign key of `SetupClaim.userId` and the ten `CHECK` constraints named in *Data touched*. The SQL contains no `INSERT INTO` naming `"User"`, `"SetupClaim"`, `"AccountLock"` or `"AuthEvent"`. `npx prisma migrate status` reports no drift and no pending migration against both databases. The implementer applies it to the development database and records in `progress/impl_pin_auth.md` the `User` row count and the count of `active = true` rows before, and the row count and the count of `ACTIVE` rows after — the two pairs equal — and the count of rows with `role = ADMIN` after, which decides whether `/setup` is available there (AC-27). **Two checks are written through Phase 0's feature-scoped helper (AC-45), never as a range ending at `HEAD`:** this criterion's own "exactly one new directory" compares **the base commit with the working tree** while #21 is `in_progress`, and **#21's own commits** afterwards. A two-commit range would see nothing before the commit and would count later features' migrations after it. And **004 AC-23's census** (`schema-and-migration.test.ts`, *"prisma/migrations holds exactly two directories"*) is re-spelled as **#4's own claim**: the files #4's commits added under `prisma/migrations` lie in exactly one directory, matching `/^\d{14}_create_stock_domain$/`. The first two directories must still be `create_user` then `create_stock_domain`, in that order. It is never re-amended when a later feature adds a migration, because a hand-maintained count is the list that went stale in #9. **004 AC-24's database twin** (`columns.db.test.ts`, *"both migrations are applied, in order, and none was rolled back"*) is re-spelled the same way: ordered by `started_at`, the first two `_prisma_migrations` rows match `/^\d{14}_create_user$/` then `/^\d{14}_create_stock_domain$/`, and **every** row is finished and none rolled back, whatever follows. It carries no row count, and this criterion's own test pins the third row as `_pin_profiles`.
3. **AC-3** — **The database refuses an impossible profile.** Against the test database, each of these is refused by Postgres with an error naming the violated constraint, and leaves the table's row count unchanged: a `PENDING` row with a `NULL` `requestedUsername`, with a non-null `username`, with a `NULL` `pinHash`, or with `role = ADMIN`; an `ACTIVE` row with a non-null `requestedUsername`; a `username` or a `requestedUsername` containing an upper-case letter, beginning with a digit, or of 2 or of 33 characters; a `pinHash` without a `pinKeyId`, and a `pinKeyId` without a `pinHash`; a `pinHash` on a `REJECTED` or `DEACTIVATED` row, or on a non-`PENDING` row whose `username` is `NULL`; a `SetupClaim` whose `id` is not `1`; an `AccountLock` or `AuthEvent` whose `accountKey` is not 64 lowercase hexadecimal characters. A second `User` with an existing `username`, a second `SetupClaim` row, and deleting a `User` that a `SetupClaim` references are each refused with a unique-violation or foreign-key error and change no row.
4. **AC-4** — **The truncate list names the three new tables, and every shipped claim that no table was added is re-spelled as history.** `TRUNCATED_TABLES` in `src/server/test-db.ts` equals as a set exactly `["AccountLock", "AuthEvent", "Item", "ItemLocation", "ItemPrice", "ItemType", "SetupClaim", "StockCount", "StockCountLine", "Supplier", "User"]`, and 020 AC-4's `information_schema` equality in `src/server/test-db.db.test.ts` passes **unmodified**. `src/server/test-db.test.ts`'s 020 AC-2 set assertion becomes these eleven. The two shipped assertions that state a past feature added no table — "AC-29: TRUNCATED_TABLES is unchanged, because #8 adds no table" in `tests/unit/count-entry-contract.test.ts` and the two "AC-22" `TRUNCATED_TABLES` / schema assertions in `tests/unit/stock-takes-contract.test.ts` — are rewritten as claims about **their own feature's fixed commit range** (`git diff --name-only <that feature's base>..<that feature's commit> -- prisma src/server/test-db.ts` is empty), per `docs/conventions.md` → Tests, so they stay true after this feature and after every later one; neither is deleted.
5. **AC-5** — **A PIN is stored as bcrypt over a keyed HMAC, tested with no database.** In `src/server/auth/password.ts`: `pinDigest(pin)` returns 64 lowercase hex characters, identical for one pepper and different under another; `hashPin(pin)` returns `{ pinHash, pinKeyId }` whose `pinHash` matches `/^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/` (bcrypt at cost 10 or above); hashing one PIN twice gives two different `pinHash` values and `verifyPin(pin, pinHash)` is `true` for both; `verifyPin` is `false` for a different PIN, and `false` for the same PIN once `PIN_PEPPER` is replaced by another generated value — so no stored value can be tested without the pepper; no `pinHash` contains the PIN or its digest; `pinKeyId` is 16 lowercase hex characters, identical for every hash made under one pepper and different under another; `accountKey(username)` is 64 lowercase hex characters, identical for two spellings of one username that differ only in letter case, different under another pepper, and does not contain the username. With `PIN_PEPPER` unset, empty, or decoding to fewer than 32 bytes, each of these throws, and the thrown message names `PIN_PEPPER` and contains no part of its value. Every PIN, username and pepper in these tests is generated at runtime.
6. **AC-6** — **One file computes a credential digest, and it alone reads the three secrets.** A source scan of tracked and untracked files under `src/`, `scripts/` and `prisma/` finds exactly one file that imports `bcryptjs` or calls `createHmac` or `timingSafeEqual`: `src/server/auth/password.ts`. `bcryptjs` stays in `dependencies`. The three `AC-5` tests of `tests/unit/hashing-boundary.test.ts` are amended — the detector also matches `createHmac` and `timingSafeEqual`, the operations the module must export are `hashPin` and `verifyPin`, and the script that must reach hashing through the service layer is `scripts/pin-reset.ts` — and keep their non-vacuity assertion. The set of names read as `process.env.<NAME>` anywhere under `src/server/auth/**` and in `src/lib/auth-config.ts` is exactly `{ "AUTH_SECRET", "PIN_PEPPER", "SETUP_CODE" }`, and all three are read in `src/server/auth/password.ts` and in no other file of that set.
7. **AC-7** — **The credential rules are pure, and they are rules, not lists.** In `src/server/auth/credential-rules.ts`: `parsePin` accepts a string of exactly 4 or exactly 6 ASCII digits and nothing else — it raises `ValidationError` with `PIN_FORMAT_MESSAGE` for 3, 5 and 7 digits, an empty string, a leading or trailing space, a letter, a sign, a decimal point and full-width digits. `isTrivialPin` is `true` for every PIN of either length whose digits are all equal and for every PIN whose digits each rise by exactly one or each fall by exactly one — the test **constructs every such PIN from the rule at runtime** (24 of four digits, 20 of six) and asserts that `parsePin` refuses each with `PIN_TOO_SIMPLE_MESSAGE` — and `false` for 1,000 PINs drawn at random from the rest. `generatePin(4)` and `generatePin(6)` return strings of that length that `parsePin` accepts, drawn with `crypto.randomInt`; over 2,000 draws none is trivial and every digit position takes all ten values. `parseUsername` trims and lower-cases its input and accepts exactly the strings of `USERNAME_MIN_LENGTH` (3) to `USERNAME_MAX_LENGTH` (32) characters that begin with a letter `a`–`z` and continue with `a`–`z`, `0`–`9`, `.`, `_` or `-`; it raises `ValidationError` with `USERNAME_FORMAT_MESSAGE` for 2 and for 33 characters, a leading digit, a leading `.`, an inner space, an `@`, a non-ASCII letter and an empty string, and returns the same value for two inputs that differ only in letter case and surrounding spaces. `parseProfileName` trims and accepts 1 to `MAX_NAME_LENGTH` (80) characters, raising `ValidationError` with `NAME_REQUIRED_MESSAGE` for a blank name, `NAME_TOO_LONG_MESSAGE` for 81 characters, and `NAME_CHARACTERS_MESSAGE` for a line break, a carriage return, a tab, `<` or `>`. `SETUP_CODE_MIN_LENGTH` is `16`.
8. **AC-8** — **No PIN and no setup code is written down anywhere, and nothing seeds a profile.** A scan of every tracked and untracked file (the scan's own source excepted) finds no string literal of exactly 4 or exactly 6 digits assigned to, passed as, or compared with an identifier, key, parameter or form field whose name matches `/pin/i`; no `fill` of a PIN input with a literal; and no string literal **that could be a setup code** (one with no whitespace and at least `SETUP_CODE_MIN_LENGTH`, 16, characters) assigned to, passed as, or compared with a name matching `/setup_?code/i`, other than the placeholders `REPLACE_WITH_A_GENERATED_SECRET` and `<choose-a-setup-code>`. A message constant such as `SETUP_CODE_INCORRECT_MESSAGE` is exempt **by its content**, because it is a sentence, **not by its name**, so renaming a constant can't smuggle a code past the scan. `.env` assigns nothing to `NEW_PIN`, checked by name, with no value read out. Every PIN a test uses comes from `generatePin` or `crypto.randomInt` at runtime, and every setup code from `crypto.randomBytes`. No migration and no script writes a `User` row except `scripts/pin-reset.ts` updating an existing one (AC-30), and after `npm run test:db`'s own migration of an empty test database, `User` holds **zero** rows.
9. **AC-9** — **Signing in with a username and a PIN.** For an `ACTIVE` profile holding a username and a PIN, entering both at `/sign-in` sets the Auth.js session cookie and lands a `YARD_STAFF` profile on `/stock-entry` and an `ADMIN` on `/stock-takes`; the username typed in capitals, or with surrounding spaces, signs in the same profile; from `/sign-in?callbackUrl=%2Fanalysis` an `ADMIN` lands on `/analysis`, and a `callbackUrl` of `//` or `https://` form is ignored. `GET /api/session` returns `200` and a body whose keys are exactly `id`, `username`, `name`, `role`, `landingPath`, with `username` the stored lower-case one. The sign-in form contains exactly two text-entry controls, named `username` and `pin`, and no control whose name or label matches `/email|password/i`. The header on the landing page renders the profile's `name` in `data-testid="signed-in-name"`.
10. **AC-10** — **Every failure is one answer, and costs the same work.** Each of (a) a well-formed username no profile holds, (b) an `ACTIVE` profile's username with a wrong PIN, (c) the requested username and PIN of a `PENDING` request, (d) the username and former PIN of a now-`DEACTIVATED` profile, (e) the requested username and PIN of a `REJECTED` request, and (f) a 3-digit PIN, a 5-digit PIN, a 4- or 6-digit PIN that `isTrivialPin` refuses (built by rule at runtime, never written down) and a username beginning with a digit — returns HTTP `200` on `/sign-in`, renders exactly `INCORRECT_SIGN_IN_MESSAGE` in `data-testid="sign-in-error"` with identical text in every case, sets no session cookie, keeps the typed username in its field, leaves the PIN field empty, and is followed by `401` from `/api/session`. In a `*.db.test.ts` capturing statements as 020 AC-3 does, the sequence of SQL statement texts (parameters removed) issued by `attemptSignIn` is **identical** for (a) to (e), and `verifyPin` is called exactly once in each of (a) to (e) — against a hash of random bytes made once per process when there is no usable stored hash — so neither the statements nor the bcrypt work reveal whether a username exists. Case (f) calls `verifyPin` zero times, reads no `User` row, and records one `PIN_FAILURE` in its device bucket with a `NULL` `accountKey`.
11. **AC-11** — **The account lock is a pure function with named constants.** In `src/server/auth/account-lock.ts`, unit-tested with no database: `ACCOUNT_LOCK_THRESHOLD === 5`, `ACCOUNT_LOCK_BASE_MINUTES === 15`, `ACCOUNT_LOCK_CAP_HOURS === 24`, and `lockDurationMinutes(k)` for `k` from 1 to 12 returns 15, 30, 60, 120, 240, 480, 960, and then 1,440 for every `k` from 8 on. From a zero state, `applyOutcome` with four `FAILURE`s leaves the account unlocked with `consecutiveFailures` 4; the fifth sets `level` 1, `consecutiveFailures` 0 and `lockedUntil` exactly 15 minutes after it; after each lock ends, five more failures start the next lock at the next duration. `isLocked(state, now)` is `true` one millisecond before `lockedUntil` and `false` at it. `SUCCESS` sets `consecutiveFailures` and `level` to 0 and `lockedUntil` to `null`. `CLEARED` sets `lockedUntil` to `null` and `consecutiveFailures` to 0 and leaves `level` unchanged, so five failures after a clear at level 3 lock for 120 minutes.
12. **AC-12** — **The lock bites at sign-in, reveals nothing, and holds under concurrency.** Against the test database, for (i) an `ACTIVE` profile's username and (ii) a well-formed username nobody holds, each from a known device of its own: five incorrect PINs each return `INCORRECT`; the sixth attempt — for (i) with the **correct** PIN — returns `LOCKED`, calls `verifyPin` zero times, issues no statement that reads `User`, and records no `AuthEvent`. After the test sets that `AccountLock` row's `lockedUntil` to a moment in the past, (i)'s correct PIN signs in, and afterwards the row's `consecutiveFailures` and `level` are both 0. End to end, a locked attempt renders `ACCOUNT_LOCKED_MESSAGE` in `data-testid="sign-in-error"`, and that element is byte-identical for (i) and (ii). A session the profile opened before the lock still gets `200` from `/api/session` while it is locked. From twenty distinct known devices, twenty concurrent incorrect attempts at one username record exactly five `PIN_FAILURE` events carrying its account key, call `verifyPin` exactly five times, and leave it locked; the other fifteen return `LOCKED`.
13. **AC-13** — **The device budget is a pure function with named constants.** `decideAttempt(events, kind, now, budget, windowHours)` in `src/server/auth/attempt-budget.ts` is unit-tested with no database: 9 events of the counted kind in the preceding 24 hours allow the attempt and 10 refuse it; when the oldest of the 10 is exactly 24 hours old the attempt is allowed; a `BUDGET_RESET` event later than all 10 allows it; events earlier than the latest `BUDGET_RESET` are not counted; events of another kind are ignored. The constants are exported and asserted: `PIN_FAILURE_BUDGET === 10`, `PROFILE_REQUEST_BUDGET === 10`, `SETUP_FAILURE_BUDGET === 10`, `BUDGET_WINDOW_HOURS === 24`, `PENDING_PROFILE_CAP === 20`, `DEVICE_TOKEN_MAX_AGE_DAYS === 180`, `EVENT_RETENTION_DAYS === 30`. `bucketFor(kind, device)` returns `"pin:new-devices"` / `"request:new-devices"` for a `null`, expired, malformed or forged device token and `"pin:device:<id>"` / `"request:device:<id>"` for a valid one.
14. **AC-14** — **A spent device budget refuses before anything is read, one device cannot spend another's, and the bookkeeping holds no secret.** Against the test database: after 10 incorrect attempts from new devices, five at each of two usernames, a new-device attempt with a **correct** username and PIN returns `PAUSED`, records no event, calls `verifyPin` zero times, and issues **no** statement that reads `User` or `AccountLock`; in the same state an attempt carrying a valid device token for device A with a correct username and PIN returns `SIGNED_IN`. After 10 incorrect attempts from device A, five at each of two usernames, device A is `PAUSED` while device B and new devices are not. Twenty concurrent incorrect attempts from new devices at twenty different usernames record exactly 10 `PIN_FAILURE` events in `pin:new-devices` and return `PAUSED` for the other ten. A successful sign-in writes no `AuthEvent` and removes none. After a run of attempts, every `AuthEvent` column holds only an id, a kind, one of the documented bucket forms, a 64-hex account key or `NULL`, and a timestamp, and no column of any `AuthEvent` or `AccountLock` row equals or contains any PIN or username the run used. Writing an event deletes every `AuthEvent` older than 30 days and every `AccountLock` row whose lock has ended and which has not been updated for 30 days, and nothing younger.
15. **AC-15** — **Both transports meet the same budget and the same lock.** End to end, in one browser context holding a known-device token: 10 `POST`s to `/api/auth/callback/credentials` with a valid CSRF token and incorrect PINs, five for each of two test usernames, grant nothing, add exactly 10 `PIN_FAILURE` events to that device's bucket, and lock both usernames; the sign-in form in that context then refuses a third profile's **correct** username and PIN with `SIGN_IN_PAUSED_MESSAGE`, sets no session cookie, and `/api/session` returns `401`. In a fresh context holding another known-device token, one incorrect PIN through the form adds exactly **one** event and raises its username's `consecutiveFailures` by exactly one.
16. **AC-16** — **The device token is trust for the budget, not a key to the door.** Every successful sign-in, through either transport, sets a cookie `macroads-device` that is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 180 days, and `Secure` when the origin is `https`; a context that already held a valid one keeps the same device id with a renewed expiry. `verifyDeviceToken` returns `null` — never throws — for an expired token, for a token with any single character changed, and for a token signed under another `AUTH_SECRET`, and returns the device id for a valid token after `PIN_PEPPER` is replaced, unit-tested with no database. A request carrying only a valid device cookie gets `401` from `/api/session` and a redirect from every protected route. Signing out leaves the device cookie in place.
17. **AC-17** — **Sessions follow the row, including its epoch.** A session minted with a JWT carrying no `epoch` claim, signed with the correct `AUTH_SECRET`, is refused: `/stock-entry` redirects to `/sign-in?reason=inactive` and `/api/session` returns `401`. After `resetProfilePin` on a signed-in profile, that profile's **existing** session is refused on its next request in the same way, without the test touching the cookie, and the page renders `SESSION_ENDED_MESSAGE`. The role in the token is never read for a decision: a token whose `role` claim says `ADMIN` for a `YARD_STAFF` row gets `403` from `/api/users`.
18. **AC-18** — **Create profile asks, and cannot grant.** `/sign-in` renders a link `Create profile` to `/sign-in/create`, which returns `200` unauthenticated. A valid submission responds `303` to `/sign-in/requested`, which renders `PROFILE_REQUEST_SENT`, and creates exactly one `User` with `status = PENDING`, `role = YARD_STAFF`, `username = NULL`, `requestedUsername` equal to the typed username trimmed and lower-cased, and a `pinHash` that `verifyPin` accepts for the chosen PIN; that username and PIN cannot sign in (AC-10 (c)). A submission forged to also carry `role=ADMIN`, `status=ACTIVE`, `username=<any value>` and `pinHash=<any value>` creates the same `PENDING` `YARD_STAFF` row. Each invalid input creates no row and re-renders `200` with one message from `src/lib/auth-messages.ts`: a blank name `NAME_REQUIRED_MESSAGE`; a name of 81 characters `NAME_TOO_LONG_MESSAGE`; a name containing a line break, a carriage return, a tab, `<` or `>` `NAME_CHARACTERS_MESSAGE`; a malformed username `USERNAME_FORMAT_MESSAGE`; a malformed PIN `PIN_FORMAT_MESSAGE`; a trivial PIN `PIN_TOO_SIMPLE_MESSAGE`; two different PINs `PIN_MISMATCH_MESSAGE`. After an error the name and username fields keep their values and both PIN fields are empty.
19. **AC-19** — **Create profile reveals nothing about any username or any PIN.** With an `ACTIVE` profile holding username U1 and PIN P, a `DEACTIVATED` profile holding username U2, and a `PENDING` request for U3, four submissions — requesting U1, U2, U3 and a username nobody holds or has requested, each with the PIN P — each respond with the same status, the same `Location`, the same set of `Set-Cookie` names, and a `/sign-in/requested` body that is **byte-identical** across all four; each creates one `PENDING` row. In a `*.db.test.ts`, the sequence of SQL statement texts issued by `requestProfile` is identical for all four, and the only query it issues against `User` before its insert is the count of `PENDING` rows; a source scan of `profile-request-service.ts` finds no `where` that names `username` or `requestedUsername` and no call to `verifyPin`.
20. **AC-20** — **Create profile is bounded, and saying so reveals nothing.** Against the test database: the 11th request within 24 hours from new devices, and the 11th from one known device, each return `PAUSED` and create no row, while a request from a different known device is accepted; with 20 profiles `PENDING`, any request returns `PAUSED` and creates no row, and rejecting one of them lets the next request through. End to end, a paused request renders `PROFILE_REQUESTS_PAUSED` with status `200`, and the rendered body is byte-identical whether the typed username is held by a live profile or by nobody.
21. **AC-21** — **Usernames are settled at approval, where only an ADMIN sees a collision.** `approveProfile(admin, id, role)` on a `PENDING` profile whose requested username no profile holds sets `status = ACTIVE`, `username` to the requested one, `requestedUsername = NULL` and `role` to the chosen role, keeps its `pinHash`, and zeroes the `AccountLock` row of that username if one exists; the requester can then sign in with that username and the PIN they chose. `approveProfile(admin, id, role, username)` gives the profile that username instead, after `parseUsername`. When the username is held by any profile in any status it raises `ConflictError` with exactly `USERNAME_TAKEN_MESSAGE(username)`, and the pending row is unchanged. Two approvals of two requests for one username, run concurrently, yield one `ACTIVE` profile and one `ConflictError`, never a `500` and never a Prisma error text. End to end, the approval form pre-fills the requested username, and approving with an edited one lets the requester sign in with the edited username and their own PIN. `rejectProfile` sets `REJECTED`, sets `requestedUsername`, `pinHash` and `pinKeyId` to `NULL`, and keeps the row. Approving or rejecting a profile that is not `PENDING` raises `ConflictError` and changes nothing.
22. **AC-22** — **`/profiles` is an ADMIN's, refused as a service.** An unauthenticated `GET /profiles` responds `307` to `/sign-in?callbackUrl=%2Fprofiles`. A `YARD_STAFF` session responds `307` to `/stock-entry?denied=profiles`, and the raw response contains no profile's name or username. An `ADMIN` gets `200`, an `<h1>` of exactly `Profiles`, and one row per profile carrying its name, its username (or, for a `PENDING` row, the requested one), role, status label and creation date, `PENDING` first, oldest first. Each of the ten functions of `profile-admin-service.ts` raises `ForbiddenError` with exactly `ADMIN is required for this action` for a `YARD_STAFF` actor and `UnauthorizedError` for `null`, and changes nothing. The implementer removes `"/profiles"` from `PROTECTED_PATHS`, rebuilds, observes that a `YARD_STAFF` `GET /profiles` still responds `307` to `/stock-entry?denied=profiles`, restores the file byte-identically, and records both observations and the restored hash in `progress/impl_pin_auth.md` (003 AC-16). As an `ADMIN`, `/analysis` renders exactly one link to `/profiles`, in its header, carrying no query parameter (011 AC-16's one exception).
23. **AC-23** — **Role changes and deactivation bite on the next request, and the last ADMIN cannot go.** A signed-in `ADMIN` demoted to `YARD_STAFF` by another `ADMIN` gets, on the next request, `307` to `/stock-entry?denied=analysis` from `/analysis` and `"role":"YARD_STAFF"` from `/api/session`, with no `€` in either body; promoted back, `/analysis` returns `200`. A signed-in profile that is deactivated is redirected to `/sign-in?reason=inactive` on its next request and `/api/session` returns `401`; its `pinHash` and `pinKeyId` are `NULL`, its `username` is unchanged, and its username and former PIN then fail exactly as AC-10 (d). Demoting or deactivating the only `ACTIVE` `ADMIN` that holds a username and a PIN — by another profile or by itself — raises `ConflictError` with exactly `LAST_ADMIN_MESSAGE` and changes nothing. With exactly two such `ADMIN`s each demoting the other at the same moment, exactly one demotion succeeds, the other raises `LAST_ADMIN_MESSAGE`, and one `ACTIVE` `ADMIN` remains. Changing the role of a profile that is not `ACTIVE` raises `ConflictError` and changes nothing.
24. **AC-24** — **A reset issues a fresh random PIN, shows it once, and ends every session that used the old one.** `resetProfilePin(admin, id, 4 | 6)` on an `ACTIVE` profile returns a `newPin` of that length that `parsePin` accepts, drawn by `generatePin`; it sets `pinHash` and `pinKeyId` for it under the current `PIN_PEPPER`, increments `sessionEpoch` by one, ends any lock on the profile's username and sets its `consecutiveFailures` to 0 while leaving its `level` unchanged. The old PIN then fails as AC-10 (b) and the new one signs in. End to end, the response to the reset `POST` renders the new PIN in `data-testid="new-pin"` beside `RESET_PIN_SHOWN_ONCE` and the profile's name; a subsequent `GET /profiles` does not contain it; no column of any `User`, `AccountLock` or `AuthEvent` row equals it; and no captured console output contains it. On a profile that is not `ACTIVE` it raises `ConflictError` with exactly `ONLY_ACTIVE_PIN_RESET`.
25. **AC-25** — **An ADMIN can create a profile directly.** `createProfile(admin, { name, username, role, length })` creates an `ACTIVE` profile with that name, the parsed username and the chosen role — `ADMIN` included — and a PIN drawn by `generatePin(length)`, returned once as `newPin` and rendered once in `data-testid="new-pin"` exactly as a reset is (AC-24); that username and PIN then sign in. It zeroes the `AccountLock` row of that username if one exists. A username held by any profile raises `ConflictError` with exactly `USERNAME_TAKEN_MESSAGE(username)`, and an invalid name or username raises `ValidationError` with the matching message; neither creates a row.
26. **AC-26** — **The owner sees every lock and failure, and can clear a lock or lift the pause.** On `/profiles`, each profile's row renders in `data-testid="failures-<id>"` the number of `PIN_FAILURE` events carrying its username's account key in the last 30 days; while it is locked, `data-testid="lock-<id>"` renders `ACCOUNT_LOCKED_LABEL` with the lock's end time and a control labelled `CLEAR_LOCK_LABEL`, and neither renders while it is not. Pressing that control (`clearAccountLock`) lets the profile's correct PIN sign in at once, leaves its `level` unchanged, and writes no `AuthEvent`. In a `*.db.test.ts`, with 3 `PIN_FAILURE` events from new devices and 1 from a known device in the last 24 hours, 2 of them naming no profile's username, `pinFailureSummary` returns exactly `{ newDevices: 3, knownDevices: 1, unknownUsernames: 2, newDevicesPaused: false }`; with 10 from new devices it returns `newDevicesPaused: true`, and `resumeNewDeviceSignIn` then records one `BUDGET_RESET` event in `pin:new-devices`, deletes no event, makes `newDevicesPaused` `false`, and lets a new-device attempt be evaluated again. End to end, after one incorrect PIN from the spec's own known device, `data-testid="pin-failures"` renders exactly `PIN_FAILURES_SUMMARY(a, b, c)` for three integers with `b` at least 1, and while new devices are not paused neither `NEW_DEVICES_PAUSED_MESSAGE` nor a control labelled `RESUME_NEW_DEVICES_LABEL` is rendered. Because no e2e spec may spend the development database's new-device budget (AC-40), the implementer observes the paused rendering once by hand — writing ten new-device failure events directly into the development database with no e2e run active, pressing the control, and deleting the events — and records what the page showed and the event counts before and after in `progress/impl_pin_auth.md`.
27. **AC-27** — **`/setup` exists only while the data says so.** `setupAvailable()` returns `true` exactly when `PIN_PEPPER` is usable, `SETUP_CODE` is set to at least `SETUP_CODE_MIN_LENGTH` characters, and **no `User` row has `role = ADMIN`, in any status**. Against the test database it returns `false` with a single `DEACTIVATED` `ADMIN` row; `false` with a single `ACTIVE` `ADMIN` that has no username and no PIN (a row migrated from 003); `true` with only `YARD_STAFF` rows **and a `SetupClaim` row referencing one of them** — so availability reads the profiles, not the claim; and `false` with `SETUP_CODE` unset or 15 characters long. While it is `false`, `GET /setup` responds `404` with a body containing no field named `setupCode`, and `completeSetup` returns `UNAVAILABLE` without comparing the code and writes nothing. End to end on the development database, after the spec creates an `ADMIN` test profile, `GET /setup` responds `404` and its body contains no field named `setupCode`. `/setup` is not in `PROTECTED_PATHS`, and no `href` naming `/setup` appears under `src/`.
28. **AC-28** — **Setup creates the first ADMIN once, and guards its code.** Against the test database with no `ADMIN` row and a `SETUP_CODE` generated at runtime: `completeSetup` with the correct code, a name, a username and a PIN entered twice creates exactly one `User` — `ACTIVE`, `ADMIN`, the parsed username, that name, a `pinHash` that `verifyPin` accepts — and one `SetupClaim` with `id = 1` referencing it, and returns `CREATED`; `attemptSignIn` with that username and PIN then returns `SIGNED_IN` with role `ADMIN`, and `setupAvailable()` is `false`. End to end the success is a `303` to `/sign-in?setup=done`, which renders `SETUP_COMPLETE_MESSAGE`, and setup sets no session cookie. A wrong code returns `CODE_INCORRECT`, writes one `SETUP_FAILURE` event in bucket `setup` and no `User`; after 10 wrong codes within 24 hours, the correct code returns `PAUSED` with `setupCodeMatches` called zero times and no event written. Invalid fields after a correct code raise `ValidationError` with the field's message and write no row and no event. The state the setup action returns to its form after any outcome contains no key named `code` or `setupCode`. `setupCodeMatches` is unit-tested with no database: `true` only for the exact code, and `false` for the empty string, the code with its last character removed, the code with one character appended, and the code with one letter's case changed, never throwing for any length; its source hashes both sides with SHA-256 and compares the results with `timingSafeEqual`.
29. **AC-29** — **Two simultaneous setups cannot both succeed.** Against the test database with no `ADMIN` row, two `completeSetup` calls with the correct code and different usernames, started together, yield exactly one `CREATED` and one `UNAVAILABLE` — never a thrown error, never a Prisma error text — and leave exactly one `ADMIN` row and exactly one `SetupClaim` row; repeated 20 times from a freshly reset database, every repetition ends the same way. A third call afterwards returns `UNAVAILABLE` without comparing the code.
30. **AC-30** — **The reset script replaces `admin:create`, repairs only existing profiles, and holds to 003 AC-6 and AC-7.** `scripts/admin-create.ts` and the `admin:create` entry in `package.json` no longer exist; `npm run pin:reset` runs `scripts/pin-reset.ts`, which accepts exactly two forms. With `-- --list` it prints one line per profile carrying exactly its id, username (or `-`), name, role, status, PIN state (`set`, `none` or `reset needed`) and lock state. With `-- --profile <id>` and `NEW_PIN` — plus `NEW_USERNAME` when, and only when, that profile has no username — it sets that `ACTIVE` profile's PIN under the current `PIN_PEPPER` (and its username), ends any lock on its username and zeroes its `consecutiveFailures`, increments `sessionEpoch`, exits `0`, and prints the profile's id, username, name and role. It exits non-zero and changes no row: with `NEW_PIN` unset or empty and stdin not a terminal, with a message naming `NEW_PIN` — there is no prompt, no default and no generated fallback; with a malformed or trivial `NEW_PIN`, with the matching PIN message; with `NEW_USERNAME` missing for a profile that has none, given for a profile that has one, malformed, or taken, with a message naming `NEW_USERNAME` or equal to `USERNAME_TAKEN_MESSAGE(username)`; for a profile that is not `ACTIVE`, with `ONLY_ACTIVE_PIN_RESET`; for an unknown id, with a message naming it; with `PIN_PEPPER` unset, with a message naming `PIN_PEPPER`; and with any other flag, `--create-admin` included, because the script creates no profile. Across every one of these runs, captured stdout and stderr never contain the `NEW_PIN` value, any `pinHash`, any `pinKeyId` or any account key. The script reads `NEW_PIN` and `NEW_USERNAME` from the environment it was started with, **before** any module that reaches `@prisma/client` is evaluated, because that client fills a missing variable from `.env`, and a `NEW_PIN` found there would be a default. A source check in `npm run test:unit` proves the order: the script has no static import of a module under `src/server/` other than `import type`, and both reads come before its first dynamic `import(` of one. Moving a read after that import turns the check red.
31. **AC-31** — **There is no second way in.** A source scan — raw source, comments included — finds `src/server/auth/operator-service.ts` imported by no file under `src/app/**`, `src/components/**` or `src/middleware.ts`, only by `scripts/pin-reset.ts`, by tests and by `tests/e2e/support/users.ts`; and `src/server/auth/setup-service.ts` imported only by files under `src/app/setup/` and by tests. The only Auth.js provider is the credentials provider, whose `authorize` calls `attemptSignIn` and no other service. `toSessionUser` is called from `sign-in-service.ts` and `user-service.ts` only. There is exactly one `signIn(` call site under `src/`, in `src/app/auth-actions.ts`, passing only the entered username, the entered PIN and the redirect target; no file under `src/app/setup/` or `src/app/profiles/` calls `signIn(` or sets a session cookie.
32. **AC-32** — **Without its secrets the product fails closed; with a replaced pepper it locks nobody out.** With `PIN_PEPPER` unset, `attemptSignIn` returns `UNAVAILABLE` and records nothing, `requestProfile` returns `UNAVAILABLE` and creates nothing, and `setupAvailable()` is `false`, asserted in a `*.db.test.ts`; the page maps `UNAVAILABLE` to `SIGN_IN_UNAVAILABLE_MESSAGE`, asserted with no database, and the rendered HTML contains no stack frame and no Prisma text. With `PIN_PEPPER` replaced by another generated value, for a profile whose PIN was set under the old one: its correct PIN returns `INCORRECT` however many times it is tried, no `AccountLock` row gains a failure or a lock, and no `AuthEvent` is written; each attempt writes one log line beginning `auth.pin_key_mismatch` that contains no username; `listProfiles` reports the profile with `credentialNeedsReset: true` and `/profiles` renders `CREDENTIAL_NEEDS_RESET_LABEL` in its row; and after `resetProfilePin` it signs in with the new PIN. With `AUTH_SECRET` unset, `GET /api/users` carrying any cookie never returns `200` and its body has no `users` key (003 AC-22, unchanged).
33. **AC-33** — **No PIN, digest, hash, key or setup code is ever logged, returned or rendered after the fact.** A test spies on `console.log`, `console.info`, `console.warn` and `console.error` and drives, with 6-digit PINs and a setup code generated at runtime, one setup with a wrong code and one with the right code, one successful sign-in, one incorrect PIN, one locked attempt, one paused attempt, one profile request, one approval, one direct creation and one reset; it asserts that no PIN, `pinDigest`, `pinHash`, account key or setup code, and no username typed at sign-in, appears in the captured output, and that the incorrect PIN logged exactly one line beginning `auth.pin_failed` naming its bucket kind. `/api/users` fetched as an `ADMIN` returns exactly `{ users: [{ id, username, name, role, status }] }`, one entry per profile; the deep-key scan of `/api/session` and of `/api/users` listing at least two profiles finds no key matching `/pin|hash|password|lookup|code/i`, and neither raw response contains any stored `pinHash` value (003 AC-15 and AC-20, amended).
34. **AC-34** — **The money boundary does not move.** Signed in as `YARD_STAFF`, `assertNoMoneyKeys` passes over `/api/session` at `200` and `/api/users` at `403`. A sign-in form `POST` carrying the body field `role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` alongside a `YARD_STAFF` username and PIN produces a session whose `/api/session` role is `YARD_STAFF` and whose `/analysis` request responds `307` to `/stock-entry?denied=analysis` (003 AC-18 through the new transport). The HTML of `/sign-in`, `/sign-in/create`, `/sign-in/requested`, `/profiles` and the `/setup` response contains no `€`, and `deepKeys` of every value `profile-admin-service.ts` and `setup-service.ts` return contains no key matching `/price|value|total|amount/i`.
35. **AC-35** — **Sign-in works in a glove, and without JavaScript.** At 390 × 844 and again at 320 × 640, on `/sign-in`, `/sign-in/create`, `/sign-in/requested` and, as an `ADMIN`, `/profiles`, `document.documentElement.scrollWidth` does not exceed its `clientWidth`. On `/sign-in` with JavaScript the keypad renders exactly ten digit keys `data-testid="pin-key-0"` … `pin-key-9`, a `pin-key-delete` and the submit `sign-in-submit` labelled `Sign in`, in three columns, and each of the twelve has a bounding box of at least **44 × 44** CSS px at both widths; tapping a sequence of digit keys generated at runtime makes the masked field's value equal that sequence, and `pin-key-delete` removes the last digit. The PIN field has `type="password"`, `inputmode="numeric"` and `autocomplete="off"`; the username field is at least 44 px tall and has `autocomplete="off"`, `autocapitalize="none"` and `spellcheck="false"`. Every control on `/sign-in/create` and every action control on `/profiles` is at least 44 px tall. In a `javaScriptEnabled: false` context `/sign-in` renders no `pin-key-*` element, and typing a valid username and PIN into the fields and submitting signs in.
36. **AC-36** — **A half-typed PIN is forgotten, never stored.** After tapping three digits on `/sign-in`: dispatching `visibilitychange` with `document.visibilityState` reporting `hidden` empties the PIN field; a `pageshow` event with `persisted: true` empties it; reloading the page shows it empty; and at no point does any `localStorage` or `sessionStorage` value, any cookie value or the page URL contain the typed digits. The same holds for both PIN fields of `/sign-in/create`. After a failed attempt the PIN field is empty and the username field still holds what was typed.
37. **AC-37** — **One identity header, showing the display name, that wraps at any character.** `/stock-entry`, `/stock-takes`, `/analysis` and `/profiles` each render the header through `src/components/IdentityHeader.tsx`, which shows the profile's `name` in `data-testid="signed-in-name"` and the `data-testid="sign-out"` control, and does not render the username. `signed-in-email` occurs nowhere under `src/` or `tests/` (the scan's own source excepted), in code and in comments alike — a comment that must refer to the retired test id describes it without spelling it. Signed in as a profile whose name is a single unbroken run of 80 characters, at 390 px and at 320 px, none of those four pages scrolls sideways, and the header's bounding box lies within the viewport — which closes the debt against 008 AC-30 recorded in 010's fifth and sixth amendments. `/stock-entry/new` renders only the name inside `data-testid="counting-as"`. The shipped criteria that quoted the email are amended in their own spec files to say "name" and `signed-in-name`, and their tests follow: 007 AC-2 and AC-5, 010 AC-1 and AC-19, 011 AC-1 and AC-20. `/stock-takes`'s `data-testid="stock-takes-body"` remains byte-identical between the two roles (010 AC-13), and `src/app/stock-takes/**` still contains no role literal.
38. **AC-38** — **Audit lines name a username, and old lines still read.** `AuditEntry.actorEmail` is renamed `actorRef`, and `auditLine` / `parseAuditLines` keep #9's exact grammar: a unit test with no database builds a line from a runtime-generated username and parses it back equal, and a `notes` value holding one line with an email address in the brackets followed by one with a username parses to two entries with those references verbatim. Approving a count writes a line whose bracketed reference equals the approving profile's `username`. 009 AC-20's pure test changes only the field name in its call; its expected line is byte-identical.
39. **AC-39** — **The messages live in one module that imports nothing.** `src/lib/auth-messages.ts` imports nothing and exports `INCORRECT_SIGN_IN_MESSAGE`, `ACCOUNT_LOCKED_MESSAGE`, `SIGN_IN_PAUSED_MESSAGE`, `SIGN_IN_UNAVAILABLE_MESSAGE`, `SESSION_ENDED_MESSAGE`, `PIN_FORMAT_MESSAGE`, `PIN_TOO_SIMPLE_MESSAGE`, `PIN_MISMATCH_MESSAGE`, `USERNAME_FORMAT_MESSAGE`, `USERNAME_TAKEN_MESSAGE`, `NAME_REQUIRED_MESSAGE`, `NAME_TOO_LONG_MESSAGE`, `NAME_CHARACTERS_MESSAGE`, `PROFILE_REQUEST_SENT`, `PROFILE_REQUESTS_PAUSED`, `SETUP_CODE_INCORRECT_MESSAGE`, `SETUP_PAUSED_MESSAGE`, `SETUP_COMPLETE_MESSAGE`, `LAST_ADMIN_MESSAGE`, `ONLY_ACTIVE_PIN_RESET`, `RESET_PIN_SHOWN_ONCE`, `NO_PENDING_PROFILES`, `NEW_DEVICES_PAUSED_MESSAGE`, `RESUME_NEW_DEVICES_LABEL`, `PIN_FAILURES_SUMMARY`, `ACCOUNT_LOCKED_LABEL`, `CLEAR_LOCK_LABEL`, `CREDENTIAL_NEEDS_RESET_LABEL`, `PROFILE_STATUS_LABELS` (one label for each of the four statuses), `USERNAME_MIN_LENGTH` (`3`), `USERNAME_MAX_LENGTH` (`32`), `MAX_NAME_LENGTH` (`80`) and `ACCESS_DENIED_MESSAGE` (unchanged); it no longer exports `INVALID_CREDENTIALS_MESSAGE` or `INACTIVE_ACCOUNT_MESSAGE`. `USERNAME_TAKEN_MESSAGE(username)` contains the username; `PIN_FAILURES_SUMMARY(a, b, c)` contains the three numbers; `NAME_TOO_LONG_MESSAGE` contains `MAX_NAME_LENGTH`; `USERNAME_FORMAT_MESSAGE` contains `USERNAME_MIN_LENGTH` and `USERNAME_MAX_LENGTH`. No file under `tests/` and no `*.test.ts` under `src/` contains, as a string literal, the text of any of these exports that is 20 or more characters long: tests import them.
40. **AC-40** — **The e2e sign-in is changed once, centrally, and every other spec changes only mechanically.** `tests/e2e/support/users.ts` exports `TestUser = { id, username, name, pin, role }`; `createTestUser(role, label)` creates an `ACTIVE` profile through `createActiveProfile` with the username `e2e-` plus 20 random letters, the name `<label>-` plus 16 random letters (each letter drawn from `a`–`p`, one per hex digit, so no entropy is lost and no digit appears), and a runtime-generated non-trivial 6-digit PIN; `signIn(page, user, from)` adds a freshly minted known-device cookie to the context, enters the username and the PIN, and waits for `signed-in-name` to equal `user.name`; `enterCredentials(page, user)` enters both without asserting a landing; `removeUser(username)`, `deactivate(username)` and `storedPinHash(username)` replace their email-keyed forms. Because `TestUser` no longer has an `email`, the compiler forces the other specs to change, and the change is limited to five substitutions: (1) `.email` → `.username` wherever a test user is registered for cleanup, removed, deactivated, looked up for its stored hash (`storedPasswordHash` → `storedPinHash`) or named as an audit actor (`actorEmail: x.email` → `actorRef: x.username`), with a local variable holding one of these renamed to match; (2) in an assertion on `signed-in-email` or `counting-as`, `signed-in-email` → `signed-in-name` and `.email` → `.name`; (3) a direct fill of the `Email` and `Password` fields and its submit click → `await enterCredentials(page, user)`; (4) inside an `expect(` on a screen's text, a string literal whose text is exactly the value of a constant AC-39 requires to be single-sourced → an import of that constant. The known sites are `ACCESS_DENIED_MESSAGE`'s text at `analysis-access.spec.ts:225`, `item-master-access.spec.ts:150`, `role-access.spec.ts:57`, `stock-entry-access.spec.ts:159` and `stock-entry-submit.spec.ts:168`; (5) inside an `expect(` statement, including an argument of a message builder inside one, the old fixture name `E2E Yard Staff` or `E2E Administrator` within a string literal → an interpolation of the `name` of the test user that literal denoted, the rest of the literal unchanged and a negative assertion kept negative. The known sites are `stock-entry-approve.spec.ts:260, 263, 297, 301, 394`, `stock-entry-start.spec.ts:99, 209, 327, 336, 382` and `stock-entry-submit.spec.ts:344`, and the evidence names, for each, the user it now reads. `actorFor` in `tests/e2e/support/stock-entry.ts` builds `{ id, username, name, role }`. Verified at review with `git diff <this feature's base commit>..HEAD -- tests/e2e`: outside `support/users.ts`, `support/stock-entry.ts`, `sign-in.spec.ts`, `role-access.spec.ts` and the phone test in `route-protection.spec.ts`, no `test(` title and no `expect(` line is added, removed or altered except by those substitutions, and the base commit and the command's output are recorded in `progress/impl_pin_auth.md`. The rule governs the specs that exist at the base commit; the new `tests/e2e/pin-*.spec.ts` files this spec's browser criteria require are listed separately in that evidence. One more change to a shipped spec is licensed by a later ruling and is listed separately too: 011 AC-16's test in `analysis-figures.spec.ts`, amended as C2-1 records. `sign-in.spec.ts` is rewritten to prove AC-9, AC-10, AC-12, AC-15, AC-17 and AC-36 in place of 003 AC-9 to AC-11; `role-access.spec.ts` keeps every test and changes only the stored-hash helper and the `/api/users` field names; the 390 px email-and-password test in `route-protection.spec.ts` is replaced by AC-35. No e2e spec causes a `PIN_FAILURE` in `pin:new-devices` or a request in `request:new-devices`: every deliberate failure and every profile request is made from a freshly minted known device, and `sign-in.spec.ts` asserts that no `pin:new-devices` event was created during its run. With `PIN_PEPPER` absent from the environment, every spec that creates a profile skips with an annotation containing `PIN_PEPPER is not set`.
41. **AC-41** — **The environment and the operations document say how to do it, and nothing assigns a secret.** `docs/operations.md` → *Environment* documents `PIN_PEPPER` and `SETUP_CODE`, each with a placeholder value and the generation command it gives for `AUTH_SECRET`, and `.env` defines both, with `SETUP_CODE` at least 16 characters (asserted by name and length, printing no value); the document states that `PIN_PEPPER` must differ per environment, must be backed up outside the server like `AUTH_SECRET`, and that changing or losing it invalidates every PIN; and that `SETUP_CODE` must be at least 16 characters and is used only until the first `ADMIN` exists. `docs/operations.md` replaces its *Creating the first administrator* section with: first-run setup at `/setup` on a database with no `ADMIN`; the one-time step for a database migrated from 003 (`pin:reset -- --list`, then `-- --profile <id>` with `NEW_USERNAME=<choose-a-username>` and `NEW_PIN=<choose-a-pin>`); lockout recovery; and recovery from a lost `PIN_PEPPER` as S4 lists it — with placeholders only, including `SETUP_CODE=<choose-a-setup-code>`, and never a value. `tests/unit/no-default-password.test.ts` is amended to detect assignments to `NEW_PIN`, `PIN_PEPPER` and `SETUP_CODE` and to require the `<choose-a-pin>` placeholder in `docs/operations.md`, and passes. For those three names **a quoted literal is an offence whatever its shape**, except the placeholders `REPLACE_WITH_A_GENERATED_SECRET` and `<choose-a-…>`. Only an **unquoted** identifier or call is read as code. #3's own names keep #3's rule. A non-vacuity test proves that a letters-first value built at runtime, in quotes, is caught under each of the three; the repository's credential scan in `npm run test:unit` passes.
42. **AC-42** — **Which checks survive with no database,** mirroring 003 AC-23 and 010 AC-20. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve, `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection, or reads `PIN_PEPPER`, `SETUP_CODE` or `AUTH_SECRET`, at import time.
43. **AC-43** — **The gate is green in full, and the e2e suite is stable at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx prisma migrate status`, `npm run test:db` and `npm run test:e2e` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. The derived `force-dynamic` census (010 AC-20) finds `src/app/sign-in/create/page.tsx`, `src/app/sign-in/requested/page.tsx`, `src/app/setup/page.tsx` and `src/app/profiles/page.tsx` and passes with the number it **derives** from the tree; the derived `loading.tsx` assertion (010 AC-2) finds no `loading.tsx` at or above any of them. The shipped tests whose subject this feature removes — `src/server/auth/admin-create.db.test.ts`, the email-and-password tests of `password.test.ts`, `user-service.db.test.ts` and `credentials-logging.db.test.ts` — are replaced by the tests of the criteria that supersede them in the table below; every other shipped `*.db.test.ts` and unit test that built a `SessionUser` or a `User` row with an email or a password hash changes only in how it builds that fixture — no assertion is added, removed or weakened — verified at review with the same `git diff` range as AC-40. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`; if the suite is not stable at `retries: 0`, the implementer reports that rather than restoring retries or raising a timeout. `git status --porcelain -- Samples` is empty.
44. **AC-44** — **Phase 0: one helper decides whose work a git assertion is about, and it is proven on a throwaway repository.** `tests/support/feature-scope.ts` exports `isAttributedTo(subject, id)`, `featureStatus(id)`, `commitsOf(id)`, `filesTouchedBy(id, paths)`, `changedLinesBy(id, paths)` and `workingTreeChanges(paths)`. Every export except the first takes an optional last argument `{ cwd }`, which defaults to the process's working directory. With id 8, `isAttributedTo` is `true` for the subjects `feat(#8): x`, `fix(#8): x`, `spec(#8): x` and `refactor(#8): x`. It is `false` for `feat(#80): x`, `feat(#18): x`, `feat(#08): x`, `feat(#8) x`, `feat(#8):x`, `Feat(#8): x`, `fix(app): x`, `harness(repo): x`, `spec: x` and `Revert "feat(#8): x"`. With id 1, `feat(#10): x` is `false`. `tests/unit/feature-scope.test.ts` builds a temporary git repository with its own local identity and configuration, its own `feature_list.json` and its own commits, and removes it afterwards. For a protected directory P and two features X and Y, it asserts the following there. (a) With X `in_progress`, each of these under P appears in `filesTouchedBy(X, [P])`: a modified tracked file, a change that is only staged, a deleted file and an untracked file. A git-ignored file under P does not appear. (b) With X `done` and Y `in_progress`, the same changes give `[]`. (c) With X `done` and a clean tree, a commit under P whose subject is `fix(#X): …` or `spec(#X): …` puts its files in `filesTouchedBy(X, [P])`. A commit whose subject is `feat(#Y): …` or `fix(app): …` does not, and neither does one whose only `fix(#X): ` is on a body line. (d) With X `in_progress`, a clean tree and one X commit under P, that commit's files appear. (e) `changedLinesBy(X, [P])` returns exactly the `+` and `-` lines of each X commit's own patch at zero context, in commit order, with file headers excluded. While X is `in_progress`, the working tree's lines follow them. (f) `workingTreeChanges([P])` lists a changed file under P whatever any feature's status is, and returns `[]` on a clean tree. (g) A file in a directory named `[id]` under P is found by that literal path. (h) Instead of returning a list, `filesTouchedBy` and `changedLinesBy` throw, with a message containing the id, in three cases: the id is absent from `feature_list.json`; `feature_list.json` is missing or is not JSON; or the feature is not `in_progress` and `commitsOf` finds no commit attributed to it. `commitsOf`, `filesTouchedBy` and `changedLinesBy` also throw in a shallow clone, and every function that runs `git` throws when `cwd` is not inside a git repository. Across every call, the temporary repository's `.git/index` bytes and `git for-each-ref` output are unchanged. The test needs no database and runs in `npm run test:unit`.
45. **AC-45** — **Phase 0: every shipped git assertion about one feature's work names that feature, and the one about `Samples/` stays strict.** In the five test files of *Phase 0*'s table, rows 1 to 10 and 12 to 14 each replace their `git status` call with `expect(filesTouchedBy(<the row's owner>, <the row's paths, unchanged>)).toEqual([])`. The one exception is that `Samples` leaves row 1's list, and the same test asserts `expect(workingTreeChanges(["Samples"])).toEqual([])`. Row 15 asserts that `filesTouchedBy(10, <its nine paths, unchanged>)` equals exactly `["src/components/stock-entry/CalendarGrid.tsx"]`. Row 16 asserts that `changedLinesBy(10, ["playwright.config.ts"])` has length 4 and that every line matches the pattern it matches today. Row 11 is byte-identical. No test title changes, and no test is added to or removed from those five files. Every other expectation in the sixteen tests is unchanged: row 2's dependency check, row 6's `/api` check, row 7's provider check, row 8's existence and `data-testid` checks, row 10's `migration_lock.toml` check and row 16's seven configuration checks. This is verified at review with `git show <the Phase 0 commit> -- tests/unit`. With `#21` `in_progress`, all sixteen pass before any other #21 change is made, and again at #21's close. `tests/unit/feature-scope.test.ts` scans every tracked and untracked file under `tests/` and every `*.test.ts` under `src/`. With comments removed, no file passes an argument beginning `--porcelain` to `git` except `tests/support/feature-scope.ts` and `tests/unit/stock-entry-contract.test.ts`, which does so exactly once, inside row 11's test. In raw source, comments included, none of the scanned files contains `..HEAD` or the phrase `stays true forever`, and neither does `docs/conventions.md`. The scanning test builds both banned strings from parts, so its own source spells neither, and it is not excepted from its own scan.
46. **AC-46** — **Phase 0: each converted assertion is watched going red for its owner and staying green for every other feature.** The implementer works in a `git worktree` holding a detached checkout of Phase 0 (either its commit, or a scratch commit of its uncommitted change on top of `HEAD`), never in the main checkout and never on `main`. There, one line that changes no meaning is added to each of `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `src/server/test-db.ts`, `src/middleware.ts`, `src/app/api/error-response.ts`, `src/app/(public)/loading.tsx`, `src/server/counts/count-service.ts`, `src/app/stock-entry/page.tsx`, `playwright.config.ts` and `package.json`. The line is a comment in the file's own syntax, or a second trailing newline for `package.json`. The five test files of *Phase 0*'s table are then run with `npx vitest run` in twelve configurations, with statuses changed only in the worktree's `feature_list.json`. **R0:** the probe lines are uncommitted and every status is as in the main checkout (`#21` `in_progress`); every converted row passes. **R1 to R5:** the probe lines are uncommitted, exactly one of `#4`, `#7`, `#8`, `#10` and `#11` is `in_progress`, and `#21` is `pending`; the converted rows that fail are exactly that feature's rows. **R6 to R10:** every status is as in the main checkout, and the probe lines are committed with the subject `fix(#<n>): phase 0 probe` for each of those five features in turn, with the worktree reset to its starting commit between runs and its tree clean; the converted rows that fail are exactly that feature's rows. **R11:** the probe lines are committed as `feat(#21): phase 0 probe`; every converted row passes. For each run, `progress/impl_pin_auth.md` records the statuses changed, the commit subject if any, the command and the title of every failing test in the five files. It also records a table of the fifteen converted rows against the twelve runs, in which every cell matches what this criterion implies. Row 11 is not probed: nothing under `Samples/` is modified in any checkout, and row 11's strictness rests on AC-44 (f). Before the worktree is created and after it is removed, the main checkout's `git rev-parse HEAD`, `git for-each-ref` and `git status --porcelain` outputs are recorded and are identical, and `git worktree list` then names only the main checkout.
47. **AC-47** — **Phase 0 lands first and alone, and the conventions say what the tests now depend on.** In `docs/conventions.md` → *Tests*, the bullet that began "An assertion whose subject is the working tree expires at the commit" is replaced. The new bullet names `tests/support/feature-scope.ts` and three kinds of git assertion: a path no feature may change (`workingTreeChanges` empty, checked in every session), a path feature N did not touch (`filesTouchedBy(N, …)` empty) and what feature N changed (an equality on `filesTouchedBy` or `changedLinesBy`). It also says why neither the working tree nor a commit range ending at the branch tip may carry a claim about one feature's work. *Commits* lists `spec` among the types. It states that every commit made for a feature is scoped `(#<id>)`: `spec(#N)`, `feat(#N)`, `fix(#N)`, and the same scope for any other type. It states that a commit made for no feature takes a word scope and belongs to no feature. It names the helper as reading the subject line alone, and it states what a missing scope and a wrong number each do. Phase 0 is one commit whose subject begins `test(#21): `. In `git log` it comes before every other `(#21)` commit except `spec(#21)` ones. `git show --name-only --format= <it>` lists exactly `tests/support/feature-scope.ts`, `tests/unit/feature-scope.test.ts`, `tests/unit/analysis-contract.test.ts`, `tests/unit/count-entry-contract.test.ts`, `tests/unit/schema-and-migration.test.ts`, `tests/unit/stock-entry-contract.test.ts`, `tests/unit/stock-takes-contract.test.ts`, `docs/conventions.md` and files under `progress/`. `progress/impl_pin_auth.md` records one `init` run made with `#21` `in_progress` while the working tree differs from `HEAD` only by that change. The run ends with `[OK] Environment ready` having executed the database checks.

## There is no criterion about criteria here, deliberately

#9's ruling, restated by #10 and #11: **a criterion whose subject is other criteria has no
mechanical check and no owner.** AC-39 lists the exports of one module and makes claims about test
files; it does not refer to "the messages these criteria name". Which criteria are provable
without a database is stated in the paragraph above the list, not as a criterion. Every shipped
assertion or criterion this feature supersedes or amends is named **inside the criterion that
forces it**; the tables below are a reader's index to those, not a claim to be tested.

### 003's criteria

| 003 | Disposition | Forced by | Why |
|---|---|---|---|
| AC-1 | unaffected (already replaced by 004 AC-1) | — | |
| AC-2 | **superseded** | AC-1, AC-2 | `User` loses `email`, `passwordHash`, `active` |
| AC-3 | **superseded** | AC-5 | `hashPassword` / `verifyPassword` become `hashPin` / `verifyPin`: still bcrypt at cost 10 or above, now over a keyed digest (S3) |
| AC-4 | **amended** | AC-33 | No PIN, digest, hash, key, setup code or typed username logged; there is no email to log |
| AC-5 | **amended** | AC-6 | Still one file imports `bcryptjs`; the detector adds `createHmac` and `timingSafeEqual` |
| AC-6 | **superseded** | AC-30 | `admin:create` replaced by `pin:reset`; still prints no secret and no hash |
| AC-7 | **amended** | AC-8, AC-30, AC-41 | No default PIN; `NEW_PIN` replaces `ADMIN_PASSWORD`; no setup code written down |
| AC-8 | **superseded** | AC-7, AC-18, AC-25 | `createUser` replaced by `requestProfile`, approval and `createProfile`; usernames replace emails as the unique, case-insensitive identifier |
| AC-9 | **superseded** | AC-9 | Username and PIN, not email and password; `/api/session` has `username` and `name`, not `email` |
| AC-10 | **superseded** | AC-10 | Six failure kinds, one message, one statement sequence, one bcrypt |
| AC-11 | **amended** | AC-17, AC-23 | Same next-request rule; `status` not `active`; the sentence becomes `SESSION_ENDED_MESSAGE` because a reset also ends sessions |
| AC-12 – AC-14 | kept, re-proved through the new sign-in | AC-9 | |
| AC-15 | **amended** | AC-33 | `/api/users` lists `{ id, username, name, role, status }` |
| AC-16 | kept, extended to `/profiles` | AC-22 | |
| AC-17, AC-19, AC-21 | kept | AC-34 | |
| AC-18 | kept, re-proved through the new form | AC-34 | |
| AC-20 | **amended** | AC-33 | No `pin`, `hash` or `code` key or stored hash in any response |
| AC-22 | kept, extended to `PIN_PEPPER` | AC-32 | |
| AC-23 – AC-29 | kept | AC-42, AC-43 | |
| AC-30 | **amended** | AC-41 | `docs/operations.md` documents `PIN_PEPPER` and `SETUP_CODE`, and `.env` defines them (`.env.example` retired, see *Post-approval amendments*); test PINs and codes generated at runtime |
| AC-31 | kept | — | `src/middleware.ts` still imports nothing from `@prisma/client` |
| AC-32 | **superseded** | AC-35 | The sign-in page, at 390 **and** 320 px |

### Other shipped criteria and assertions

| Shipped | Forced by | Change |
|---|---|---|
| 004 AC-1, AC-4 — `schema-and-migration.test.ts`, `project-contract.test.ts` | AC-1 | Twelve models, five enums, the new `User` field list |
| 007 AC-2, AC-5; 010 AC-1, AC-19; 011 AC-1, AC-20 | AC-37 | The header's email test id → `signed-in-name`; email → display name |
| 008 AC-30 — the recorded `/stock-entry` header debt | AC-37 | Closed |
| 009 AC-20 — `count-audit.test.ts` | AC-38 | `actorEmail` → `actorRef` in the call only |
| 020 AC-2 — `test-db.test.ts` | AC-4 | Eight tables → eleven |
| 008 AC-29, 010 AC-22 — "no table was added" | AC-4 | Re-spelled as their own fixed commit range |
| `hashing-boundary.test.ts`, `no-default-password.test.ts` | AC-6, AC-41 | Detect `createHmac` / `timingSafeEqual`; name `hashPin` / `verifyPin` and `pin-reset.ts`; detect `NEW_PIN`, `PIN_PEPPER`, `SETUP_CODE` |
| Every e2e spec importing `support/users.ts` (19 specs) | AC-40 | AC-40's five mechanical substitutions, nothing else |
| 004 AC-1, AC-5, AC-19, database halves (`columns.db.test.ts`, `referential.db.test.ts`) | AC-1 | Twelve tables; `User`'s eleven columns; twelve foreign keys, `SetupClaim.userId` `RESTRICT` |
| 004 AC-24: "both migrations are applied, in order" (`columns.db.test.ts`) | AC-2 | Re-spelled as #4's own claim, like 004 AC-23: the first two rows in order, every row finished, no count |
| 020 AC-6: "nine ids, every one `@default(cuid())`" (`test-db.test.ts`) | AC-1 | Twelve ids: ten cuids and the two application-supplied ids AC-1 declares; still no `autoincrement`; the `pg_class` half unchanged |
| Every `*.db.test.ts` / unit test building a `SessionUser` or `User` | AC-43 | Fixture construction only |
| 004 AC-23: "migration_lock.toml … is unmodified" (`schema-and-migration.test.ts`, *Phase 0* row 7) | AC-45 | Now checked against #4's own commits instead of the working tree. #21 does not edit the file; the assertion is converted because its claim is about #4's work |
| 004 AC-23: "prisma/migrations holds exactly two directories, in order" (`schema-and-migration.test.ts:341`) | AC-2 | Re-spelled as #4's own claim (one directory, `create_stock_domain`), keeping the order of the first two. Forced by AC-2's migration. Never re-amended by later migrations |
| 007 AC-3: "the PUBLIC segment's loading.tsx is unchanged" (`stock-entry-contract.test.ts`, row 8) | AC-45 | Now checked against #7's own commits. The file is #7's to protect, not a global invariant (see *Phase 0*); its existence and `data-testid` checks stay |
| 007 AC-1: `auth-config.ts` and `middleware.ts`; 007 AC-32: `prisma/` (rows 9, 10) | AC-45 | Now checked against #7's own commits. #21 edits all three for the `/profiles` route (AC-1, AC-2) |
| 007 AC-32: "the source workbook is untouched" (row 11) | — | **Unchanged**: a global invariant, checked strictly against the working tree |
| 008 AC-27: `error-response.ts`; 008 AC-29: `prisma/` and `TRUNCATED_TABLES`; 008 AC-1: `auth-config.ts` and `middleware.ts` (`count-entry-contract.test.ts`, rows 3–6) | AC-45 | Now checked against #8's own commits. #21 edits `prisma/`, `test-db.ts` (AC-4), `auth-config.ts` and `middleware.ts`. Row 5 is also one of the two AC-4 names |
| 010 AC-4: `count-service.ts` and `stock-entry/page.tsx`; 010 AC-22: schema, migrations, truncate list and five modules (`stock-takes-contract.test.ts`, rows 12–14) | AC-45 | Now checked against #10's own commits. #21 edits `stock-entry/page.tsx` (AC-37), `prisma/`, `test-db.ts`, `auth-config.ts` and `middleware.ts`. Row 13 is also AC-4's |
| 010 AC-22: "CalendarGrid.tsx is the only changed file in #7's trees"; 010 AC-21/AC-22: "playwright.config.ts changed by exactly its two route patterns" (rows 15, 16) | AC-45 | Changed from a range ending at the branch tip to #10's own commits. The old range absorbs later features' edits: row 16 had already absorbed #11's, and row 15 would turn red at #21's commit |
| 011 AC-25: the exact list of untouched paths; 011 AC-14: `package.json` (`analysis-contract.test.ts`, rows 1, 2) | AC-45 | Now checked against #11's own commits. #21 edits `package.json` (AC-30) and most of AC-25's list. `Samples` leaves AC-25's list and is checked strictly next to it |
| `docs/conventions.md` → *Tests* and *Commits* | AC-47 | The working-tree bullet is corrected, and the `(#<id>)` commit scope is recorded as something tests now depend on |

**The e2e specs themselves must change**, and the reason is structural: 19 specs read `user.email`
— to register cleanup, to check the header, to fill the form directly, to name an audit actor —
and a profile has no email. The alternative that would keep them byte-identical, a
`TestUser.email` property holding a username, was rejected: it would put a false statement in every
spec file to save a rename the compiler already enforces. With usernames, the most common use —
cleanup registration — becomes the literal rename `.email` → `.username`. AC-40 limits the change
to a fixed set of mechanical substitutions (three at approval, five after the rulings below) and makes the limit checkable.

If any other shipped assertion turns red, that is a finding to report in
`progress/impl_pin_auth.md`, not a licence to edit it.

## Out of scope

- **Any other identifier at sign-in.** No email, staff code, name picker or "who are you" list — a
  name picker would reveal every profile's name to anyone holding a phone. The product stores no
  username on the device either; the browser is asked not to remember it.
- **Renaming a username.** Usernames are immutable (S1); a person who wants a different one is
  given a new profile.
- **A self-service PIN change, "forgot PIN" or self-unlock.** There is still no channel — no email,
  no phone number — to prove who is asking. An `ADMIN` resets a PIN (AC-24) or clears a lock
  (AC-26); the operator resets an `ADMIN`'s (AC-30).
- **A hard, admin-only lock, and a permanent lock.** Rejected in S6.
- **Showing on the sign-in page when a lock ends.** The page says the username is locked, not
  until when.
- **Reactivating a `DEACTIVATED` or `REJECTED` profile.** A returning person makes a new request.
  Historical counts keep pointing at the old row, which is correct: they were counted by that
  profile.
- **Deleting a profile.** `StockCount` references `User` with `Restrict`; a person who counted is
  part of the record, and usernames are never reissued. Deactivate instead.
- **Notifying anybody.** No email, push or badge tells the owner a request is waiting or an account
  is locked; the person asks him, and `/profiles` shows both. A badge on `/stock-takes` would need a
  role branch in #10's page, which 010 AC-13's scan forbids — that would be its own decision.
- **Navigation between areas.** `/profiles` is reached by its URL and by one link in the header of
  `/analysis`, which is already `ADMIN`-only and so needs no role branch. No menu is added.
- **An audit log of admin actions** — who approved, promoted, reset, cleared or deactivated whom.
  More useful now that clears exist; the two-person team still makes it a later feature, not a side
  effect of this one.
- **Pepper rotation tooling, a second pepper, or re-keying.** Replacing `PIN_PEPPER` means every
  profile is reset (S4). Recorded so it is a known cost, not a surprise.
- **A second way to create the first `ADMIN`.** The reset script creates no profile (S11); there is
  no `--create-admin`.
- **Measuring `/setup` on a phone end to end.** The development database always holds an `ADMIN`,
  so the page is `404` there; it renders at most once per database. Its fields use the same
  components as `/sign-in/create`.
- **Per-IP limiting, CAPTCHA, proof-of-work.** Per-IP is rejected in S8; the other two put
  friction on the yard, not on the attacker, given the lock and the budget already bound guesses.
- **Stopping a person from saving their PIN in their own phone's password manager.** The product
  asks the browser not to; it cannot forbid it.
- **WebAuthn, passkeys, biometrics, two-factor, "remember me", session listing.**
- **A super-administrator, a third role, per-yard permissions.** D11 and Part 6: two roles.
- **Deployment, the production `PIN_PEPPER` and `SETUP_CODE`, and confirming the platform's
  forwarded-address behaviour.** #16 `deploy`. Nothing here depends on the client address.
- **CI.** `init` remains the gate.

### Three conflicts found by Phase A, ruled by the coordinator, 2026-09-25

Phase A's implementer found them and **reported rather than resolved them**. Two are the spec
contradicting itself; one is a gap.

- **AC-39 against AC-40.** AC-39 requires every quoted literal to be single-sourced and asserted
  from its module. Five existing e2e specs spell `ACCESS_DENIED_MESSAGE`'s 36-character text inside
  `toHaveText(…)`, and AC-40 allowed only three mechanical substitutions there. **Ruling: AC-40
  gains a fourth**: a literal equal to a single-sourced constant becomes an import of that constant,
  at the five named sites. This **strengthens** those specs, since they can no longer drift from the
  screen. The alternative, narrowing AC-39's scan, would have weakened it.
- **AC-8 against AC-39.** AC-8 forbade any non-empty literal under a `/setup_?code/i` name, and
  AC-39 requires `SETUP_CODE_INCORRECT_MESSAGE`. **Ruling: exempt by content, not by name.** The
  scan now forbids literals that **could be a code** (no whitespace and at least 16 characters). A
  sentence can't be one. A name-based exemption (`_MESSAGE`) was rejected, because renaming a
  constant would evade it; a real code has no spaces and at least 16 characters, so it stays caught
  whatever it's called.
- **A trivial PIN at sign-in (AC-10).** `parsePin` refuses trivial PINs, so a typed `1111`-shaped PIN
  is malformed. **Ruling: it joins case (f).** It gets the same `INCORRECT` answer, counts as a
  failure against the device's budget, and gets no account key and no bcrypt. That's safe because no
  stored PIN can be trivial (AC-7), and skipping the hash for an input that can't match is a small
  saving, not a side channel: case (f) already answers in the same visible way. The test builds it
  by rule at runtime; it's never written down.
- **AC-13's "pure" `bucketFor`** is resolved by Phase A's recorded Deviation 1. `AUTH_SECRET` has
  no other reader in AC-6's set to move, because Auth.js reads it itself.

### Five findings by Phase B, ruled by the coordinator, 2026-09-25

Phase B's implementer found them and **left each red or unchanged rather than resolving it**. Its
report is `progress/impl_pin_auth.md` → *Phase B* → *Findings*.

- **B1. 020 AC-6's schema-text test against AC-1.** 020 AC-6 asserts nine `@id`s, every one
  `@default(cuid())`. AC-1 declares `AccountLock.accountKey` (the HMAC of a typed username, S5) and
  `SetupClaim.id` (`Int`, the one row a first-run setup writes), and neither is a cuid. **Ruling: amend
  020 AC-6's unit half** to twelve `@id`s, ten cuids and exactly those two with no `@default`, with
  `autoincrement` still nowhere. Its claim, that `RESTART IDENTITY` resets nothing because the schema
  owns no sequence, is untouched: an `@id` with no default creates no sequence, and the database half
  (`pg_class`) proves that directly. Making both ids cuids was rejected. The lock is keyed by the
  typed username's HMAC because nothing typed is stored (S5), and a second unique column would add a
  key with nothing to hold. Dropping the count was also rejected, because the count is what stops the
  line filter from silently matching nothing.
- **B2. 004 AC-24's database census against AC-2.** It is the database twin of 004 AC-23's directory
  census, which AC-2 already re-spelled, and it needs the same treatment for the same reason. **Ruling:
  re-spelled as #4's own claim** (AC-2 now says so), with no row count, and never re-amended by a later
  migration. The implementer also amended 004 AC-1's, AC-5's and AC-19's **database** censuses. Those are
  the database halves of the Part 3 assertions AC-1 amends, and each was tightened to the new schema,
  not relaxed to a subset. **That reading is confirmed**, and AC-1 now names all three, so no criterion
  forces an unnamed amendment.
- **B3. AC-40's display names against eleven shipped `expect(` sites.** AC-40 names test profiles
  `<label>-<16 hex>`. The old helper named every profile `E2E Yard Staff` or `E2E Administrator`, and
  eleven sites quote those names. Seven went red. One stayed green for the wrong reason:
  `stock-entry-start.spec.ts:336` asserts the page does **not** contain `E2E Administrator`, which no
  profile is called any more, so the check had silently become hollow. **Ruling: AC-40 gains a fifth
  substitution**: the old name becomes an interpolation of the named user's `name`, and a negative
  assertion stays negative. That makes those assertions stronger than before, because two
  administrators no longer share one name.
- **B4. The reset script's tests are red between the phases.** Phase B had to delete
  `scripts/admin-create.ts` (it calls a removed function), and two shipped unit tests read the
  script's replacement, which Phase C was to write. A phase is committed only on a green gate
  (CHECKPOINTS C2.1). `docs/operations.md` would also still tell the owner to run the deleted script.
  **Ruling: the phases are re-split.** These move into Phase B:
  - AC-30, meaning `scripts/pin-reset.ts`, `pin:reset`, and the two operator functions it needs;
  - AC-41's amendment of `no-default-password.test.ts`;
  - the `docs/operations.md` sections that are true once Phase B lands: the one-time step for a
    migrated profile, lockout recovery, and a lost `PIN_PEPPER`.

  The `/setup` paragraph of `docs/operations.md` and `.env.example` stay in Phase C with the screens.
  No criterion changes.
- **B5. AC-40's diff rule and new spec files.** The rule forbids added `test(` titles outside five
  named files, and the browser criteria live in new `tests/e2e/pin-*.spec.ts` files. **Ruling: the
  implementer's reading is confirmed.** The rule governs the specs that exist at the base commit, and
  AC-40 now says so.

### Two gaps found by Phase B's continuation, ruled by the coordinator, 2026-09-25

Both were reported as notes, not worked around, and neither turns a test red. **Both go to
Phase C.**

- **G1. The secret scans read a quoted identifier-shaped value as code.** Both detectors
  optionally consume an opening quote and then exempt any value shaped like an identifier:
  #3's `isNotAPassword` in `no-default-password.test.ts`, and AC-8's setup-code scan in
  `pin-auth-contract.test.ts`. So a written-down letters-first value passes both. That includes
  a hex `PIN_PEPPER` that begins with `a`–`f`, which is 6 of every 16, and a setup code such as
  one made of words and digits.
  - **AC-8's half is a defect, not a spec change.** AC-8 already forbids any string literal
    with no whitespace and at least 16 characters under a `/setup_?code/i` name. The scan
    must exempt only an **unquoted** identifier or call, and prove it red with a letters-first
    value built at runtime.
  - **AC-41's half is a ruling.** AC-41 named the variables but not the value rule. For
    `NEW_PIN`, `PIN_PEPPER` and `SETUP_CODE`, any quoted literal is now an offence except the
    placeholders. #3's names keep #3's rule, so #3's accepted cases are not re-opened.
- **G2. A `NEW_PIN` in `.env` would act as a default.** Prisma's client fills any missing
  variable from the project's `.env` when it loads, and the script imported it before reading
  `NEW_PIN`. AC-30 forbids a default. **Ruling: AC-30 now requires both reads to happen before
  anything that reaches the client is evaluated, proven by a source check.** A test must not
  write to the real `.env`, so this is the proof that can exist. The alternative, a runtime
  test that puts a value in `.env`, was rejected for that reason.

### Three findings by Phase C2, ruled by the coordinator, 2026-09-25

- **C2-1. The header link to `/profiles` against 011 AC-16.** *Navigation* puts one link to
  `/profiles` in `/analysis`'s header. 011 AC-16's test asserts that every `a[href]` on the
  screen carries `period` and `breakdown`, so a plain link turns it red. **Ruling: the link is
  added, and 011 AC-16 gains exactly one exception.** AC-16's rule exists so that moving
  *within* the analysis view keeps the chosen period and grouping. A link that leaves for another
  section is not such a move, and parameters it ignores would be noise. The test gets stricter:
  - every other `a[href]` still carries both parameters;
  - exactly one `a[href="/profiles"]` exists, in the header;
  - a second parameter-less link would still be red.

  AC-22 now requires the link. Dropping it was rejected, because the owner would then reach his
  admin section only by typing its address.
- **C2-2. The sign-out control counts under AC-35.** AC-35 says "every action control on
  `/profiles` is at least 44 px tall", and the header's sign-out is on `/profiles`. **Ruling:
  it counts.** The shared control becomes at least 44 px tall on every page. That is a
  phone-first improvement everywhere, not only on `/profiles`. It must not widen any page, so
  the existing overflow assertions stand unchanged.
- **C2-3. Two mutations cannot reach the forbidden state, and that is accepted.** The database
  refuses both a held username (the unique index) and a PIN on a deactivated row
  (`User_pin_only_when_live`). So those mutations produce an error or a wrong answer, never
  the state itself. This is defence in depth, not a gap. The mutation that removes the
  application's mapping of the index violation (M3b) is the one that shows what the tests
  protect.
- **C2-4, found by C2's gate: a random name can look like money.** 010 AC-12/AC-13's test
  proves that a count page carries no price by asserting its body never contains a price's
  digits (the first `ItemPrice` in the owner's data reads `890`). AC-40 named test profiles
  `<label>-<16 hex>`, and one run drew `…5f41bdc1890dade2`. The page rightly showed it after
  *Counted by*, and the money check failed on a name. **Ruling: AC-40's random suffixes use
  letters only**, `a`–`p`, one letter per hex digit, so the entropy is unchanged. A fixture
  name can then never contain a digit. 010's money assertion is **not** touched: it is right,
  and loosening it would weaken the money boundary to fix a fixture. The random count ids
  (cuids) on the same page could in principle collide the same way. That predates #21 and is
  logged as a deferred observation, not changed here.

## Open questions

None blocking — each of the owner's decisions is achievable as written. Six choices this spec makes
that he may wish to change at approval, each a constant or a rule with a stated default; the first
four are carried forward from the draft:

1. **Trivial PINs are refused** (AC-7): one digit repeated, and a straight run up or down — 24
   four-digit and 20 six-digit values, defined by rule so none is written down. D6 says "4 or 6
   digits"; this narrows it slightly, because human-chosen PINs cluster on exactly these patterns
   and the uniform-PIN figures in *Residual risk* are optimistic to the extent they do. Striking
   it removes one function and one message.
2. **The budgets:** 10 wrong attempts per rolling 24 hours per known device and 10 shared by all new
   devices; 10 profile requests per day on the same split; 20 pending at most; 10 wrong setup codes
   per day; device trust for 180 days. Tighter is safer and pauses new devices more often; looser
   is the reverse. Each is one constant.
3. **A reset ends every session of that profile** (AC-17, AC-24). That is the point of a reset
   after a leak, and it costs one column. Striking it means a leaked PIN's sessions last up to
   seven days after the reset.
4. **The display name is at most 80 characters** and may not contain a line break, a tab, `<` or
   `>` (AC-7, AC-18) — because it is written into #9's audit lines, whose grammar a newline would
   forge and angle brackets would confuse, and because a public form must bound what it stores. 80
   is chosen so every shipped fixture label fits (the two longest are 61 characters, plus a hyphen
   and 16 hex); the header wraps at any length regardless.
5. **The lock: five wrong, 15 minutes doubling, a 24-hour cap** (S6). A 7-day cap would cut a
   patient guesser at one account from about 1,855 guesses a year to about 305 (4-digit odds from
   about 18.5 % to about 3 %, and at either of two `ADMIN`s from about 34 % to about 6 %), but it
   would leave a person caught in a stranger's lock locked out for up to a week unless an `ADMIN`
   clears it — and an outsider who will take *any* account is still bounded by the new-device
   budget (about 31 % a year on 4 digits), because at a longer cap they spread across more names.
6. **Usernames are 3 to 32 characters, `a`–`z` first, then `a`–`z`, `0`–`9`, `.`, `_`, `-`**
   (S1).

**A question, not a default:** should `ADMIN` PINs be required to be 6 digits? D6 says 4 or 6 for
every role, so this spec does not propose it. By *Residual risk*, a generated 6-digit `ADMIN` PIN
moves the one-year odds at the two `ADMIN`s from about one in three to about one in 270.

**Recommendation, not a rule:** until the owner decides that question, every `ADMIN` profile should
be reset from `/profiles` to a **generated 6-digit PIN** as soon as it exists.

**Operational precondition, not a question:** before #21 is built, the owner chooses `PIN_PEPPER`
and `SETUP_CODE` values himself, puts them in `.env`, and keeps a backup of `PIN_PEPPER` outside
the server. Neither value is ever typed into a chat, a spec, a test or a commit.

## Approved 2026-09-24 — the owner's answers

- **`ADMIN` PIN length: 4 or 6 digits, as D6 says, for every role.** The owner was asked the
  question above with the recomputed *Residual risk* figures in front of him, including the
  correction that the coordinator's earlier "5 chances in 10,000" was optimistic, and kept D6. The
  accepted risk is the table's: against either of two 4-digit `ADMIN` accounts, about **3 %** over
  30 days and about **one in three** over a year of patient guessing, with every failure visible on
  `/profiles`. Resetting each `ADMIN` to a generated 6-digit PIN remains a **recommendation**, not a
  rule.
- **Lock cap: 24 hours**, as S6 decides, not 7 days.
- **Defaults 1–4 and 6** (trivial-PIN rule, budgets, a reset ends sessions, display name at most 80
  characters, username format) approved as written.

## Post-approval amendments

### `.env` is the only settings file: the owner's decision, 2026-09-25

The owner decided to delete `.env.example` and run everything through `.env`. The app never
read `.env.example`: it was a committed template, and only tests, documents and specs pointed
at it. Its knowledge (which settings exist, what each is for, how to make each one) moves to
`docs/operations.md` → *Environment*, with placeholder values only. That section is the
checklist for #16 and for a new computer.

**Verified before deleting, as the owner asked.** A read-only script that prints yes or no and
never a value found that `.env` meets every check the template-based tests stood for:
- all eight settings are present;
- `DATABASE_URL` is pooled, `DIRECT_URL` unpooled, and `TEST_DIRECT_URL` unpooled;
- the test database is on a different host from the development one;
- `SETUP_CODE` is at least 16 characters;
- there is no `NEW_PIN`.

**What changes:**
- 002 AC-7 and AC-8, and 003 AC-30, carry an amendment note. 021 AC-8, AC-41, *Environment*
  and the index row are edited in place.
- The credential scan loses its only exemption, so it gets stricter.
- A new `tests/unit/env-file.test.ts` asserts the `.env` checks above as labelled yes/no
  results. The template's documentation claims are asserted against `docs/operations.md`.

**The accepted trade-off:** `npm run test:unit` now needs a `.env` to exist. On the owner's
machine it always does. On a fresh computer, the failing test names each missing setting, and
`docs/operations.md` → *Environment* says how to make it. The historical logs in `progress/`
still mention `.env.example`. They record what was true when they were written, and are not
rewritten.

### Phase 0: shipped git assertions name the feature whose work they describe, 2026-09-25

This amendment adds a prerequisite. It adds AC-44 to AC-47, a note after the no-database paragraph,
a note under the header, and rows in the amendment table. It changes no decision, no contract and
no wording in AC-1 to AC-43. Phase 0 also depends on #8 `stock_entry_ui`, because four of the
assertions it converts are #8's. #8 is done.

#### Why #21 could not get a green gate without it

The #11 review found fourteen shipped unit tests that assert a path is unchanged **in the working
tree**: `git status --porcelain -- <paths>` must print nothing. This was first-pass observation O3
in `progress/review_analysis.md`, and it is also recorded in `progress/current.md`. Each of these
tests was written by one feature about **its own** work ("this feature adds no migration"), and
each held for as long as that feature was being built. But the working tree does not record whose
work it holds.

#21 has to change most of those paths legitimately:

- a migration and `prisma/schema.prisma` (AC-1, AC-2);
- `TRUNCATED_TABLES` in `src/server/test-db.ts` (AC-4);
- `src/lib/auth-config.ts` and `src/middleware.ts`, for the `/profiles` route;
- `src/server/auth/**`;
- a `package.json` script (AC-30);
- the header in `src/app/stock-entry/page.tsx` (AC-37).

Those tests would therefore stay red for as long as #21 is uncommitted, and `CHECKPOINTS.md`
C2.1 requires a green gate before the commit. The only way through would be to edit shipped
assertions that no #21 criterion named, and this spec forbids that ("a finding to report, not a
licence to edit it"). Phase 0 removes the deadlock before any other #21 change. It is a harness
change to tests owned by five features.

#### Two more assertions with the same flaw, found while classifying

Two #10 assertions do not read the working tree. They read a commit range that runs from #10's
spec approval to **the tip of the branch** (`ee448cb..HEAD`). 010's seventh amendment introduced
that range for presence claims, and it fixed only half the problem: a range that ends at the tip
keeps absorbing every later feature's edits to the same paths.

- **This has already happened once.** "playwright.config.ts changed by exactly its two route
  patterns" should measure #10's edit. It now measures #10's edit plus #11's, and it passes only
  because #11 happened to rewrite the same two lines.
- **The other one breaks at #21's commit.** "CalendarGrid.tsx is the only changed file in #7's
  trees" names `src/app/stock-entry`, `auth-config.ts` and `middleware.ts`, and #21 edits all
  three. A range between two commits ignores the working tree, so the test stays green while #21 is
  uncommitted and turns red from #21's commit onward. That is the mirror image of the deadlock.

Both are converted. Phase 0 therefore covers **sixteen** assertions, not fourteen.

#### Three kinds of claim, and one way to check each

A test that asks git whether a path changed makes one of three claims:

1. **No feature may ever change this path.** This is a global invariant, and it needs a written
   "never" behind it. Today there is one: `CLAUDE.md` says "Never modify anything under
   `Samples/`", and `docs/conventions.md` → *Forbidden* says the same. A global invariant stays on
   the working tree. It is strict for every session, forever.
2. **Feature N did not touch this path.** The claim is about N's own work, so the test reads N's own
   work:
   - **while N is `in_progress`:** N's commits **and** the working tree. `docs/verification.md`
     allows at most one feature to be `in_progress`, so any uncommitted change belongs to N;
   - **otherwise:** N's commits only. That history is closed, so the claim stays true for good,
     and nothing a later feature does can change it.
3. **Feature N changed exactly this.** The check reads the same commits and working tree, but
   asserts equality instead of emptiness.

**A strengthening of the design first proposed.** The first proposal read only the working tree
while N was `in_progress`. But a feature can commit before it is done; Phase 0 itself is committed
in the middle of #21. A check that reads only the working tree loses sight of a protected-path
edit as soon as its own feature commits it. Reading both is never looser than reading either one.
It also adds no false red, because every commit it adds belongs to N.

#### Whose commit is whose

The only record is the subject line. Since #2, this repository has written every feature commit
as `<type>(#N): …`, for example `spec(#10): approve …`, `feat(#10): …` and `fix(#10): …`. The
helper follows these rules:

- **A commit is N's** exactly when its subject begins with lower-case letters, then `(#N)`, then
  a colon and a space.
- **Any type counts.** A `refactor(#8)` is #8's work too.
- **The closing parenthesis is part of the match,** so `(#1)` never matches `(#10)`.
- **Some commits belong to no feature:** those scoped to a word (`fix(app)`, `fix(harness)`,
  `harness(repo)`) and those with no scope (`spec: …`).
- **Nothing else is read.** The helper ignores the body, the author, the date, and the
  `Feature:` trailer that the conventions' template shows but no commit carries.

**Rejected: a base-to-feature-commit range per feature,** as AC-4's parenthesis spells it. That
range assumes a feature's commits are contiguous, and they are not. `66ff57a fix(#8)` landed after
#9's and #10's commits, and `d722275 fix(#10)` landed after #11's spec approval. A range ending at
a feature's first commit misses its later fixes. A range ending at its last commit takes in other
features' commits in between.

#### The helper — `tests/support/feature-scope.ts`

The helper lives in one place so that no test reimplements it.

| Export | Returns |
|---|---|
| `isAttributedTo(subject, id)` | Whether a subject line belongs to feature `id`. |
| `featureStatus(id)` | That feature's `status` in `feature_list.json`. |
| `commitsOf(id)` | Full SHAs of the commits reachable from `HEAD` that belong to `id`, oldest first. |
| `filesTouchedBy(id, paths)` | Repository-relative files under `paths`, sorted and distinct, that `commitsOf(id)` changed. While `id` is `in_progress`, this adds `workingTreeChanges(paths)`. |
| `changedLinesBy(id, paths)` | The `+` and `-` lines of each commit's own patch under `paths`, at zero context, file headers dropped, for `commitsOf(id)` in commit order. While `id` is `in_progress`, the working tree's lines against `HEAD` follow, and every line of an untracked file counts as added. |
| `workingTreeChanges(paths)` | Files under `paths`, sorted and distinct, that differ from `HEAD` (modified, added, deleted, or renamed, with both names listed; staged or not), or that are untracked and not ignored. |

Every export except `isAttributedTo` takes an optional last argument, `{ cwd }`. It defaults to the
process's working directory, which is where `git` runs and where `feature_list.json` is read.

**It fails closed.** In these cases it throws, and the message names the feature id where there is
one:

- `git` cannot run, or it exits non-zero. The shipped checks read `(stdout ?? "").trim()`, so a
  `git` that failed to start looked like "nothing changed".
- The clone is shallow. A truncated history would make every history check pass by reading
  nothing.
- `feature_list.json` is missing, is not JSON, or has no feature with the given id.
- The feature is not `in_progress` and no commit belongs to it. A history check over no commits
  asserts nothing.

**It is read-only.** It runs only `log`, `show`, `diff`, `status`, `ls-files` and `rev-parse`.
Every call passes `--no-optional-locks`, so `status` never rewrites the index while other test
files run in parallel. Every call also passes `--literal-pathspecs`, so `[id]` in a path means
those four characters, not a character class. `log` runs with `--full-history`, so path limiting
never simplifies a commit away.

#### The sixteen, classified

The owner is the feature whose criterion the test title cites. For every row, `git blame` of the
test's `it(` line at `5d28556` confirms it; the blamed commit is in the *Owner* column. This is
decided per assertion, not per file. For example, row 7 is #4's, although #3 created
`schema-and-migration.test.ts`. Line numbers are those of the `git` call at `5d28556`. Rows 1–14
are the fourteen from O3, and rows 15–16 are the two found while classifying. All paths are
relative to `tests/unit/`.

| # | File:line | Test title | Owner | Kind | Protected paths | Does #21 edit them? |
|---|---|---|---|---|---|---|
| 1 | `analysis-contract.test.ts:371` | `AC-25: the schema, the migrations and the truncate list are untouched` | #11 (`5d28556`) | #11's work. **`Samples` is split out as a global** | 21 paths, from `prisma/schema.prisma` to `src/components/item-master`, plus `Samples` | Yes: AC-1, AC-2, AC-4, AC-37, `/profiles`, `src/server/auth/**`, `src/app/api` |
| 2 | `analysis-contract.test.ts:427` | `AC-14: no charting library was added, so the fence has nothing new to hold` | #11 (`5d28556`) | #11's work | `package.json`, `package-lock.json` | Yes: AC-30 |
| 3 | `count-entry-contract.test.ts:173` | `AC-27: src/app/api/error-response.ts is unchanged by this feature` | #8 (`ddcabef`) | #8's work | `src/app/api/error-response.ts` | Not named by 021 |
| 4 | `count-entry-contract.test.ts:264` | `AC-29: prisma/ is byte-identical — this feature adds no migration and no table` | #8 (`ddcabef`) | #8's work | `prisma` | Yes: AC-1, AC-2 |
| 5 | `count-entry-contract.test.ts:272` | `AC-29: TRUNCATED_TABLES is unchanged, because #8 adds no table` | #8 (`ddcabef`) | #8's work, also named by AC-4 | `src/server/test-db.ts` | Yes: AC-4 |
| 6 | `count-entry-contract.test.ts:284` | `AC-1: the middleware gains no /api entry and no new pattern` | #8 (`ddcabef`) | #8's work. Its `/api` content check stays | `src/lib/auth-config.ts`, `src/middleware.ts` | Yes: `/profiles` |
| 7 | `schema-and-migration.test.ts:353` | `004 AC-23: migration_lock.toml still records provider postgresql and is unmodified` | #4 (`faccf65`) | #4's work. Its provider check stays | `prisma/migrations/migration_lock.toml` | No. A new migration leaves it alone while the provider stays the same |
| 8 | `stock-entry-contract.test.ts:143` | `AC-3: the PUBLIC segment's loading.tsx is unchanged and still there` | #7 (`9e4b675`) | #7's work (decided below). Its existence and `data-testid` checks stay | `src/app/(public)/loading.tsx` | No |
| 9 | `stock-entry-contract.test.ts:154` | `AC-1: auth-config.ts and middleware.ts are byte-identical to their shipped state` | #7 (`9e4b675`) | #7's work | `src/lib/auth-config.ts`, `src/middleware.ts` | Yes: `/profiles` |
| 10 | `stock-entry-contract.test.ts:711` | `AC-32: prisma/ is byte-identical — this feature adds no migration` | #7 (`9e4b675`) | #7's work. Its `migration_lock.toml` existence check stays | `prisma` | Yes: AC-1, AC-2 |
| 11 | `stock-entry-contract.test.ts:720` | `AC-32: the source workbook is untouched` | Written by #7 (`9e4b675`); the rule belongs to no feature | **Global.** Byte-identical | `Samples` | No |
| 12 | `stock-takes-contract.test.ts:103` | `AC-4: count-service.ts is byte-identical to its shipped state` | #10 (`b468f60`) | #10's work | `src/server/counts/count-service.ts` | Not named by 021 |
| 13 | `stock-takes-contract.test.ts:227` | `AC-22: the schema, the migrations and TRUNCATED_TABLES are unchanged` | #10 (`b468f60`) | #10's work, also named by AC-4 | 9 paths, from `prisma/schema.prisma` to `count-summary-service.ts` | Yes: AC-1, AC-2, AC-4, `/profiles`, AC-38 |
| 14 | `stock-takes-contract.test.ts:343` | `AC-4: /stock-entry/page.tsx is byte-identical, so #7's rendering cannot have moved` | #10 (`b468f60`) | #10's work | `src/app/stock-entry/page.tsx` | Yes: AC-37 |
| 15 | `stock-takes-contract.test.ts:533` | `AC-22: CalendarGrid.tsx is the only changed file in #7's trees` | #10 (`b468f60`) | #10's work. **A presence claim** over a range ending at the branch tip | 9 paths. Expects exactly `CalendarGrid.tsx` | Yes: turns red at #21's commit |
| 16 | `stock-takes-contract.test.ts:561` | `AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns` | #10 (`b468f60`) | #10's work. **A presence claim about lines** over a range ending at the branch tip | `playwright.config.ts`. Expects 4 lines | Not named by 021. It has already absorbed #11's edit |

**Every converted row passes under the new check today.** The check was run per row at
`5d28556` with `git log --full-history -- <the row's paths>`. For rows 1–14, no commit on the list
belongs to the row's owner. Rows 15 and 16 find one #10 commit, `b468f60 feat(#10)`. Its only file
in row 15's trees is `src/components/stock-entry/CalendarGrid.tsx`. Its patch to
`playwright.config.ts` is exactly the four route-pattern lines, so row 16 measures what 010 AC-21
claimed, #10's own edit, again. Every commit that touched any row's paths carries either its own
feature's scope or no feature at all; `db5568c harness(repo)` created `Samples/`. The repository is
not a shallow clone.

#### `src/app/(public)/loading.tsx` belongs to #7; it is not a global invariant

A global invariant needs a written "never", and nothing says "never" about this file. `CLAUDE.md`'s
*Never* list and the conventions' *Forbidden* list name `Samples/` and nothing like this file.

What the file matters for is 007 AC-3's rule that "the refusal is the server's answer". Checks on
the tree hold that rule, not checks on history:

- no `loading.tsx` at or above a protected page (007 AC-3's census and 010 AC-2's derived one);
- in the same test as row 8, the file exists and still renders `data-testid="loading"`.

Phase 0 changes none of those. A later feature that restyles the public loading fallback is doing
legitimate work. A feature that puts a `loading.tsx` above a protected page is caught by the census,
whatever its commit says.

**Tradeoff.** Once #7 is done, another feature's edit to this file's markup is no longer noticed
as an edit. Only what the file still has to do is checked.

#### How Phase 0 meets AC-4, and what else in 021 it touches

**AC-4.** AC-4 requires three assertions to be re-spelled as claims about their own feature's
commits. Two of them are rows 5 and 13. The third is 010's content check, "AC-22: TRUNCATED_TABLES
still holds exactly its eight entries".

- Phase 0 delivers rows 5 and 13 early, through the helper, and AC-4's text is not edited. The
  helper's claim implies the one in AC-4's parenthesis. `c79a0ed..ddcabef` and
  `ee448cb..b468f60` each contain exactly one commit, `ddcabef feat(#8)` and `b468f60 feat(#10)`,
  and each of those is among the commits the helper reads for its feature.
- The eight-entry check reads file content, not git, so it stays AC-4's work in #21's main phase.
  The helper is the natural way to write it: `filesTouchedBy(10, ["prisma",
  "src/server/test-db.ts"])` is empty.

**The rest of 021.** AC-2, AC-40 and AC-43 describe `git diff <this feature's base
commit>..HEAD` commands that a reviewer runs once. They are not shipped assertions, and they
stand. If the implementer ships any of them as a test, AC-45's scan requires the helper instead.
AC-43's review range includes the Phase 0 commit. The assertion changes that range shows in the
five test files are Phase 0's, covered by AC-45. They are not AC-43's fixture-only edits.

#### The commit scope now matters, and what breaking it does

AC-47 records the scope in `docs/conventions.md` → *Commits*. Every commit made for a feature is
scoped `(#N)`: `spec(#N)` approves or amends its spec, `feat(#N)` builds it, and `fix(#N)`
repairs it later. Any other type takes the same scope. A commit made for no feature takes a word
scope (`harness`, `app`). If a commit breaks the convention, this is what happens:

- **The scope is missing, or malformed** (`fix(app)` for #8's work, `fix(#08)`, `fix #8:`). The
  commit belongs to no feature, and every "N did not touch this" check ignores it. The result is a
  false green, never a false red. Only review catches it. If the gate runs while the edit is still
  uncommitted and N is `in_progress`, the working-tree half catches it too.
- **The number is wrong** (`fix(#10)` for #8's work). The commit belongs to #10 for good, because
  history on `main` is not rewritten. If it touched a path that #10's checks protect, those checks
  turn red for a change #10 did not make. The remedy is an attribution correction added to the
  helper: keyed by the commit's SHA, carrying its reason, and reviewed on its own. The remedy is
  never an edit to the assertion. No correction exists today, and none is needed.
- **A revert** (`Revert "fix(#8): …"`) belongs to no feature, and the reverted commit stays #8's.
  If a revert should clear #8, that takes the same kind of correction.

#### Known limits, accepted

- **A fix under a feature that is already `done` is checked only once it is committed.** The
  feature is not `in_progress`, so its own checks read only history. They turn red at the first
  gate after the commit, not before it. A feature's own closing gate is not affected: AGENTS.md
  §5 runs `init` before the status becomes `done`.
- **A shallow clone makes these checks throw.** CI (#16, out of scope here) will need full
  history.
- **Global invariants are checked only in the working tree.** A committed change under
  `Samples/` is caught by the gate in the session that made it (`init` step 3, row 11, and the last
  sentence of AC-43), not afterwards. Row 11 stays byte-identical, including its old weakness: if
  `git` cannot run, it reads the empty output as "clean". `init` step 3 checks the same path
  separately.

#### Order

1. This amendment and `feature_list.json` are committed together as `spec(#21): …`.
2. Phase 0 is built with no other #21 change in the working tree. The implementer makes AC-44 and
   AC-45 green, runs and records AC-46's proofs, and records AC-47's `init` run. Phase 0 is then
   committed on its own, as `test(#21): …`.
3. The rest of #21 follows, from AC-1.

Under R1–R5 and R6–R10 of AC-46, the rows that must fail are:

| `in_progress` (R1–R5), or committed as `fix(#n)` (R6–R10) | Rows that fail |
|---|---|
| #4 | 7 |
| #7 | 8, 9, 10 |
| #8 | 3, 4, 5, 6 |
| #10 | 12, 13, 14, 15, 16 |
| #11 | 1, 2 |
| #21 (R0; R11 as `feat(#21)`) | none |

**The worktree needs `node_modules`.** If the implementer links it to the main checkout's copy,
they remove that link on its own before removing the worktree, so removing the worktree cannot
delete anything through the link. Afterwards, they confirm that the main checkout still runs
`npx vitest --version`.

#### What Phase 0 does not do

- It does not change row 11. It does not change any check that is not about git history or the
  working tree, such as content checks, censuses of the tree and source scans.
- It does not change 004 AC-23's census of migration directories (see the next section), and it
  does not change 010's eight-entry `TRUNCATED_TABLES` check (AC-4's work).
- It adds no hook that enforces the commit convention. A `commit-msg` hook could, and that would be
  its own harness change.
- It rewrites no history and adds no attribution correction.
- It adds no history check for global invariants.
- It adds no CI.

#### Resolved (coordinator, 2026-09-25): 004 AC-23's migration census

Phase 0 surfaced it. `schema-and-migration.test.ts` asserts that `prisma/migrations` holds **exactly two**
directories, and AC-2's migration makes three. It's a census of the tree, not a git check, so Phase 0
didn't cover it.

**Decision: the spec-writer's proposed disposition, adopted, and written into AC-2.** The census is
re-spelled as **#4's own claim**: #4's commits added files in exactly one migration directory,
`create_stock_domain`. The first two directories must still be in order. The alternative, amending the
count to three, was **rejected**: every later migration would have to edit #4's test again, and a
hand-maintained count is exactly the kind of list that went stale in #9 (010 AC-2's reasoning). Each
later migration is asserted by its own feature's criterion instead, in the feature-scoped form.

**Also tightened in AC-2:** its own "exactly one new directory" was written as a two-commit range,
`<base>..HEAD`. That would have been empty for the whole of #21's uncommitted build, and would have
counted later features' migrations after the commit. It now goes through the same helper: the base
commit against the working tree while #21 is `in_progress`, and #21's own commits afterwards.

