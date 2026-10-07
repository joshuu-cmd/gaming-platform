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
6. Participate in real-money games where legally permitted.
7. Deposit money through M-Pesa.
8. Stake money on eligible games.
9. Win legitimate payouts.
10. Withdraw available funds to an M-Pesa wallet.
11. View their wallet and transaction history.
12. Participate in tournaments.
13. Receive notifications.
14. View leaderboards and statistics.

The platform must be designed with strong security, financial integrity, concurrency control, auditability, and reliability.

---

# 2. Critical Requirement: Real Money

The real-money portion of this application must be treated as a financial system, not simply as a game feature.

The system must never rely on the frontend, browser, Redis, or game client to determine a user's financial balance.

PostgreSQL is the authoritative source of truth for all financial records.

The financial architecture must use a ledger-based design.

Never implement financial operations as simple balance modifications such as:

```typescript
user.balance += amount;
```

Instead, all financial movements must be represented by auditable ledger transactions and ledger entries.

Every financial operation must be:

- Atomic
- Idempotent
- Auditable
- Reversible where appropriate
- Protected against race conditions
- Protected against duplicate payment callbacks
- Protected against duplicate settlement
- Protected against double spending

---

# 3. Legal and Compliance Requirement

The platform may involve real-money gaming and therefore must not be launched commercially until all applicable Kenyan legal, gambling, payment, KYC/AML, tax, responsible-gaming, and data-protection requirements have been reviewed and satisfied.

Development should initially use:

- Test/fake money
- Development accounts
- M-Pesa sandbox/test environments where available

Do not bypass licensing, KYC, payment-provider restrictions, age restrictions, responsible-gaming controls, or other applicable requirements.

Production payment functionality must only be enabled after the necessary legal and payment-provider requirements have been satisfied.

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

PostgreSQL is the source of truth for:

- Users
- Games
- Game results
- Wallets
- Ledger
- Deposits
- Withdrawals
- Stakes
- Settlements
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

Redis must NOT be the permanent source of truth for money.

## Payments

- Safaricom M-Pesa Daraja API

The integration must support the appropriate M-Pesa APIs required by the final business/payment model.

Payment callbacks must be processed idempotently.

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
│   │       │   ├── wallet/
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
│           │   ├── wallets/
│           │   ├── ledger/
│           │   ├── payments/
│           │   │   └── mpesa/
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

## Financial

- wallets
- ledger_accounts
- ledger_transactions
- ledger_entries
- deposits
- withdrawals
- payment_provider_events

## Games

- game_types
- game_modes
- games
- game_players
- game_moves
- game_results

## Real-Money Gaming

- stakes
- stake_participants
- settlements

## Tournaments

- tournaments
- tournament_players
- tournament_matches

## Operations and Security

- notifications
- risk_events
- audit_logs

---

# 7. Financial Ledger Rules

The ledger is the authoritative financial record.

A completed ledger transaction must balance:

```text
Total Debits = Total Credits
```

Financial amounts should use:

```text
NUMERIC(18,2)
```

and currency should initially be:

```text
KES
```

Do not use floating-point numbers for money.

A wallet should conceptually contain accounts such as:

```text
AV
```

---

# 8. Getting Started

The current playable prototype includes free Connect Four, Checkers, and Chess. All three support friend rooms, rematches, and a computer opponent with Easy, Medium, or Hard difficulty; rematches keep the selected difficulty. Checkers has optional captures, multi-jumps, kings, and legal-move hints. Chess supports checkmate, castling, en passant, selectable queen/rook/bishop/knight promotion, and claimable and automatic draw conditions. The prototype is intended for local development and does not include accounts or payment functionality. Game state is stored in PostgreSQL and survives API restarts.

Requirements: Node.js 20.19.3 or newer and npm.

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

Open the web app at `http://localhost:5173`. The API runs at `http://localhost:3001`, with a health endpoint at `/api/health`. Choose **Play vs computer** for a solo game, or create a friend room and share its invite link with another browser.

Choose Connect Four, Checkers, or Chess from the game picker. The game server uses the shared engine contract in `packages/game-engines/index.ts`. Each game engine provides current-player lookup, move validation, move application, and completion checks. PostgreSQL stores the game type, current game snapshot, and a revision number; revision checks reject conflicting simultaneous moves. `npm run db:migrate` applies every numbered SQL migration in `database/migrations`.
