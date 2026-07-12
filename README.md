# PaperBane

PaperBane is a low-poly third-person survival-horror browser game and project website for PBANE on Solana. The complete experience runs in a single Vite application with no backend, database, wallet connection, remote models, or paid services.

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The website is served at `/` and the game at `/play`.

## Production build

```bash
npm run build
npm run preview
```

The production output is written to `dist`.

## Vercel

Import the repository into Vercel and use the Vite preset. No environment variables are required. The included `vercel.json` rewrites direct visits to `/play` to the application entry point.

Recommended settings:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## Controls

- WASD: Move
- Mouse: Camera
- Shift: Sprint
- Left Mouse: Light attack
- Right Mouse: Heavy attack
- Space: Dodge
- F: Wick Surge
- Q: Medkit
- E: Interact
- Esc: Pause

## Local records

The boss checkpoint, best completion time, and best rank are stored in the browser with localStorage. No player information is sent to a server.
