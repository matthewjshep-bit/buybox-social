# Porchcard

Agents send clients a branded link to a few listings. Clients and their family react and comment with no app and no password, and the agent sees it all on a dashboard.

Version 1 runs on **fictional sample listings**. Real MLS data must wait for a signed license (see [Going live with real listings](#going-live-with-real-listings)).

## Run it locally

Needs Node 24 and pnpm. No accounts or Docker required.

```bash
pnpm install
cp .env.example .env.local   # the defaults work as they are
pnpm db:local                # terminal 1: local Postgres (PGlite)
pnpm db:setup                # terminal 2: create tables, load sample listings
pnpm dev                     # open http://localhost:3000, enter any email
```

Local sign-in takes any email with no password. Emails are printed to the server log.

## Test it

```bash
pnpm build
pnpm test:e2e
```

To reuse a Chromium you already have instead of running `playwright install`, set `PLAYWRIGHT_CHROMIUM` to its path.

## Deploy it

You need free accounts at Supabase, Vercel and Resend.

1. **Supabase:** create a project. Copy the **Transaction pooler** connection string and the project URL and publishable key.
2. **Database:** run this once from your computer:
   ```bash
   DATABASE_URL="<pooler string>" pnpm db:setup
   ```
3. **Sign-in email templates:** people sign up and in with a code they type on the page they're on (no password, no new tab). In Supabase under Authentication > Email Templates, make both **Magic Link** and **Confirm signup** carry the code, with a link as a fallback that brings them back to the same page:
   ```html
   <h2>Your Porchcard code</h2>
   <p>Type this code on the page you're on:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Or <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">sign in with this link</a>.</p>
   ```
   The link works when opened in an email app's built-in browser. Free projects can only edit templates after adding their own email sender (SMTP). Under URL Configuration, set the Site URL to your deployed address and add `<that address>/auth/callback**` to Redirect URLs (the `**` lets it carry the page to come back to). The code can be 6 to 10 digits (Supabase's Email OTP Length).

   **Production checklist** (in order; a miss here is what makes people "sign up again" when they come back to a link):

   1. **Both templates.** Authentication > Email Templates: **Confirm signup** _and_ **Magic Link** carry `{{ .Token }}` and the link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`, as above. Someone signing in for the first time gets Confirm signup (the app asks Supabase to create the user); everyone after that gets Magic Link. A template without the code, or with Supabase's default `{{ .ConfirmationURL }}`, leaves that person with a link that opens elsewhere and no code to type.
   2. **Redirect URLs.** Authentication > URL Configuration: `https://www.porchcard.com/auth/callback**`. Add `https://porchcard.com/auth/callback**` too unless the apex is redirected to www (step 4).
   3. **Site URL:** `https://www.porchcard.com`.
   4. **One address.** Sign-in cookies belong to one host: signed in at `www.porchcard.com`, you're signed out at `porchcard.com`. The apex → www redirect is a Vercel domain setting (Project > Domains, redirect `porchcard.com` to `www.porchcard.com`); nothing in the code does it.
   5. **`APP_URL`** on Vercel is exactly `https://www.porchcard.com` (no trailing slash): it's where the emailed link comes back to.
   6. **`TEST_SIGN_IN_PASSWORD`** is not set in production.
   7. **Sessions last.** Authentication > Sessions: no time-box ("Time-box user sessions") and no inactivity timeout, so a client who signed up on a link is still signed in when they come back to it weeks later. Signing out on one device signs out that device alone.
   8. **The code.** Authentication > Providers > Email: Email OTP Length 6 (up to 10 is read), and an expiry long enough to find the email, say 3600 seconds (an hour). One code email a minute is Supabase's limit; the page waits that long before offering a new one.
4. **Resend:** verify your sending domain and create an API key.
5. **Vercel:** import the project and set these variables. Do **not** set `ALLOW_DEV_LOGIN`.

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler string |
   | `DATABASE_POOL_MAX` | `5` |
   | `APP_URL` | Your deployed address |
   | `SUPABASE_URL` | From Supabase |
   | `SUPABASE_PUBLISHABLE_KEY` | From Supabase |
   | `RESEND_API_KEY` | From Resend |
   | `EMAIL_FROM` | For example `Porchcard <alerts@yourdomain.com>` |

Then send yourself a link by text to check the preview image.

## How it's organized

| Path | What it does |
|---|---|
| `app/s/[token]/` | The client page, its actions, and the link preview image |
| `app/dashboard/` | Agent screens: clients, links (shares), new link, profile |
| `app/admin/`, `lib/admin.ts` | The admin: leads, people, homes and comments |
| `lib/listings/` | The listing source. Swap this to go live |
| `lib/shares.ts` | Reads for shares and their threads |
| `supabase/migrations/` | Database schema |
| `supabase/seed/listings.json` | Fictional sample listings |
| `e2e/` | Full-loop and security tests |

**Security model:** the browser never talks to the database. Every query runs on the server and is scoped to a share token or the signed-in agent. Row-level security is on with no policies, so Supabase's public keys can't read or write anything. Anyone holding a share link can read and join that thread, so treat links like private invitations.

## The admin

`/admin` is for running the site: leads to follow up (with call, text and email buttons), everyone who's signed up, every home and how people are taking to it, and every public comment, with the way to take one down. People export to CSV for a spreadsheet or CRM.

The owner, `SUPER_ADMIN_EMAIL` in `lib/auth.ts`, is always an admin, and is the only one who can add or remove other admins (Admins, in the admin's menu). Admins they add see everything else. Anyone else sees "not found". Locally, sign in with the owner's email to open it. Private chats between buyers and their agents show as counts there, never their words. For anything the admin doesn't cover, Supabase's Table Editor has the raw tables.

The owner's admin API (`app/api/admin/v1`, a `pc_admin_` key made on `/admin/api`) also brings in what people said about homes somewhere else, as public likes, passes, photo-spot likes and comments on the homes' pages (`lib/api/admin-engagement.ts`):

- `POST /visitors {first_name, ref}`: a person with a first name and no account; the same `ref` finds them again. `GET /visitors` lists them; `DELETE /visitors/{id}` takes them and everything they said away.
- `PUT /homes/{key}/reactions {visitor, reaction, liked, disliked}` and `PUT /homes/{key}/photo-reactions {visitor, media_key, tag, reaction}`.
- `POST /homes/{key}/comments {visitor, body, media_key?, spot?, parent?, at?}`: on the home, a spot in a photo (`@x,y` in percent), or answering a comment or someone's likes (`like:<visitor id>`), dated `at`. `visitor` is a person brought in, or `owner`.
- `POST /sample-data/clear`: the demo's visitors, views and sign-ups, and the sample homes (not on a link). The demo's accounts go through `DELETE /accounts/{id}`. `pnpm db:setup` syncs the sample homes again.
- `DELETE /links/{id}?agent=<agent id>`: any agent's link, opened or not.

## Going live with real listings

Before any real listing is shown, the broker should get written answers from NWMLS:

- Is NWMLS available through MLS Grid? If not, what's the feed route?
- Can a vendor run this under the broker's license, and for agents at other brokerages?
- Are private link-based pages with client comments allowed? Which license fits (IDX or VOW)?
- What are the fees and the attribution, photo and data-refresh rules?
- What would public comments require?

Then:

1. Add an adapter in `lib/listings/` that yields RESO-named listings, and return it from `activeListingSource()`.
2. Copy photos to your own storage and put those URLs in `Media`. MLS Grid does not allow using its media URLs in an app.
3. Add those photo hosts to `images.remotePatterns` in `next.config.ts`.
4. Run the sync on a schedule. MLS Grid's limits are 2 requests/sec, 7,200/hour, 40,000/day and 4 GB/hour.
5. Remove the sample rows, and check the client page against NWMLS's display rules with the broker.

### Homes by address (Repliers)

With `REPLIERS_API_KEY` set, a home that isn't in the database can be found by its address in the link builder and the post box. Nothing is copied in bulk:

1. Typing an address asks Repliers for matches (`lib/listings/repliers.ts`). They are shown, not saved.
2. Putting one on a link or posting about it saves its facts and queues its photos (`lib/listings/imports.ts`, tables `listing_imports` and `listing_photos`).
3. The photos are scanned in the background, a few at a time (`lib/listings/scan.ts`, needs `ANTHROPIC_API_KEY`). Each scan names the room and boxes everything in the photo, so a tap is named by the smallest box it falls in ("the kitchen island"). Taps made before a photo is scanned get their name when it is.
4. A run that's out of time hands on to `/api/imports/run` (needs `APP_URL` and `CRON_SECRET`). A Vercel cron on that path picks up anything left behind.

`pnpm import:home "123 Main St"` runs the same steps from the command line (`--fake` for a stand-in scan with no Claude key). Photos stay on Repliers' CDN. A test key returns sample listings; live NWMLS data needs the data agreement above.

Sample photos are from Unsplash. See `public/sample/CREDITS.txt`.
