# Backend Initialization

This document summarizes the backend setup completed for the Financial Litter project. It explains the purpose of each component so that future contributors (or future us) understand the architecture.

---

# 1. Database

We use **PostgreSQL** hosted on **Neon**.

The database schema is defined using **Prisma ORM**.

```
prisma/
│
├── schema.prisma
├── migrations/
└── prisma.config.ts
```

The schema contains the following models:

- User
- Session
- Account
- Transaction
- Loan
- Investment
- Bill
- Budget

After creating the schema, the initial migration was generated using

```bash
npx prisma migrate dev --name init
```

which created all tables in the Neon PostgreSQL database.

---

# 2. Prisma Client

A Prisma Client was generated from the schema.

```bash
npx prisma generate
```

Unlike older Prisma versions, Prisma 7 requires a **driver adapter**.

Current implementation:

```ts
import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
    adapter,
});

export default prisma;
```

This file lives in

```
apps/api/src/lib/prisma.ts
```

Every database operation in the backend imports this file.

No other file should instantiate `new PrismaClient()`.

---

# 3. Express Server

The API server is written using Express.

Entry point:

```
apps/api/src/index.ts
```

Responsibilities:

- create Express application
- enable JSON middleware
- register routes
- start HTTP server

Current server startup:

```ts
const app = express();

app.use(express.json());

app.use("/auth", authRoutes);

app.listen(PORT);
```

---

# 4. Development

Instead of ts-node-dev, the project uses **tsx**.

Run the backend with

```bash
npm run dev
```

Current script

```json
"scripts": {
    "dev": "tsx watch apps/api/src/index.ts"
}
```

---

# 5. Project Structure

Current backend structure

```
apps/
└── api/
    └── src/
        ├── index.ts
        ├── lib/
        │   └── prisma.ts
        ├── routes/
        │   └── auth.ts
        ├── controllers/
        │   └── authController.ts
        ├── services/
        │   └── authService.ts
        ├── middleware/
        └── utils/
            └── validation.ts
```

Feature folders for Accounts, Transactions, Bills, etc. will be added only when those features are implemented.

---

# 6. Architecture

The backend follows a layered architecture.

```
Client
    │
HTTP Request
    │
    ▼
Route
    │
    ▼
Controller
    │
    ▼
Service
    │
    ▼
Prisma
    │
    ▼
PostgreSQL
```

---

## Route

Routes define endpoints and map them to controllers.

Example

```ts
router.post("/signup", signup);
```

Routes should contain no business logic.

---

## Controller

Controllers work with Express.

Responsibilities

- receive request
- validate request
- call service
- send HTTP response

Controllers should not:

- hash passwords
- query Prisma directly
- implement business rules

---

## Service

Services contain business logic.

Examples

- create user
- hash password
- verify login
- create JWT
- create session

Services do not know anything about Express.

They receive plain objects and return plain objects.

---

## Prisma

Prisma is responsible only for communicating with PostgreSQL.

Examples

```ts
await prisma.user.create(...)
await prisma.user.findUnique(...)
```

No request handling should occur here.

---

# 7. Request Validation

The project uses **Zod**.

Validation schemas live in

```
utils/validation.ts
```

Current schema

```ts
export const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
});
```

Controllers validate requests before calling services.

Invalid requests never reach the database.

---

# 8. Authentication Progress

Current implementation

```
GET /auth/ping
```

Flow

```
Browser
    │
GET /auth/ping
    │
    ▼
Route
    │
    ▼
Controller
    │
    ▼
Service
    │
    ▼
Response
```

Response

```json
{
    "message": "Auth service is working!"
}
```

---

# 9. Signup Flow (In Progress)

Target endpoint

```
POST /auth/signup
```

Planned flow

```
Validate Request (Zod)
        │
        ▼
Check Existing Email
        │
        ▼
Hash Password (bcrypt)
        │
        ▼
Create User (Prisma)
        │
        ▼
Return HTTP 201
```

---

# 10. Dependencies

Core

- Express
- Prisma
- PostgreSQL
- Neon
- TypeScript

Authentication

- bcrypt
- jsonwebtoken

Validation

- Zod

Development

- tsx

Prisma Runtime

- @prisma/adapter-pg
- pg

---

# 11. Principles

- One Prisma client for the whole application.
- Validation happens before business logic.
- Controllers remain thin.
- Services contain business logic.
- Routes only map endpoints.
- Database logic stays inside services through Prisma.
- Every new feature follows the same Route → Controller → Service → Prisma pattern.

---

# Next Milestone

Implement

```
POST /auth/signup
```

with:

- Zod validation
- Duplicate email detection
- Password hashing
- User creation
- Proper HTTP status codes

After signup is complete, implement

```
POST /auth/login
```

which introduces:

- JWT generation
- Session creation
- Authentication middleware