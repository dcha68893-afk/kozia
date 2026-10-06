# NECPRA WORLD

Server-authoritative multiplayer 3D social game. First game: **Tube Challenge** (virtual points only, no real-money wagering).

```
necpra-world/
├── backend/    Node.js + TypeScript + PostgreSQL + WebSocket (deploy this to a server)
├── frontend/   Unity 6 (C#) client project (build to Android / WebGL)
├── docker-compose.yml
└── README.md
```

## How they communicate
- **REST** `https://API/api/...` : auth, profile, shop, economy, leaderboards, friends, tournaments, moderation.
- **WebSocket** `wss://API/ws?token=JWT` : world presence, chat, rooms and the tube match.
- The server owns every result. The client sends only `room.pick {slot}`; the server generates the shuffle with `crypto.randomInt`, computes the winner, awards coins/XP/tournament points in PostgreSQL transactions, and enforces a daily coin cap.

## Run locally
```bash
cd backend
npm install
# needs PostgreSQL; or from the repo root: docker compose up --build
npm run dev                 # uses backend/.env (testing values already filled in)
npm run smoke               # end-to-end test: 2 accounts play a full match
```
Frontend: open `frontend/` in Unity Hub (Unity 6 LTS, needs Git installed for the WebSocket package), then menu **Necpra > Build Main Scene**, press Play. Register two accounts (build twice or use the editor + a build) and create/join a room from **Games**; with `ALLOW_SOLO_ROOMS=true` (testing) one player can start alone.

## Deploy live
1. **Database**: managed PostgreSQL (Neon, Supabase, Render, Railway, RDS). Copy its URL.
2. **Backend**: deploy `backend/` (Dockerfile included) on Render / Railway / Fly.io / a VPS. It must support WebSockets and HTTPS. Set env vars from `backend/.env.example`:
   - `DATABASE_URL`, `DATABASE_SSL=true`, `NODE_ENV=production`
   - `JWT_SECRET` (48+ random bytes), `CORS_ORIGINS` (your WebGL site origin; native apps send no origin), `ALLOW_SOLO_ROOMS=false`
   Tables and shop items are created automatically on boot. Health check: `GET /health`.
3. **Client config**: edit `frontend/Assets/Resources/appconfig.json`:
   `{ "apiBase": "https://api.yourdomain.com", "wsBase": "wss://api.yourdomain.com" }`
4. **Build**: Android (File > Build Settings > Android) or WebGL (host the build folder on any static host, add its origin to `CORS_ORIGINS`).
5. Verify: `BASE_URL=https://api.yourdomain.com npm run smoke` (creates test accounts).
6. Make a moderator: `UPDATE users SET role='moderator' WHERE username='you';` then use `/api/mod/reports`, `/api/mod/ban`.

## Implemented
Accounts (bcrypt + JWT), lockout-safe rate limits, level/XP and 6 character evolution stages (skeleton to legendary), customizable body/hair/skin, clothing shop with level and gem gates, equip system, coins/gems/tickets, daily reward, 3 world zones with live multiplayer presence and speed/bounds validation, zone/private/room chat with word filter and flood limits, emotes (ownership checked), friends, blocks, reports, moderator ban/report tools, public/private tube rooms (2-4 players, spectators, invites, reconnect), server-run rounds with rising difficulty, daily and weekly tournaments with ticket entry and automatic prize payout, weekly/global/wins/friends leaderboards, achievements, cinematic camera shots at the table.

## Not implemented (be aware)
- **Art and audio**: characters are procedural primitives (capsules/spheres) with proper look data; swap `AvatarView.Build` for rigged human models (e.g. Mixamo) and add sound. No hand/cup animation.
- UI is functional IMGUI, not styled uGUI/UI Toolkit.
- Restaurant ordering, NPC staff AI, voice chat, personal rooms, clubs, seasons, vehicles and the other mini-games are not built. The restaurant is an empty zone.
- Presence/rooms are in server memory: run **one backend instance** (add Redis pub/sub before scaling horizontally).
- The Unity client was written without a Unity editor available, so expect small first-compile fixes. The backend was fully tested (TypeScript build + PostgreSQL + WebSocket end-to-end).
- A player can in theory automate tracking the ball; the daily coin cap, 2-player minimum and rate limits limit farming.


## Production architecture added

- Competitive matches now isolate Water Sort, Block Puzzle and Memory state per player.
- Trivers, Crossword, Chess, Racing and Team Strategy have server-side competitive engines and scoring.
- Match results settle transactionally in PostgreSQL; clients cannot submit final scores.
- Match actions receive server-side sequencing/rate checks and are persisted to anti-cheat audit tables.
- Render Key Value/Valkey support is included through `REDIS_URL` and production requires shared state by default.
- `render.yaml` provisions the API, PostgreSQL and Valkey architecture for a live deployment.
- Mobile runtime automatically selects conservative quality/FPS settings on lower-memory Android/iOS devices.

### Live deployment requirements

The repository is production-oriented, but **AAA art and real-device QA cannot be truthfully completed from source control alone**. The Unity project still needs imported production character meshes/rigs, mocap clips, hotel/environment asset packs, VFX, music/SFX, lighting/post-processing profiles, and final Android/iOS signing/build testing on physical devices.

Render WebSocket services are supported, and Key Value is Redis-compatible/Valkey-backed. For horizontal scaling, keep the API and Key Value in the same Render region and use the internal connection string. Production Key Value should use persistence on a paid plan; the free instance is suitable only for temporary testing. Render's Key Value service is Valkey 8 and is compatible with Redis clients. 
