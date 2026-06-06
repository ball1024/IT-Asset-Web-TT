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
app/                        # Next.js App Router pages + API routes
  api/                      # Server-side API handlers (auth, members, R2, users)
  assets/                   # Asset list, detail ([id]/), and new asset pages
  employees/                # Employee directory
  members/                  # Team/role management (admin only)
  vendors/                  # Vendor management page
  license-requests/         # License key request approval page (admin only)
  logs/, reports/, profile/, settings/
components/
  assets/                   # AssetForm, AssetTable, TransferModal, VendorPopup, etc.
  employees/                # EmployeeForm, EmployeeTable
  layout/                   # AppShell (main wrapper + realtime bell), Sidebar
  ui/                       # ThemeToggle, Toast (success|error|info)
hooks/
  useRole.ts                # Fetches current user's role
  useUserNames.ts           # Batch-fetches user display names
  useLicenseRequests.ts     # Admin: pending requests + realtime; User: own request status
lib/
  supabase.ts               # Browser Supabase client + all TypeScript types
  supabase-server.ts        # Server Supabase clients (SSR + service role)
  permissions.ts            # Role-level helpers
  logging.ts                # insertAssetLog()
  r2.ts, compressImage.ts, fuzzySearch.ts
services/                   # Service layer — Supabase queries abstracted here
  assetService.ts           # getAssets, getAssetById, createAsset, updateAsset, deleteAsset
  vendorService.ts          # getVendors, createVendor, updateVendor, deleteVendor
  employeeService.ts        # getEmployees, getActiveEmployees, getEmployeeEmails
  licenseService.ts         # getLicenses, approveLicenseRequest, rejectLicenseRequest
  logService.ts             # getAssetLogs, getAllLogs
proxy.ts                    # Middleware: redirects unauthenticated → /login
```

### Data Flow

- **`services/`** layer abstracts all Supabase queries — components should call services, not `createClient()` directly
- **API routes** handle operations requiring service role (user metadata, role assignment, R2 presigned URLs)
- **No global state** — React `useState`/`useEffect` + custom hooks only
- **Search** is client-side (Fuse.js)

### Supabase Schema (key tables)

- `user_roles` — `user_id`, `role` (view|user|admin|master_admin)
- `employees` — `emp_id`, `full_name_th`, `full_name_en`, `department`, `position`, `status`
- `assets` — `asset_no`, `name`, `category`, `status`, `images[]`, `emp_id`, `vendor_id`, `received_date`, `original_price`, `purchase_date`, `created_by`
- `asset_logs` — audit trail
- `vendors` — `id`, `name`, `contact_name`, `phone`, `email`, `website`, `notes`
- `asset_licenses` — `id`, `asset_id`, `name`, `license_key`, `notes`, `created_by`
- `license_view_requests` — `id`, `license_id`, `requested_by`, `status` (pending|approved|rejected), `approved_at`

### Asset Status Values

`available` | `issued` | `returned` | `damaged` | `repair` | `writeoff` | `hold` | `spare`

Legacy values `active` and `storage` still handled for backwards compatibility.

### Permissions Summary

| Feature | view | user | admin | master_admin |
|---|:---:|:---:|:---:|:---:|
| ดู Asset | ✅ | ✅ | ✅ | ✅ |
| เพิ่ม/แก้ไข Asset | ❌ | ✅ | ✅ | ✅ |
| โอนย้าย Asset | ❌ | ✅ | ✅ | ✅ |
| ลบ Asset | ❌ | ❌ | ✅ | ✅ |
| เห็น License Key | ❌ | ขอดูได้ (10 นาที) | ✅ | ✅ |
| จัดการ License | ❌ | ❌ | ✅ | ✅ |
| จัดการพนักงาน | ❌ | ✅ | ✅ | ✅ |
| ลบพนักงาน | ❌ | ❌ | ❌ | ✅ |
| ดู Members/Logs | ❌ | ❌ | ✅ | ✅ |
| จัดการ Role | ❌ | ❌ | ❌ | ✅ |

### License Key Flow

1. user กด "ขอดู" → สร้าง `license_view_requests` (pending)
2. Admin เห็น 🔔 bell badge + toast realtime
3. Admin กด "อนุมัติ" → status = approved + `approved_at`
4. User กด "เปิดดู (10 นาที)" → เห็น key + countdown timer (เก็บใน localStorage)
5. ครบ 10 นาที หรือไม่เปิดใน 4 ชม. → request ถูกลบ ต้องขอใหม่

### SQL Migrations Required (รัน Supabase Dashboard)

```sql
-- Vendors
CREATE TABLE vendors (...);
ALTER TABLE assets ADD COLUMN vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN received_date date;
ALTER TABLE assets ADD COLUMN original_price numeric(12,2);

-- Licenses
CREATE TABLE asset_licenses (...);
CREATE TABLE license_view_requests (...);
ALTER TABLE license_view_requests ADD COLUMN approved_at timestamptz;
```

### Git Branches

- `main` — stable base
- `redesign/asset-detail` — active development branch (current)

### Image Uploads

Client-side compress → R2 presign → upload → store key in `assets.images[]`

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
NEXT_PUBLIC_R2_PUBLIC_URL
```
