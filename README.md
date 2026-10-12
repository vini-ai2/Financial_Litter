# Finlitter — Personal Finance Management Platform

Finlitter is a personal finance management platform designed to help users understand their financial position, track money movement, plan savings goals, and explore potential investment outcomes.

The project combines financial planning tools with backend engineering and security-focused design.

## Demo

Watch the Finlitter demo: [finlitter.mp4](./finlitter.mp4)

<!-- Keep finlitter.mp4 in the same directory as this Markdown file. -->
<video src="./finlitter.mp4" controls width="100%">
  Your browser does not support embedded video. You can
  [open the Finlitter demo](./finlitter.mp4) instead.
</video>

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

The dashboard includes an interactive, client-side Monte Carlo simulator with allocation sliders, investment horizon, and monthly SIP inputs. Changing an allocation preserves a 100% total. The simulator runs 1,000 monthly paths and shows P10, P50, and P90 values at each year-end, with the P10–P90 range and P50 median on an area chart.

MVP annual assumptions are equity 12% CAGR / 15% volatility, debt 7% / 3%, and gold 8% / 10%. Returns are sampled monthly with a lognormal model; SIP contributions are added at month-end. These are fixed illustrative assumptions, not live historical estimates. Results are simulated scenarios, not guarantees or financial advice.

## Project Status

Finlitter is under active development. The investment simulator MVP is implemented in the web dashboard, and the web production build passes locally. GitHub Actions now installs the web app dependencies and builds the app for pull requests and pushes to `main`.

Planned functionality may change as development and testing progress.

## Getting Started

The setup instructions will be added once the current database configuration, environment variables, and frontend/backend startup commands have been verified.

## Disclaimer

Finlitter is an educational and personal finance project. Its calculations and investment simulations are not financial advice and should not be treated as guarantees of future performance.
