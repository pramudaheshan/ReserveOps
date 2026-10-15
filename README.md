# ReserveOps

ReserveOps is a resource reservation management system for shared rooms, equipment, and vehicles. It provides a Next.js web application for browsing resources, checking availability, creating reservations, and managing reservation and resource lifecycles.

The project uses the existing PostgreSQL database and Prisma ORM setup. The frontend and backend are implemented in the same Next.js App Router application.

## Screenshots and data model

### Dashboard

The dashboard provides a quick operational view of resource usage, reservation volume, availability, booking trends, and upcoming activity.

![ReserveOps dashboard](./src/Dashboard.png)

### Entity relationship diagram

The entity relationship diagram shows the relationships between users, resources, and reservations.

![ReserveOps entity relationship diagram](./src/ER.png)

## Features

- Dashboard with:
  - Resource and reservation KPIs
  - Weekly booking trend chart
  - Availability snapshot
  - Resource activity indicators
  - Upcoming reservation schedule
  - Date, resource, and text filters
- Resource catalogue:
  - Search and filter resources
  - Create resources
  - Edit resources
  - Activate and deactivate resources
- Weekly reservation timeline:
  - Navigate between weeks
  - View bookings by resource and day
  - Click an empty day to start a reservation
  - Click an existing booking to edit it
- Reservation management:
  - Create, update, and cancel reservations
  - Prevent overlapping confirmed reservations
  - Reject reservations that start in the past
  - Filter reservations by date range through the API
  - Preserve cancelled reservations for history
- Role-based privileges:
  - Regular users manage their own reservations
  - Administrators manage resources and all reservations
- Responsive light-themed UI based on the Lovable design, adapted to Next.js

## Technology stack

- Next.js 16 with App Router
- React 19
- TypeScript
- PostgreSQL
- Prisma ORM 7 with the PostgreSQL adapter
- Tailwind CSS 4
- Zod 4
- Lucide React icons

## Prerequisites

Install the following before starting:

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer
- Git

Check your versions:

```bash
node --version
npm --version
psql --version
```

## Project structure

```text
prisma/
  schema.prisma             Database schema
  migrations/               Prisma migrations

src/
  app/
    api/
      auth/                 Login, session, and logout endpoints
      resources/            Resource endpoints
      reservations/         Reservation endpoints
    page.tsx                Dashboard route
    resources/page.tsx      Resource catalogue route
    reservations/page.tsx   Reservation management route
  lib/
    auth.ts                 Signed session cookie helpers
    prisma7.ts              Prisma 7 client and PostgreSQL adapter
    validations.ts          Shared Zod validation schemas
  rrms/
    AppShell.tsx            Navigation, login, and session display
    RrmsApp.tsx             Dashboard, resource, and reservation UI
    api.ts                  Typed browser API client
    types.ts                Frontend domain types
    ui.tsx                  Shared UI controls
```

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd velobook
npm install
```

## Environment configuration

Create a `.env` file in the project root. Do not commit this file.

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/reserveops"
AUTH_SECRET="replace-with-a-long-random-secret"
ADMIN_EMAILS="admin@example.com"
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma and the application |
| `AUTH_SECRET` | Recommended | Secret used to sign the `httpOnly` demo session cookie |
| `ADMIN_EMAILS` | Optional | Comma-separated emails that should receive administrator privileges when they sign in |

`AUTH_SECRET` must be set in shared or production environments. The application has a development fallback only to make local assessment setup easier.

## Database setup

Create the PostgreSQL database first, then apply the existing Prisma migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

For local development when creating a new migration after intentionally changing `prisma/schema.prisma`, use:

```bash
npx prisma migrate dev --name describe-your-change
npx prisma generate
npx prisma studio
```

Do not use `migrate dev`, database resets, or destructive seed commands against a shared or production database.

The current schema contains:

- `User`: name, email, and role
- `Resource`: resource name, type, location, description, and active state
- `Reservation`: resource, owner, time range, purpose, and status

Supported resource types are `MEETING_ROOM`, `LAPTOP`, `PROJECTOR`, `VEHICLE`, and `OTHER`.

Supported reservation statuses are `CONFIRMED`, `CANCELLED`, and `COMPLETED`.

## Running the application

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production-like local run:

```bash
npm run build
npm run start
```

## Authentication and roles

The current login flow is a lightweight signed-cookie demo authentication mechanism. It is intended for local development and technical assessment use, not as a production identity system.

### Regular user

- Can view resources and reservations
- Can create reservations for their own signed-in email
- Can edit their own confirmed reservations
- Can cancel their own confirmed reservations
- Cannot create, edit, activate, or deactivate resources
- Cannot edit or cancel another user's reservation

### Administrator

- Has all regular-user permissions
- Can create and edit resources
- Can activate and deactivate resources
- Can create reservations for another user
- Can edit and cancel any confirmed reservation

An existing database user with `role = "ADMIN"` is treated as an administrator. New users are created with the default `USER` role. You can also configure administrator emails through `ADMIN_EMAILS`.

For production, replace the demo login with a real identity provider such as Microsoft Entra ID or Auth.js. Do not allow users to select their own role.

## API reference

All application API requests require a valid session unless noted otherwise.

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Creates a signed session from a name and email |
| `GET` | `/api/auth/me` | Returns the current session |
| `POST` | `/api/auth/logout` | Clears the session cookie |

### Resources

| Method | Endpoint | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/api/resources` | Authenticated | Lists resources |
| `POST` | `/api/resources` | Admin | Creates a resource |
| `PATCH` | `/api/resources/:id` | Admin | Updates a resource |
| `DELETE` | `/api/resources/:id` | Admin | Soft-deactivates a resource |

