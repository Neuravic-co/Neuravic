# Deploying Neuravic

The backend (`NBE`) runs on Cloudflare Workers with a D1 database. The website (`NFE`) runs on Vercel.
The website forwards `/api/*` to the backend, so the browser sees one site and the login cookie stays first-party.

```
Browser -> Vercel (NFE) --/api/*--> Cloudflare Worker (NBE) -> D1
```

## 1. Backend on Cloudflare

```bash
cd NBE && npm ci && npx wrangler login
npx wrangler d1 create neuravic-db          # copy database_id into wrangler.jsonc
```

In `wrangler.jsonc` set `APP_ENV` to `production`, and `APP_URL` and `ALLOWED_ORIGINS` to the website address
(for example `https://neuravic.vercel.app`; use the custom domain once you have one).

```bash
npm run db:migrate:remote
npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL   # your email: the first sign-in creates the admin
npx wrangler secret put RESEND_API_KEY          # without it no sign-in emails are sent
npx wrangler secret put PROXY_SECRET            # a long random value, e.g. openssl rand -base64 32
npx wrangler deploy                             # prints https://neuravic-api.<name>.workers.dev
```

Check `<worker address>/api/v1/health` returns `{"status":"ok"}`.

## 2. Website on Vercel

Import the repository with **Root Directory** `NFE`. `NFE/vercel.json` sets the Next.js build.
Add these environment variables (Settings, Environment Variables):

| Name | Value |
|---|---|
| `API_ORIGIN` | the Worker address from step 1 |
| `API_PROXY_SECRET` | the same value as `PROXY_SECRET` on the Worker |

Leave `NEXT_PUBLIC_API_BASE_URL` unset. Redeploy after adding the variables.

`/portal` shows a preview of the staff workspace (sample details, no sign-in) until you add `NEXT_PUBLIC_PORTAL_OPEN` = `true`
(then redeploy). Do that when the backend is live and you are ready for clients to sign in.

## 3. Check it works

1. Send a message through the contact form. It arrives at `NOTIFY_TO`.
2. Open `/portal`, enter the admin email and follow the emailed link.

## Limits

- Requests pass through a Vercel function, so a single request body is limited to about 4.5 MB. File uploads
  (up to 10 MB) need the Cloudflare route (`yourdomain/api/*` to the Worker) instead of the Vercel proxy.
- When both run on one domain through Cloudflare, `API_PROXY_SECRET` and `PROXY_SECRET` are not needed.
