# NECPRA WORLD — Browser Client

This is a new browser client for the existing NECPRA WORLD backend. It does not replace the Unity client.

## Run locally

1. Keep the backend running on `http://localhost:3000`.
2. From the repository root:

```powershell
cd web
npm install
npm run dev
```

3. Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

The client defaults to:
- HTTP API: `http://localhost:3000`
- WebSocket: `ws://localhost:3000`

Override them with Vite variables when needed:

```powershell
$env:VITE_API_BASE="http://localhost:3000"
$env:VITE_WS_BASE="ws://localhost:3000"
npm run dev
```

## Current browser slice

- register/login against the real backend
- JWT session persistence
- Three.js 3D hotel/world shell
- Lobby, restaurant and game-hall zones
- local third-person movement with WASD/arrows and sprint
- server-authoritative movement correction
- live WebSocket player presence/interpolation
- zone chat
- live game catalog
- create/join match by code
- ready/start/leave match controls
- live match scoreboard/status events

The backend remains authoritative for identity, movement validation, social rules, rooms, matches, scores and rewards.

## Important

This is a playable browser vertical slice, not a claim that every Unity feature has already been ported. Game-specific browser controls (Water Sort, Block Puzzle, Reaction, Memory and the advanced competitive games) should be added against the existing authoritative match protocol rather than duplicating game authority in the browser.