`DELETE` does not remove a resource from the database. It sets `isActive` to `false` so reservation history remains intact.

### Reservations

| Method | Endpoint | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/api/reservations` | Authenticated | Lists reservations |
| `POST` | `/api/reservations` | Authenticated | Creates a confirmed reservation |
| `PATCH` | `/api/reservations/:id` | Owner or admin | Updates or cancels a reservation |

Reservation list requests support overlap-aware date filtering:

```text
GET /api/reservations?from=2026-10-16T00:00:00.000Z&to=2026-10-17T00:00:00.000Z
```

Reservation creation and updates reject:

- Invalid input
- End times before or equal to start times
- Start times in the past
- Inactive or missing resources
- Overlapping confirmed reservations
- Non-owner changes by regular users

Cancellation uses:

```json
{
  "status": "CANCELLED"
}
```

## Validation and error handling

The API returns conventional status codes:

- `400` invalid input, invalid date range, or past reservation
- `401` missing or invalid session
- `403` insufficient role or ownership
- `404` missing reservation or resource
- `409` overlapping reservation
- `500` unexpected server error

The frontend displays loading, empty, validation, conflict, authentication, and server-error states.

## Development commands

```bash
npm run dev       # Start Next.js development server
npm run lint      # Run ESLint
npm run build     # Create a production build
npm run start     # Start the production server
```

There is currently no test script in `package.json`. At minimum, run `npm run lint` and `npm run build` before submitting changes. When testing reservation mutations manually, verify both a regular user and an administrator.

## Making changes safely

- Preserve the existing App Router and API routes.
- Do not copy the separate Lovable/Vite routing system into this project.
- Do not expose `.env` values or commit credentials.
- Do not reset the database or delete migrations.
- Keep server-side authorization in the API even when controls are hidden in the UI.
- Reuse the typed API client and shared Zod validation schemas.
- Use ISO timestamps at API boundaries and local date formatting for calendar display.
- Keep resource deactivation as a soft-delete to preserve reservation history.

## Known limitations and future work

- The current authentication is suitable for a demo, not production.
- Audit history is not yet implemented.
- Notifications and calendar integrations are not yet implemented.
- Reservation pagination is not yet implemented; date-range filtering is available.
- Completion workflows for reservations are not yet exposed in the UI.

## Deployment notes

For deployment, configure `DATABASE_URL`, `AUTH_SECRET`, and `ADMIN_EMAILS` through the hosting provider's secret/environment configuration. Run the production build in CI and apply migrations as a controlled deployment step:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

Never print connection strings or secret values in build logs.
