---
name: project-progress
description: สรุปสิ่งที่ทำในโปรเจค IT Asset Web TT — feature ที่เพิ่ม, pattern ที่ใช้, SQL ที่รันไปแล้ว
metadata:
  type: project
---

## Feature ที่เพิ่มในเซสชันนี้

### Asset Detail Page (branch: redesign/asset-detail)
- Redesign UI header bar, gallery lightbox, mobile responsive
- Book Valued / ค่าเสื่อมราคา (purchase_date ÷ 60 เดือน) + countdown อายุเครื่อง
- received_date = วันที่พนักงานรับเครื่อง (log แยก)
- original_price = มูลค่าเริ่มต้น
- Activity Log: search + filter chips (โอนย้าย/มอบหมาย/แก้ไข/รูปภาพ) + timeline UI
- Gallery lightbox: เลื่อน ซ้าย/ขวา + keyboard + thumbnail strip
- ช่องรูปว่างกดเพื่อ upload ได้เลย

### Programs & Licenses
- `asset_licenses` table: name, license_key, notes, created_by
- Role-based key visibility: admin เห็น / user ขอดูได้ / view ไม่เห็น
- License request flow: pending → approved → เปิดดู 10 นาที (localStorage timer)
- ถ้าไม่เปิดใน 4 ชม. → expire ต้องขอใหม่
- Import Excel: add/update mode + template download
- ลำดับใน Detail: Programs → Book Valued → รูปภาพ

### License Request Notification
- `license_view_requests` table + `approved_at` column
- Admin: 🔔 bell badge realtime (Supabase Realtime) + toast แจ้งทันที + popup อนุมัติ/ปฏิเสธ
- User: poll ทุก 5 วินาที ถ้ามี pending, toast เมื่อได้รับอนุมัติ/ปฏิเสธ
- หน้า `/license-requests` แสดงชื่อ/ตำแหน่ง/email ผู้ขอ

### Vendor Management
- `vendors` table: name, contact_name, phone, email, website, notes
- `assets.vendor_id` FK → vendors
- หน้า `/vendors`: เพิ่ม/แก้ไข (popup modal) / ลบ / Import Excel (add+update) / ค้นหา
- กด "X Asset" ใน Vendor → ไปหน้า Asset All filter vendor นั้น
- Dropdown filter Vendor ในหน้า Asset All
- Asset Detail: กดชื่อ Vendor → popup แสดงข้อมูลครบ (VendorPopup)
- Log แสดงชื่อ Vendor แทน UUID

### Asset Status ใหม่
available | issued | returned | damaged | repair | writeoff | hold | spare
(legacy: active→issued, storage→available ยังรองรับ)

### Services Layer
`services/assetService.ts`, `vendorService.ts`, `employeeService.ts`, `licenseService.ts`, `logService.ts`
Components ควรเรียก services แทน createClient() โดยตรง

### Transfer Modal
- เพิ่ม field "วันที่ได้รับเครื่อง" (default = วันนี้)
- Log: โอนย้าย/มอบหมาย รวมวันที่ไว้ใน log เดียว (ไม่แยก 2 log)

### Import Dialog (ทุกที่)
- สีเขียว = มีการเพิ่ม/อัปเดต
- สีเหลือง = ข้ามทั้งหมด ไม่มีอะไรเปลี่ยน
- badge แยกสี: เพิ่มใหม่=เขียว, อัปเดต=น้ำเงิน, ข้าม=เทา

## SQL ที่ต้องรัน (ถ้ายังไม่ได้รัน)

```sql
ALTER TABLE assets ADD COLUMN received_date date;
ALTER TABLE assets ADD COLUMN original_price numeric(12,2);
ALTER TABLE assets ADD COLUMN vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE TABLE vendors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, contact_name text, phone text, email text, website text, notes text, created_at timestamptz DEFAULT now());
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth" ON vendors FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE asset_licenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE, name text NOT NULL, license_key text, notes text, created_by uuid, created_at timestamptz DEFAULT now());
ALTER TABLE asset_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth" ON asset_licenses FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE license_view_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), license_id uuid NOT NULL REFERENCES asset_licenses(id) ON DELETE CASCADE, requested_by uuid NOT NULL, granted_by uuid, status text NOT NULL DEFAULT 'pending', approved_at timestamptz, created_at timestamptz DEFAULT now(), UNIQUE(license_id, requested_by));
ALTER TABLE license_view_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth" ON license_view_requests FOR ALL USING (auth.role() = 'authenticated');
```

**Why:** ขยาย schema เพื่อรองรับ vendor tracking, license management, book value depreciation
**How to apply:** ถ้า feature ใหม่ไม่ทำงาน ตรวจสอบว่า SQL ข้างต้นรันครบแล้ว
