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

All imagery used by the current production site is committed under `public/assets/`:

- `hero-art.png` — hero artwork
- `neuravic-logo.png` — primary wordmark
- `neuravic-mark.png` — standalone brand mark and favicon source
- `neuravic-pattern.svg` — exact original Neuravic pattern

Project-image frames intentionally remain empty until original project photography is supplied.

## Local development

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Source structure

- `app/page.tsx` — website content and page structure
- `app/globals.css` — responsive layout, brand styling, and transitions
- `app/layout.tsx` — document metadata, Adobe Fonts, icons, and viewport settings
- `components/` — navigation and interaction behavior
- `public/assets/` — production image and brand files

© Neuravic. All rights reserved.
