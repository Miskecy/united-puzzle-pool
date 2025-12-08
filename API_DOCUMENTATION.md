# API Documentation - United Puzzle Pool

## Overview

This API allows users to participate in a mining pool to solve Bitcoin puzzles. The system assigns private key ranges (blocks) to each user and verifies submitted solutions.

Base URL: set `APP_URL` in the `.env` file (default `http://localhost:3000`).

## Initial Setup

### 1. Generate Access Token

**Endpoint:** `POST /api/token/generate`

**Description:** Generates a new access token for the user.

**Method:** POST

**Headers:** None required

**Body:** None required

**Success Response (200):**

```json
{
    "token": "your-token-here-12345",
    "bitcoinAddress": "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
    "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Get User Stats

**Endpoint:** `GET /api/user/stats`

**Description:** Returns statistics for the user associated with the token.

**Method:** GET

**Headers:**

-   `pool-token`: Your access token

**Success Response (200):**

```json
{
    "token": "your-token-here-12345",
    "bitcoinAddress": "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
    "totalBlocks": 5,
    "completedBlocks": 2,
    "pendingBlocks": 1,
    "totalCredits": 100,
    "availableCredits": 75,
    "activeBlock": {
        "id": 39359,
        "startRange": "0x6280b9fa585e522400",
        "endRange": "0x6280b9fe585e5223ff",
        "assignedAt": "2024-01-01T12:00:00.000Z",
        "expiresAt": "2024-01-01T24:00:00.000Z"
    }
}
```

## Block Operations

### 3. Get or Assign New Block

**Endpoint:** `GET /api/block`

**Description:** Returns an existing active block or assigns a new block to the user.

All assignments respect the **active puzzle** configured in the system. The returned range will always be within `[puzzleStart, puzzleEnd)` of the puzzle marked as active, with no overlap with existing `ACTIVE` or `COMPLETED` blocks.

**Method:** GET

**Headers:**

-   `pool-token`: Your access token

**Success Response (200):**

```json
{
    "id": 39359,
    "status": 0,
    "range": {
        "start": "0x6280b9fa585e522400",
        "end": "0x6280b9fe585e5223ff"
    },
    "checkwork_addresses": [
        "15VniC13nbt36dWrWirJ2xULudEZsKHY6n",
        "15ssGwttX1D164mE7LFS3UuEuptL4idQbL",
        "1LcJh7GSph6MigGgxnEDFCvmm6SQXo5NLq",
        "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
        "186kr4Zr3y6wpFubbgM91rdkKHy5v2dAVq",
        "17c1ExfSLwbesg4Ab8sgRvQ5PE56ay13K8",
        "1HH4q2FMmNNQZcEn7gSx1PHM6bCi1DDRzm",
        "15h6UUYjj7DGrHFEdcwugyp3YBEkSwxxU2",
        "1CmkXXwKraj7Udx6qYN7TJLLDUNWGFUVjR",
        "1QAr3zZh51moodnx2EE5QkJJbq7K9h7dFb"
    ],
    "message": "New block assigned successfully"
}
```

### 4. Submit Block Solution

**Endpoint:** `POST /api/block/submit`

**Description:** Submits found private keys for verification.

**Method:** POST

**Headers:**

-   `pool-token`: Your access token
-   `Content-Type`: application/json

**Body:**

```json
{
    "privateKeys": [
        "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
        "0x000000000000000000000000000000000000000000000004388c2b47d768be72",
        "0x000000000000000000000000000000000000000000000004388c2b55de07d1b2",
        "0x000000000000000000000000000000000000000000000004388c2a6dbcffbea8",
        "0x000000000000000000000000000000000000000000000004388c2a9eeacb6d18",
        "0x000000000000000000000000000000000000000000000004388c2ad8867a6d91",
        "0x000000000000000000000000000000000000000000000004388c2ae80c90c4f3",
        "0x000000000000000000000000000000000000000000000004388c2b05519385c6",
        "0x000000000000000000000000000000000000000000000004388c2b208cda0dcd",
        "0x000000000000000000000000000000000000000000000004388c2b23e5a02d10"
    ]
}
```

**Submission Rules:**

-   Send between **10 and 30** private keys (64-character hex; `0x` prefix accepted).
-   The submitted keys must cover all addresses in `checkwork_addresses` (may be fewer than 10); extra keys are allowed.
-   If any submitted key derives the puzzle Bitcoin address, it will be securely recorded by the system.

**Success Response (200):**

```json
{
    "success": true,
    "message": "Block submitted successfully",
    "results": [
        {
            "privateKey": "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
            "address": "15VniC13nbt36dWrWirJ2xULudEZsKHY6n",
            "isValid": true
        }
        // ... results for the 10 keys
    ],
    "creditsEarned": 10,
    "flags": { "puzzleDetected": true }
}
```

## Credit Transfers

### 5. Initiate Transfer

**Endpoint:** `POST /api/credits/transfer/init`

**Description:** Starts a credit transfer session. Returns a message and a `nonce` that must be signed using the Bitcoin address associated with your token.

**Headers:**

-   `pool-token: your-token-here-12345` or `Authorization: Bearer your-token-here-12345`

**Body:**

```json
{
    "toAddress": "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
    "amount": 12.345
}
```

**Success Response (200):**

```json
{
    "message": "United Puzzle Pool Credit Transfer\nToken: ...\nFrom: ...\nTo: ...\nAmount: 12.345\nNonce: abc123...\nTimestamp: 2025-11-29T18:45:00.000Z",
    "nonce": "abc123...",
    "amount": 12.345,
    "fromAddress": "1...",
    "toAddress": "1..."
}
```

### 6. Confirm Transfer

**Endpoint:** `POST /api/credits/transfer/confirm`

**Description:** Verifies the signature of the message from the initialization step and finalizes the credits transfer.

**Headers:**

-   `pool-token` or `Authorization: Bearer` (same token used at initialization)

**Body:**

```json
{
    "nonce": "abc123...",
    "signature": "H3r...XQ=="
}
```

**Success Response (200):**

```json
{
    "success": true,
    "spentAmount": 12.345,
    "newAvailableCredits": 87.655,
    "transactionId": "txn_123"
}
```

### Credit Notes

1. Credits are stored internally in milliunits and exposed with up to 3 decimal places.
2. Signing uses `bitcoinjs-message.verify` over the message returned by `/api/credits/transfer/init`.
3. The Bitcoin address used must be the same one associated with your token.

## Shared Pool API

### 7. Query Validation Status

**Endpoint:** `GET /api/shared`

**Headers:**

-   `x-shared-secret: <secret>` or `shared-pool-token: <token>`

**Query:**

-   `start`: 64-character hex (`0x...`)
-   `end`: 64-character hex (`0x...`)

Note: The queried range must be contained within the active puzzle. Otherwise, the service returns `409`.

**Response:**

```json
{
    "status": "VALIDATED|ACTIVE|PARTIAL|NOT_FOUND",
    "checkwork_addresses": ["..."],
    "privatekeys": ["..."],
    "blockId": "..."
}
```

Common errors:

-   `409`: Range outside the active puzzle

### 8. Submit Shared Validation

**Endpoint:** `POST /api/shared`

**Headers:**

-   `x-shared-secret` or `shared-pool-token`

**Body:**

```json
{
    "startRange": "0x...",
    "endRange": "0x...",
    "checkworks_addresses": ["..."],
    "privatekeys": ["..."],
    "puzzleaddress": "1..."
}
```

Note: The submitted range must be contained within the active puzzle. Otherwise, the service returns `409` and does not record the validation.

### 9. Generate Token for Shared Pool

**Endpoint:** `POST /api/shared/token/generate`

**Body:**

```json
{ "puzzleaddress": "1..." }
```

**Response:**

```json
{ "token": "..." }
```

## Full User Flow

### Step 1: Generate Token

```bash
curl -X POST ${APP_URL}/api/token/generate
```

### Step 2: Store Token

Save the received token in localStorage or an environment variable:

```javascript
localStorage.setItem('pool-token', 'your-token-here-12345');
```

### Step 3: Get Stats

```bash
curl -X GET ${APP_URL}/api/user/stats \
  -H "pool-token: your-token-here-12345"
