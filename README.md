# Finlitter — Personal Finance Management Platform

Finlitter is a personal finance management platform designed to help users understand their financial position, track money movement, plan savings goals, and explore potential investment outcomes.

The project combines financial planning tools with backend engineering and security-focused design.

## Core Features

### Financial Planning
- **Income and Expense Tracking:** Organize income sources and transactions.
- **Net Worth Tracking:** Calculate net worth from assets and liabilities.
- **Budget Planning:** Plan savings toward financial goals.
- **Financial Calculators:** Calculate SIP returns, loan EMIs, compound interest, and fixed deposit maturity.
- **Investment Simulation:** Explore potential portfolio outcomes across equity, debt, and gold allocations using Monte Carlo simulation.

### Security
- Password hashing using Argon2id.
- JWT-based authentication with refresh-token rotation.
- Field-level encryption for sensitive financial data using AES-256-GCM.
- Per-user encryption key derivation using HKDF.
- Rate limiting and refresh-token revocation.

*Security features are documented as design goals; implementation and testing status should be verified before describing them as production-ready.*

## Technology Stack

- **Backend:** Node.js, Express
- **Database and ORM:** PostgreSQL, Prisma
- **Frontend:** React
- **Validation:** Zod
- **Authentication and security:** JWT, Argon2id, AES-256-GCM, HKDF

## Investment Simulator

The investment simulator is intended to help users explore how portfolio allocation and investment assumptions influence possible outcomes.

The planned implementation runs 1,000 simulation paths and reports the 10th, 50th, and 90th percentile portfolio values. These outputs represent simulated scenarios, not guaranteed returns or financial advice.

## Project Status

Finlitter is under active development. Features are being implemented and integrated incrementally.

Planned functionality may change as development and testing progress.

## Getting Started

The setup instructions will be added once the current database configuration, environment variables, and frontend/backend startup commands have been verified.

## Disclaimer

Finlitter is an educational and personal finance project. Its calculations and investment simulations are not financial advice and should not be treated as guarantees of future performance.
