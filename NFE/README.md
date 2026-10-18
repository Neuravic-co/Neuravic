# Neuravic Website

The production frontend for Neuravic, a multidisciplinary technology company operating across Dubai and Cairo. The site presents Neuravic's AI systems, software platforms, product experience, and deployment capabilities through a dark, minimal brand experience.

## Live website

[neuravic-ai-systems.mohamedsafwat648.chatgpt.site](https://neuravic-ai-systems.mohamedsafwat648.chatgpt.site)

## Technology

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- Vinext and Vite 8
- Cloudflare Workers deployment output
- Lucide icons

## Brand system

The interface uses only the approved Neuravic palette:

- Ink: `#070A12`
- Slate: `#121824`
- Paper: `#F5F7FA`
- Muted: `#667085`
- Electric blue: `#365BFF`

Typography is Termina in weights 300, 400, and 500, loaded from the Adobe Fonts web project `okn5dwf`.

## Included brand assets

All imagery used by the current production site is committed under `public/assets/`. The hero artwork is not an image: `components/hero-art.tsx` draws the brand mark as vector shapes so it stays sharp on any screen.

- `neuravic-logo.png` — primary wordmark
- `neuravic-mark.png` — standalone brand mark and favicon source
- `neuravic-pattern.svg` — exact original Neuravic pattern

Project-image frames intentionally remain empty until original project photography is supplied.

## Local development

Node.js 22.13 or newer is required. The site talks to the Neuravic API in [`../NBE`](../NBE), so run both:

```bash
# terminal 1: backend (http://localhost:8787)
cd NBE && npm install && cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev

# terminal 2: frontend (http://localhost:5173)
cd NFE && npm install && cp .env.example .env.local && npm run dev
```

The site still renders without the backend (built-in content, and the contact form shows
an error with an email fallback), but the Portal and enquiries need it.

Checks and production build:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Connection to the backend

| Setting (`.env.local`) | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Where the browser reaches the API. Unset in production: it defaults to same-origin `/api/v1`, so route `yourdomain.com/api/*` to the NBE Worker. |
| `API_ORIGIN` | Where the server reads site content while rendering. Optional; without it the built-in content is used. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional bot check on the contact form (set `TURNSTILE_SECRET` on NBE too). |

What is connected:

- **Contact form** (`components/contact-form.tsx`) posts to `POST /leads`. It validates in the browser, has a honeypot, explains errors, and keeps a `mailto:` fallback.
- **Site content** (`lib/site-content.ts`) is read from `GET /content`, section by section, and falls back to the built-in copy on any error or timeout. Staff can edit it through the API without redeploying the site.
- **Portal** (`/portal`) is the client area: passwordless sign-in, projects, requests with approvals, comments and file attachments, activity, members. Staff also get organisations and the enquiries inbox. The email link lands on `/portal/verify`.
- The API client is `lib/api.ts`; portal state lives in `components/portal/`.

## Security headers

Every page is sent with `Content-Security-Policy` (`frame-ancestors 'none'`, `base-uri`, `form-action`, `object-src`),
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and HSTS, configured in
`next.config.ts`. `public/.well-known/security.txt` says how to report a problem. See [`../Security`](../Security/README.md).

## Accessibility

Small text on dark surfaces uses mixes of the approved palette (see the comment at the top of
`app/globals.css`) so it meets WCAG AA contrast. Pages are checked with axe-core in [`../Test`](../Test/README.md).

## Source structure

- `app/page.tsx` — home page structure (content comes from `lib/site-content.ts`)
- `app/portal/` — portal routes and styles
- `lib/` — API client, site content loader, portal types
- `app/globals.css` — responsive layout, brand styling, and transitions
- `app/layout.tsx` — document metadata, Adobe Fonts, icons, and viewport settings
- `components/` — navigation, contact form, scroll effects; `components/portal/` for the client portal
- `public/assets/` — production image and brand files

© Neuravic. All rights reserved.
