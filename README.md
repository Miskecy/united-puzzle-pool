# United Puzzle Pool

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-v19.2.0-61DAFB)](https://react.dev/)
[![Runtime Build and Test](<https://img.shields.io/badge/(Runtime)%20Build%20and%20Test-passing-brightgreen>)](#getting-started)
[![Compiler TypeScript](<https://img.shields.io/badge/(Compiler)%20TypeScript-passing-brightgreen>)](https://www.typescriptlang.org/)

A collaborative Bitcoin puzzle mining pool where users work together to solve Bitcoin puzzles by searching for private keys in specific hex ranges.

## Online Project

Visit https://unitedpuzzlepool.com/ to join the live pool:

-   Collaborative work to cover more ground
-   Fair rewards for contributed compute if my personal RIG finds a solution
-   Focused targets for hardware efficiency
-   Intelligent distribution to avoid duplicated effort

Create your account and start contributing.

## Self-Hosting

You can run your own instance of United Puzzle Pool.

### Docker Compose

Prerequisites: Docker and Docker Compose.

1. Copy `compose.yaml` to your server and adjust environment variables as needed (`SETUP_SECRET`, `APP_URL`, `REDIS_URL`, `DATABASE_URL`).
2. Build and start:

    ```bash
    docker compose up -d --build
    ```

3. Open `http://localhost:3000/setup` and sign in with your `SETUP_SECRET` to configure puzzles.
4. Data persists in the `app-data` volume at `/data/dev.db`.

### Dockge

If you use Dockge to manage Compose stacks:

1. Create a new stack and paste the contents of `compose.yaml`.
2. Set environment variables (`SETUP_SECRET`, `APP_URL`, `REDIS_URL`).
3. Deploy the stack and access `http://localhost:3000/setup` to complete configuration.

### Docker (direct)

Alternatively, build and run the image directly:

```bash
docker build -t united-puzzle-pool .
docker run -d -p 3000:3000 \
  -e SETUP_SECRET="change-me" \
  -e APP_URL="http://localhost:3000" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e DATABASE_URL="file:/data/dev.db" \
  -v app-data:/data \
  --name upp united-puzzle-pool
```

On container start, database migrations run automatically.

## Environment Configuration

Create a `.env` file in the root directory with:

```env
# Setup access secret (required for /setup and admin API)
SETUP_SECRET="change-me"

# Prisma (SQLite dev) is preconfigured; no external DB required for local dev

# Application base URL (used in docs and clients)
# If empty, defaults to http://localhost:3000
APP_URL="http://localhost:3000"
# Exposed to client-side pages for code snippets
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Setup Access

-   The `/setup` page requires `SETUP_SECRET`. On successful login, a short-lived HttpOnly cookie is set for admin access.
-   Admin actions on `/setup/config` and related API routes are guarded by this cookie and do not expose the secret in the URL.

## Getting Started

1. **Install dependencies:**

    ```bash
    npm install
    ```

2. **Set up your environment variables** (see Environment Configuration above)

3. **Run database migrations:**

    ```bash
    npx prisma migrate dev
    ```

4. **Start the development server:**

    ```bash
    npm run dev
    ```

5. **Open `${APP_URL}` in your browser**

## How to Use

### 1. Generate a Token

Visit the homepage and click "Generate Token" or use the API (replace with your `${APP_URL}`):

```bash
curl -X POST ${APP_URL}/api/token/generate
```

### 2. Get a Block Assignment

Use your token to get a block assignment:

```bash
curl -H "pool-token: YOUR_TOKEN" ${APP_URL}/api/block
```

### 3. Mine the Block

Use your mining software to search the assigned hex range for valid private keys. The response includes:

-   `hexRangeStart` and `hexRangeEnd`: Your search range
-   `checkworkAddresses`: 10 Bitcoin addresses to check against

### 4. Submit Solutions

When you find a valid private key, submit it to claim your reward.

## API Endpoints

### Pool

-   `POST /api/token/generate` — Generate a new mining token
-   `GET /api/block` — Get block assignment (requires `pool-token`)
-   `POST /api/block/submit` — Submit 10–30 private keys; marks block complete and awards credits. If a submitted key derives the puzzle address, the active puzzle is auto-marked solved.
-   `GET /api/pool/stats` — Get pool statistics
-   `GET /api/user/stats` — Get user statistics (requires `pool-token`)
-   `GET /api/user/history` — Get user block history (requires `pool-token`)

### Credits

-   `POST /api/credits/transfer/init` — Initialize a credits transfer. Headers: `pool-token` or `Authorization: Bearer <token>`. Body: `{ toAddress: string, amount: number }`. Returns a signed message template and `nonce` to be signed with the sender’s Bitcoin address.
-   `POST /api/credits/transfer/confirm` — Confirm a credits transfer. Headers: `pool-token` or `Authorization: Bearer <token>`. Body: `{ nonce: string, signature: string }`. Verifies the signature and deducts credits; responds with remaining credits.

### Shared Pool API

-   `GET /api/shared` — Query validation status for a hex range. Headers: `x-shared-secret` or `shared-pool-token`. Query: `?start=<hex64>&end=<hex64>`. Returns status `VALIDATED`, `ACTIVE`, `PARTIAL`, or `NOT_FOUND` with aggregated `checkwork_addresses` and `privatekeys` when applicable.
-   `POST /api/shared` — Submit validated private keys and checkwork addresses for a hex range. Headers: `x-shared-secret` or `shared-pool-token`. Body includes `startRange`, `endRange`, `checkworks_addresses`, `privatekeys`, and optional `puzzleaddress`.
-   `POST /api/shared/token/generate` — Generate or rotate a shared pool token for a configured puzzle. Body: `{ puzzleaddress: string }`. Returns `{ token }`.

### Setup & Admin

-   `POST /api/setup/login` — Login with header `x-setup-secret: <secret>`. Sets HttpOnly cookie `setup_session=1` for admin access.
-   `GET /api/config` — List puzzles (requires admin cookie or `x-setup-secret`)
-   `POST /api/config` — Create puzzle: `{ name?, address, startHex, endHex, solved? }` (admin)
-   `PATCH /api/config/:id` — Update puzzle fields, including `solved` (admin)
-   `DELETE /api/config/:id` — Delete puzzle; active deletion requires `?force=true` or header `x-force-delete: true` (admin)
-   `PATCH /api/config/active` — Set active puzzle: `{ id }` (admin)
-   `GET /api/config/backup` — Download SQLite DB file (admin). The download filename includes a timestamp: `dev-YYYY-MM-DD_HH-mm-ss.db`.
-   `POST /api/config/backup` — Restore DB from uploaded file (admin)
-   `GET /api/puzzle/info` — Returns current puzzle metadata; responds `404` if no active puzzle configured

#### Database Backup & Restore Notes

-   Local development should use `DATABASE_URL=file:./prisma/dev.db` so Prisma reads/writes the database under the `prisma/` folder.
-   The Restore API resolves relative `file:` URLs to `prisma/` by default. If your `DATABASE_URL` points outside `prisma/`, update it and restart the app.
-   Verify live state via `GET /api/config/backup?status=1` (admin). The response includes `envUrl`, `dbFile`, `tables`, `tableNames`, and `sizeBytes`.
-   On `/setup/config`, use “Database Status” to check configuration and see a warning if `DATABASE_URL` is misconfigured.

### Notes on Credits

-   Credits are tracked internally in milliunits and exposed with up to 3 decimal places.
-   Transfers require signing the message returned by `/api/credits/transfer/init` using the Bitcoin address associated with the token.

### Notes on Shared API

-   Shared API can be enabled/disabled via `app_config.shared_pool_api_enabled` and supports either a secret header or a registered token.

### Notes

-   Key Range (Bits) is displayed in UI as `2^min…2^max`, derived from hex ranges.
-   Setup/config page is organized into sections: Database Backup & Restore, Active Puzzle, Add New Puzzle, and Puzzles.
-   In Setup → All Puzzles, each entry shows its Start and End hex ranges for quick inspection.

## Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
