# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: Ath.ai

Premium AI platform that converts a single furniture photo into a 3D model.

### Features
- Marketing homepage with 8+ sections, framer-motion animations
- Clerk authentication (sign-in / sign-up)
- Protected dashboard with generation history
- Upload workspace to submit furniture photos for AI 3D reconstruction
- Interactive 3D model viewer using @react-three/fiber and @react-three/drei
- Model detail page with export downloads (GLB / OBJ / USDZ)
- Dashboard summary stats and recent generations
- Generation gating — all actions require authentication

### Architecture

- **Frontend**: React + Vite at `/` (artifacts/ath-ai)
- **Backend**: Express 5 API server (artifacts/api-server)
- **Auth**: Clerk (whitelabel, proxy via /__clerk)
- **Database**: PostgreSQL + Drizzle ORM
- **3D viewer**: @react-three/fiber + @react-three/drei

### Database Schema

- `generations` table — stores per-user furniture generation records with status, image URLs, model URLs

### Routes

Public:
- `/` — Marketing homepage
- `/sign-in` — Clerk sign-in
- `/sign-up` — Clerk sign-up

Protected:
- `/dashboard` — Overview stats + recent activity
- `/generate` — Upload furniture image, create generation
- `/models` — My Models grid/list
- `/models/:id` — Model detail with 3D viewer + exports
- `/settings` — Account settings

### API Endpoints

- `GET /api/healthz` — Health check
- `GET /api/generations` — List user's generations
- `POST /api/generations` — Create new generation
- `GET /api/generations/:id` — Get generation
- `PATCH /api/generations/:id` — Update generation
- `DELETE /api/generations/:id` — Delete generation
- `POST /api/generations/:id/process` — Trigger AI processing
- `GET /api/dashboard/summary` — Dashboard stats
- `GET /api/dashboard/recent` — Recent generations

### AI Pipeline

The 3D generation pipeline runs server-side in `artifacts/api-server/src/routes/generations.ts`:

1. **Background removal** — calls remove.bg API (REMOVE_BG_API_KEY) to strip the furniture background
2. **InstantMesh 3D generation** — calls the `SIGMitch/InstantMesh` HuggingFace Space via a **Python subprocess bridge**
   - Bridge script: `artifacts/api-server/src/instantmesh_bridge.py`
   - Uses `gradio_client` Python package (2.4.1), which maintains WebSocket session state internally
   - This is required because `make3d` depends on numpy array state from `generate_mvs` which cannot be passed via REST JSON
   - The bridge script receives base64 image on stdin and outputs JSON (multiview PNG + OBJ + GLB as base64 data URLs) on stdout
   - Python 3.11 + `gradio_client` installed as a Replit module
3. Outputs stored in the `generations` DB table as data URLs

Environment variables:
- `HF_TOKEN` — HuggingFace API token for the InstantMesh space
- `REMOVE_BG_API_KEY` — remove.bg API key
- `SESSION_SECRET` — Express session secret
- `HF_TIMEOUT_JOB_MS` — Pipeline timeout in ms (default: 720000 = 12 min)
- `SIGMITCH_SAMPLE_STEPS` — MVS steps (default: 75)
- `SIGMITCH_SAMPLE_SEED` — MVS seed (default: 42)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Python**: 3.11 (for gradio_client bridge subprocess)
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk
- **3D**: @react-three/fiber, @react-three/drei, three.js

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
