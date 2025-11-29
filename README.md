# United Pool

A collaborative Bitcoin puzzle mining pool where users work together to solve Bitcoin puzzles by searching for private keys in specific hex ranges.

## Environment Configuration

Create a `.env` file in the root directory with:

```env
# Setup access secret (required for /setup and admin API)
SETUP_SECRET="change-me"

# Prisma (SQLite dev) is preconfigured; no external DB required for local dev
```

### Setup Access

- The `/setup` page requires `SETUP_SECRET`. On successful login, a short-lived HttpOnly cookie is set for admin access.
- Admin actions on `/setup/config` and related API routes are guarded by this cookie and do not expose the secret in the URL.

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

5. **Open [http://localhost:3000](http://localhost:3000) in your browser**

## How to Use

### 1. Generate a Token

Visit the homepage and click "Generate Token" or use the API:

```bash
curl -X POST http://localhost:3000/api/token/generate
```

### 2. Get a Block Assignment

Use your token to get a block assignment:

```bash
curl -H "pool-token: YOUR_TOKEN" http://localhost:3000/api/block
```

### 3. Mine the Block

Use your mining software to search the assigned hex range for valid private keys. The response includes:

-   `hexRangeStart` and `hexRangeEnd`: Your search range
-   `checkworkAddresses`: 10 Bitcoin addresses to check against

### 4. Submit Solutions

When you find a valid private key, submit it to claim your reward.

## API Endpoints

### Pool

- `POST /api/token/generate` — Generate a new mining token
- `GET /api/block` — Get block assignment (requires `pool-token`)
- `POST /api/block/submit` — Submit 10–30 private keys; marks block complete and awards credits. If a submitted key derives the puzzle address, the active puzzle is auto-marked solved.
- `GET /api/pool/stats` — Get pool statistics
- `GET /api/user/stats` — Get user statistics (requires `pool-token`)
- `GET /api/user/history` — Get user block history (requires `pool-token`)

### Setup & Admin

- `POST /api/setup/login` — Login with header `x-setup-secret: <secret>`. Sets HttpOnly cookie `setup_session=1` for admin access.
- `GET /api/config` — List puzzles (requires admin cookie or `x-setup-secret`)
- `POST /api/config` — Create puzzle: `{ name?, address, startHex, endHex, solved? }` (admin)
- `PATCH /api/config/:id` — Update puzzle fields, including `solved` (admin)
- `DELETE /api/config/:id` — Delete puzzle; active deletion requires `?force=true` or header `x-force-delete: true` (admin)
- `PATCH /api/config/active` — Set active puzzle: `{ id }` (admin)
- `GET /api/config/backup` — Download SQLite DB file (admin)
- `POST /api/config/backup` — Restore DB from uploaded file (admin)
- `GET /api/puzzle/info` — Returns current puzzle metadata; responds `404` if no active puzzle configured

### Notes

- Key Range (Bits) is displayed in UI as `2^min…2^max`, derived from hex ranges.
- Setup/config page is organized into sections: Database Backup & Restore, Active Puzzle, Add New Puzzle, and Puzzles.

## Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
