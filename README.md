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
3. **Sign-in link templates:** in Supabase under Authentication > Email Templates, set the link in both **Magic Link** and **Confirm signup** to:
   ```
   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
   ```
   This lets links work when opened in an email app's built-in browser. Free projects can only edit templates after adding their own email sender (SMTP). Under URL Configuration, set the Site URL to your deployed address and add `<that address>/auth/callback` to Redirect URLs.
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
| `app/dashboard/` | Agent screens: shares, new share, profile |
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

Sample photos are from Unsplash. See `public/sample/CREDITS.txt`.
