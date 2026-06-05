# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run start    # Run production build
```

No lint, test, or type-check scripts are configured.

## Architecture

**IT Asset Management** — a Next.js 16 full-stack app for tracking IT equipment and employees, with role-based access control.

### Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Backend/DB**: Supabase (PostgreSQL + Auth)
- **Storage**: Cloudflare R2 via S3-compatible SDK
- **Styling**: Tailwind CSS v4 (uses `@import "tailwindcss"` syntax, not v3 plugins)
- **Language**: TypeScript (strict mode), Thai UI labels

### Key Directories

```
app/                  # Next.js App Router pages + API routes
  api/                # Server-side API handlers (auth, members, R2, users)
  assets/             # Asset list, detail ([id]/), and new asset pages
  employees/          # Employee directory
  members/            # Team/role management (admin only)
  logs/, reports/, profile/, settings/
components/
  assets/             # AssetForm, AssetTable, BarcodeScannerModal, ImageUploader, etc.
  employees/          # EmployeeForm, EmployeeTable
  layout/             # AppShell (main wrapper), Sidebar
  ui/                 # ThemeToggle, Toast
hooks/
  useRole.ts          # Fetches current user's role (RPC + DB fallback)
  useUserNames.ts     # Batch-fetches user display names via /api/users
lib/
  supabase.ts         # Browser Supabase client
  supabase-server.ts  # Server Supabase clients (SSR cookie-based + service role)
  permissions.ts      # Role-level helpers (view=0, user=1, admin=2, master_admin=3)
  logging.ts          # insertAssetLog() for activity audit trail
  r2.ts               # Cloudflare R2 utilities
  compressImage.ts    # Client-side image compression before upload
  fuzzySearch.ts      # Fuse.js wrapper for client-side search
proxy.ts              # Middleware: redirects unauthenticated → /login
```

### Data Flow

- **Client components** call Supabase JS directly for reads/writes
- **API routes** handle operations requiring service role (user metadata, role assignment, R2 presigned URLs)
- **No global state** — React `useState`/`useEffect` + custom hooks only
- **Search** is client-side (Fuse.js), not database queries

### Supabase Schema (key tables)

- `user_roles` — `user_id`, `role` (view|user|admin|master_admin)
- `employees` — `emp_id`, `full_name_th`, `full_name_en`, `department`, `position`, `status` (active|probation|resign)
- `assets` — `asset_no`, `name`, `category`, `status` (active|available|repair|storage), `images[]`, `emp_id`, `created_by`
- `asset_logs` — audit trail for asset actions

### Image Uploads

Images are compressed client-side → uploaded to R2 via presigned URL from `/api/r2/presign` → stored as `assets/{assetNo}/{assetNo}_{index}.webp`. Public CDN URL via `NEXT_PUBLIC_R2_PUBLIC_URL`.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
NEXT_PUBLIC_R2_PUBLIC_URL
```

### Theme

Dark/light mode toggled client-side via `data-theme` attribute on `<html>` + `localStorage`. CSS variables defined in `app/globals.css`.