```

### Step 4: Get Work Block

```bash
curl -X GET ${APP_URL}/api/block \
  -H "pool-token: your-token-here-12345"
```

### Step 5: Process Block

Use your cracking/mining software to process the private key range:

-   Start range: `0x6280b9fa585e522400`
-   End range: `0x6280b9fe585e5223ff`

### Step 6: Submit Results

When you find valid private keys:

```bash
curl -X POST ${APP_URL}/api/block/submit \
  -H "pool-token: your-token-here-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "privateKeys": [
      "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
      // ... plus more keys totaling 10–30
    ]
  }'
```

## Error Codes

-   `400`: Invalid request (malformed JSON, incorrect data)
-   `401`: Token not provided or invalid
-   `405`: HTTP method not allowed
-   `500`: Internal server error

## Puzzle Information

-   **Puzzle Bitcoin Address**: example `1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9`
-   **Start Range**: depends on the active puzzle (hex)
-   **End Range**: depends on the active puzzle (hex)

## Important Notes

1. All APIs operate strictly within the **active puzzle**. Ranges outside the active puzzle are rejected.
2. Each block contains up to 10 checkwork addresses; smaller assigned ranges may include fewer.
3. You must submit between 10 and 30 private keys in the POST.
4. Each block is valid for 12 hours.
5. Credits are earned when valid keys are found.
6. Use the web dashboard to view your progress and manage tokens.
