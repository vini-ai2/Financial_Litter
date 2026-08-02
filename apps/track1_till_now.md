# Financial Litter - Backend Initialization

## Project Setup

Repository initialized.

Current structure:

```
Financial_Litter/
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── controllers/
│   │       ├── lib/
│   │       │   └── prisma.ts
│   │       ├── middleware/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── utils/
│   │       └── index.ts
│   │
│   └── web/
│
├── packages/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── prisma.config.ts
├── .env
├── package.json
└── package-lock.json
```

---

# Database

Database provider:
- PostgreSQL

Hosting:
- Neon

Migration status:
- Initial migration successfully applied

```
npx prisma migrate dev --name init
```

completed successfully.

Prisma Client generated successfully.

---

# Prisma

Prisma v7 is being used.

Important:

Unlike Prisma 6, Prisma 7 requires a Driver Adapter.

Current prisma.ts

```ts
// uses PrismaPg adapter
```

Database connection is working.

---

# Environment

Root `.env`

Contains

- DATABASE_URL

pointing to the Neon database.

---

# Server

Backend uses

- Express
- TypeScript
- tsx watch

Development server

```
npm run dev
```

starts successfully.

Server currently exposes

```
GET /
```

returns

```json
{
    "message": "Auth service is working!"
}
```

This is only a health check.

---

# Packages Installed

Backend

- express
- prisma
- @prisma/client
- @prisma/adapter-pg
- pg
- bcrypt
- dotenv

Development

- typescript
- tsx
- @types/node
- @types/express
- @types/bcrypt

---

# Folder Architecture

Current backend follows

```
Request
    ↓
Route
    ↓
Controller
    ↓
Service
    ↓
Prisma
    ↓
PostgreSQL
```

---

# Completed

✅ Neon database connected

✅ Prisma migration

✅ Prisma client generation

✅ Express server

✅ Prisma singleton

✅ Backend folder organization

---

# Pending (Track A)

- Auth routes
- JWT
- bcrypt hashing
- Login
- Signup
- Auth middleware
- Refresh tokens

---

# Pending (Track B)

- Transactions
- Budgets
- Bills
- Dashboard
- Net worth
- Financial health
- Savings calculations

---

Current branch is ready for feature development.