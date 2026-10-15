# Gaming Platform

## 1. Project Overview

This project is a full-stack online gaming platform where registered users can play multiple games against bots or other users.

The initial games are:

- Chess
- Checkers
- Connect Four
- Ludo
- Pool

Users must be able to:

1. Create an account and log in.
2. Manage their profile.
3. Play games against bots for free.
4. Play games against other registered users.
5. Participate in ranked/casual games.
6. Participate in tournaments.
7. Receive notifications.
8. View leaderboards and statistics.

The platform must be designed with strong security, concurrency control, and reliability.

---

# 2. Security and Data

Game state is stored in PostgreSQL. Account credentials are hashed, and browser sessions use HTTP-only cookies.

---

# 4. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Modern responsive UI

## Backend

- Node.js
- TypeScript
- Express or Fastify
- REST API
- Socket.IO/WebSockets for real-time gameplay

## Database

- PostgreSQL

PostgreSQL stores:

- Users
- Games
- Game results
- Tournaments
- Audit records

## Cache / Real-Time Infrastructure

- Redis

Redis may be used for:

- Matchmaking queues
- Temporary game state
- Distributed locks where appropriate
- Rate limiting
- Sessions/cache
- Real-time coordination

## Deployment

The application should be container-friendly and support:

- Docker
- PostgreSQL
- Redis
- Node.js
- Nginx/Caddy or equivalent reverse proxy
- HTTPS
- Environment variables
- Logging
- Monitoring

---

# 5. Existing Project Structure

The root project structure is:

```text
gaming-platform/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── layouts/
│   │       ├── pages/
│   │       │   ├── auth/
│   │       │   ├── dashboard/
│   │       │   ├── games/
│   │       │   ├── profile/
│   │       │   ├── leaderboard/
│   │       │   └── admin/
│   │       ├── services/
│   │       ├── hooks/
│   │       ├── stores/
│   │       ├── types/
│   │       └── main.tsx
│   │
│   └── server/
│       └── src/
│           ├── config/
│           ├── database/
│           ├── middleware/
│           ├── modules/
│           │   ├── auth/
│           │   ├── users/
│           │   ├── profiles/
│           │   ├── kyc/
│           │   ├── games/
│           │   │   └── engines/
│           │   │       ├── chess/
│           │   │       ├── checkers/
│           │   │       ├── connect4/
│           │   │       ├── ludo/
│           │   │       └── pool/
│           │   ├── matchmaking/
│           │   ├── stakes/
│           │   ├── settlements/
│           │   ├── tournaments/
│           │   ├── leaderboards/
│           │   ├── notifications/
│           │   ├── fraud/
│           │   └── admin/
│           ├── realtime/
│           ├── workers/
│           ├── routes/
│           ├── app.ts
│           └── server.ts
│
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── game-engines/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── diagrams/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker/
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Do not restructure the project unnecessarily.

If architectural changes are required, explain the reason before making major structural changes.

---

# 6. Database Architecture

The database should contain the following major domains.

## Identity

- users
- profiles
- sessions
- kyc_profiles

## Games

- game_types
- game_modes
- games
- game_players
- game_moves
- game_results

## Tournaments

- tournaments
- tournament_players
- tournament_matches

## Operations and Security

- notifications
- risk_events
- audit_logs

---

# 8. Getting Started

The current playable prototype includes free Connect Four, Checkers, and Chess. All three support friend rooms, rematches, and a computer opponent with Easy, Medium, or Hard difficulty; rematches keep the selected difficulty. Checkers has optional captures, multi-jumps, kings, and legal-move hints. Chess supports checkmate, castling, en passant, selectable queen/rook/bishop/knight promotion, and claimable and automatic draw conditions. Game state is stored in PostgreSQL and survives API restarts.

Requirements: Node.js 20.19.3 or newer and npm.

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

Open the web app at `http://localhost:5173`. The API runs at `http://localhost:3001`, with a health endpoint at `/api/health`. Choose **Play vs computer** for a solo game, or create a friend room and share its invite link with another browser.

## Accounts

Run `npm run db:migrate` after pulling account changes. New games and new rooms require an account. Existing guest games stored before account support remain accessible through their existing links.

Account creation asks for a display name, email, phone number in international format (for example `+2547…`), and a password of at least 6 characters. No verification codes are required; users are signed in after signup and can later sign in with their email or phone and password. Email addresses and phone numbers are unique. Passwords are hashed, and browser sessions use an HTTP-only cookie.

Password reset codes can be delivered by [Resend](https://resend.com/docs/api-reference/emails/send-email). Configure `AUTH_CHALLENGE_SECRET` (at least 32 random characters), `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` to enable email resets; these settings are optional for signup and login.

Choose Connect Four, Checkers, or Chess from the game picker. The game server uses the shared engine contract in `packages/game-engines/index.ts`. Each game engine provides current-player lookup, move validation, move application, and completion checks. PostgreSQL stores the game type, current game snapshot, and a revision number; revision checks reject conflicting simultaneous moves. `npm run db:migrate` applies every numbered SQL migration in `database/migrations`.
