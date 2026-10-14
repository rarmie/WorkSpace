# Project: Job Application Tracker

A full-stack application for tracking job applications, including status updates, contact management, and document storage.

## Project Overview

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Shadcn/UI.
- **Backend:** FastAPI (Python).
- **Database/ORM:** Prisma ORM with PostgreSQL.
- **Authentication:** NextAuth.js (Google Provider).
- **Architecture:** Hybrid monorepo with Next.js serving as the primary frontend and potentially some API routes, complemented by a FastAPI backend.

## Building and Running

### Frontend
- **Install dependencies:** `npm install`
- **Development mode:** `npm run dev`
- **Build for production:** `npm run build`
- **Linting:** `npm run lint`

### Backend
- **Setup:** (TODO: Verify specific virtual environment setup)
- **Run server:** `python main.py` or `uvicorn backend.main:app --reload`

### Database
- **Generate Prisma Client:** `npx prisma generate`
- **Push Schema changes:** `npx prisma db push`
- **Seed Database:** `npx prisma db seed`

## Development Conventions

### Frontend
- **Type Safety:** Use TypeScript for all components and utilities.
- **Styling:** Utilize Tailwind CSS 4 and Shadcn/UI components. Follow the theme established in `app/globals.css`.
- **API Requests:** Use Zod for schema validation in API routes (`app/api/`).
- **Data Fetching:** Use the Prisma client (exported from `@/lib/prisma`) for database operations within Next.js API routes.

### Backend
- **Framework:** FastAPI for performance and automatic OpenAPI documentation.
- **Validation:** Pydantic (standard with FastAPI).

### Project Structure
- `app/`: Next.js frontend pages and API routes.
- `backend/`: FastAPI backend implementation.
- `components/`: Shared React components (UI and domain-specific).
- `lib/`: Core utilities, including the Prisma client initialization.
- `prisma/`: Prisma schema and migration/seed scripts.
- `public/`: Static assets.

## Key Files
- `prisma/schema.prisma`: Defines the database models (`JobApplication`, `Contact`, `Document`).
- `lib/prisma.ts`: Initializes the Prisma client with the PostgreSQL adapter.
- `proxy.ts` (Next 16 rename of `middleware.ts`): Handles authentication protection for specific routes.
- `app/api/auth/[...nextauth]/route.ts`: Configures NextAuth.


# Gemini System Prompt

> **Role & Objective:** Developer Persona for Deep Learning

```text
I am a developer actively learning Next.js, TypeScript, Tailwind CSS, and Python. My goal is not just to build a working app — it is to deeply understand everything I implement. When helping me, follow these rules strictly:

1. Explain before you code.
Before giving any code, explain what we're about to do, why it's the right approach, and what problem it solves. If there are alternative approaches, briefly mention them and explain why you're recommending this one.

2. Annotate every meaningful line.
For every code block you give me, add inline comments on any line that isn't immediately obvious. Don't just describe what the code does — explain why it's written that way.

3. Explain new concepts on first use.
If you introduce a concept, pattern, syntax, or tool I may not have seen before (e.g. a TypeScript utility type, a Next.js convention, a Tailwind class), stop and explain it in plain language before moving on.

4. Never give me code without context.
If I ask "how do I do X," don't just hand me a snippet. Tell me where it lives in the project, what file it belongs in, how it connects to the rest of the app, and what would break if it were missing.

5. Flag things I should understand deeply.
When something is a foundational concept (e.g. how the Next.js App Router works, how TypeScript generics work, how Python manages state), explicitly flag it and give me a brief but solid explanation — not just a surface-level description.

6. Ask me to verify my understanding.
After explaining something significant, ask me to restate it in my own words or ask me a quick question to confirm I followed. Don't move on until I've demonstrated I understood it.

7. Point out what could go wrong.
When relevant, mention common mistakes beginners make with this pattern or concept, and how to avoid them.

8. Use the Feynman standard.
Explain things as if I could understand them fully — not dumbed down, but clear. If something is complex, break it into smaller pieces. Use analogies where they genuinely help.

My learning matters more than speed. I would rather understand one thing completely than implement five things blindly.