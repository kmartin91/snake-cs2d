# Snake CS2D

A multiplayer browser game that mixes Snake with Counter-Strike objectives.

## Gameplay Mix

- Players are auto-assigned to `T` (Terrorists) or `CT` (Counter-Terrorists).
- Each player is a snake that grows by collecting ammo crates.
- `T` players must pick up the bomb, reach center site, and hold `E` to plant.
- `CT` players must hold `E` on the planted bomb to defuse.
- Snake collision rules still apply: hit a body/head, die, then respawn.
- Rounds score by objective and eliminations, first team to 13 rounds wins.
- Sides swap after 12 completed rounds.

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000)

## Multiplayer Hosting Strategy

This project has 2 parts:

- Frontend: static files in `public/`
- Realtime backend: `server.js` (Node + Socket.IO)

For internet multiplayer, host the backend on a Node host (Render, Railway, Fly.io, etc.) and connect frontend to it.

## Netlify

Yes, you can upload this to Netlify for the frontend.

- Netlify can host `public/` with `netlify.toml` already configured.
- The multiplayer Socket.IO server **cannot** run on Netlify static hosting.
- Use a separate Node host for `server.js`, then in the game enter your backend URL in **Server URL (optional)**.

Example backend URL:

`https://your-snakecs2d-backend.onrender.com`

## Suggested Deploy Setup

1. Deploy backend (`server.js`) to Render/Railway/Fly.
2. Deploy frontend (`public/`) to Netlify.
3. Open your Netlify app and set the backend URL in the join form.

## Render Blueprint

A ready-to-use Render blueprint is included:

- [render.yaml](/Users/k.martin/Documents/Dev/Javascript/Perso/SnakeCS2D/render.yaml)

It creates:

- `snakecs2d-backend` (Node web service for Socket.IO)
- `snakecs2d-frontend` (static site for `public/`)
