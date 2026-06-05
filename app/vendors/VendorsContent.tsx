"use client";
import { useEffect, useRef, useState } from "react";
import type { Vendor } from "@/lib/supabase";
import {
  getVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorAssetCounts,
} from "@/services/vendorService";
import { useRole } from "@/hooks/useRole";
import { canEdit, canDelete } from "@/lib/permissions";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Store,
  Phone,
  Mail,
  Globe,
  Search,
  Upload,
  Download,
  Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createVendor as createVendorSvc,
  updateVendor as updateVendorSvc,
} from "@/services/vendorService";
import * as XLSX from "xlsx";

const EMPTY = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
};

const TEMPLATE = [
  {
    name: "บริษัท ABC จำกัด",
    contact_name: "สมชาย ใจดี",
    phone: "02-123-4567",
    email: "contact@abc.com",
    website: "https://abc.com",
    notes: "",
  },
];

// ── Vendor Form Modal ──────────────────────────────────────────
function VendorModal({
  vendor,
  onClose,
  onSave,
}: {
  vendor?: Vendor;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    contact_name: vendor?.contact_name ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    website: vendor?.website ?? "",
    notes: vendor?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      notes: form.notes || undefined,
    };
    if (vendor?.id) {
      await updateVendorSvc(vendor.id, payload);
    } else {
      await createVendorSvc(payload as any);
    }
    setSaving(false);
    onSave();
    onClose();
  };

  const inp =
    "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400";
  const lbl = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">
            {vendor ? "แก้ไข Vendor" : "เพิ่ม Vendor"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 gap-3">
          <div>
            <label className={lbl}>ชื่อ Vendor *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="เช่น บริษัท ABC จำกัด"
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>ชื่อผู้ติดต่อ</label>
            <input
              value={form.contact_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, contact_name: e.target.value }))
              }
              placeholder="ชื่อ Sales หรือ Support"
              className={inp}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>เบอร์โทร</label>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="02-xxx-xxxx"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="vendor@example.com"
                className={inp}
              />
            </div>
          </div>
          <div>
            <label className={lbl}>Website</label>
            <input
              value={form.website}
              onChange={(e) =>
                setForm((f) => ({ ...f, website: e.target.value }))
              }
              placeholder="https://..."
              className={inp}
            />
          </div>
          <div>
            <label className={lbl}>หมายเหตุ</label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              placeholder="ข้อมูลเพิ่มเติม..."
              className={inp}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : vendor ? "บันทึก" : "เพิ่ม"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import Modal ──────────────────────────────────────────────
function ImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"add" | "update">("add");
  const [rows, setRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, "vendors_template.xlsx");
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      setRows(data as any[]);
    };
    reader.readAsBinaryString(file);
  };

  const run = async () => {
    if (!rows.length) return;
    setImporting(true);
    const supabase = createClient();
    let added = 0,
      updated = 0,
      skipped = 0;

    const { data: existing } = await supabase
      .from("vendors")
      .select("id, name");
    const nameMap = Object.fromEntries(
      (existing ?? []).map((v) => [v.name.trim().toLowerCase(), v.id]),
    );

    for (const row of rows) {
      const name = String(row.name ?? "").trim();
      if (!name) {
        skipped++;
        continue;
      }

      const payload = {
        name,
        contact_name: row.contact_name ? String(row.contact_name) : null,
        phone: row.phone ? String(row.phone) : null,
        email: row.email ? String(row.email) : null,
        website: row.website ? String(row.website) : null,
        notes: row.notes ? String(row.notes) : null,
      };

      const existId = nameMap[name.toLowerCase()];
      if (existId) {
        if (mode === "update") {
          await supabase.from("vendors").update(payload).eq("id", existId);
          updated++;
        } else {
          skipped++;
        }
      } else {
        await supabase.from("vendors").insert(payload);
        added++;
      }
    }

    setResult({ added, updated, skipped });
    setImporting(false);
    onDone();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Upload size={16} /> Import Vendors
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Template */}
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
          >
            <Download size={15} /> ดาวน์โหลด Template
          </button>

          {/* Mode */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              โหมด Import
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["add", "เพิ่มใหม่เท่านั้น", "ถ้าชื่อซ้ำจะข้ามไป"],
                  ["update", "เพิ่ม + อัปเดต", "ถ้าชื่อซ้ำจะอัปเดตข้อมูล"],
                ] as const
              ).map(([k, title, desc]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${mode === k ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-gray-200 dark:border-gray-600 hover:border-gray-300"}`}
                >
                  <p
                    className={`text-sm font-medium ${mode === k ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-200"}`}
                  >
                    {title}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* File picker */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <Upload size={15} />{" "}
              {rows.length
                ? `เลือกไฟล์แล้ว · ${rows.length} แถว`
                : "เลือกไฟล์ .xlsx / .csv"}
            </button>
          </div>

          {/* Result */}
          {result &&
            (() => {
              const hasSuccess = result.added > 0 || result.updated > 0;
              return (
                <div
                  className={`p-3 rounded-xl text-xs space-y-1.5 ${hasSuccess ? "bg-green-50 dark:bg-green-900/20" : "bg-amber-50 dark:bg-amber-900/20"}`}
                >
                  <p
                    className={`font-medium ${hasSuccess ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}
                  >
                    {hasSuccess ? "Import สำเร็จ" : "ไม่มีรายการถูก Import"}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {result.added > 0 && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
                        ✓ เพิ่มใหม่ {result.added}
                      </span>
                    )}
                    {result.updated > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                        ↻ อัปเดต {result.updated}
                      </span>
                    )}
                    {result.skipped > 0 && (
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                        – ข้าม {result.skipped}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
        </div>

        <div className="flex gap-2 justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {result ? "ปิด" : "ยกเลิก"}
          </button>
          {!result && (
            <button
              onClick={run}
              disabled={!rows.length || importing}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {importing ? "กำลัง Import..." : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function VendorsContent() {
  const { role } = useRole();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editVendor, setEditVendor] = useState<Vendor | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vendor | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});

  const load = async () => {
    const [v, counts] = await Promise.all([
      getVendors(),
      getVendorAssetCounts(),
    ]);
    setVendors(v);
    setAssetCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const del = async (v: Vendor) => {
    await deleteVendor(v.id);
    setConfirmDelete(null);
    load();
  };

  const filtered = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      (v.contact_name ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (v.email ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Modals */}
      {editVendor && (
        <VendorModal
          vendor={editVendor === "new" ? undefined : editVendor}
          onClose={() => setEditVendor(null)}
          onSave={load}
        />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={load} />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setConfirmDelete(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">
                  ลบ Vendor
                </p>
                <p className="text-xs text-gray-400">ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              ลบ <span className="font-semibold">{confirmDelete.name}</span>{" "}
              ใช่ไหม?
            </p>
            {(assetCounts[confirmDelete.id] ?? 0) > 0 && (
              <p className="text-xs text-amber-500 mb-2">
                ⚠ มี {assetCounts[confirmDelete.id]} Asset ที่ใช้ Vendor นี้อยู่
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => del(confirmDelete)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Store size={20} className="text-indigo-500" /> Vendors
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500">
            {vendors.length} รายการ
          </span>
        </h1>
        <div className="flex gap-2">
          {canEdit(role) && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Upload size={15} /> Import
              </button>
              <button
                onClick={() => setEditVendor("new")}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Plus size={16} /> เพิ่ม Vendor
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ, ผู้ติดต่อ, email..."
          className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-400 text-sm p-4">กำลังโหลด...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Store
            size={32}
            className="text-gray-200 dark:text-gray-700 mx-auto mb-3"
          />
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {query ? "ไม่พบ Vendor ที่ตรงกัน" : "ยังไม่มี Vendor"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {v.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {v.name}
                    </p>
                    {(assetCounts[v.id] ?? 0) > 0 && (
                      <button
                        onClick={() =>
                          router.push(
                            `/assets?vendor_id=${v.id}&vendor_name=${encodeURIComponent(v.name)}`,
                          )
                        }
                        className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
                      >
                        <Package size={10} /> {assetCounts[v.id]} Asset
                      </button>
                    )}
                  </div>
                  {canEdit(role) && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditVendor(v)}
                        className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      {canDelete(role) && (
                        <button
                          onClick={() => setConfirmDelete(v)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {v.contact_name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {v.contact_name}
                    </p>
                  )}
                  {v.phone && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Phone size={10} /> {v.phone}
                    </p>
                  )}
                  {v.email && (
                    <a
                      href={`mailto:${v.email}`}
                      className="text-xs text-indigo-500 hover:underline flex items-center gap-1"
                    >
                      <Mail size={10} /> {v.email}
                    </a>
                  )}
                  {v.website && (
                    <a
                      href={v.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:underline flex items-center gap-1 truncate"
                    >
                      <Globe size={10} />{" "}
                      {v.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {v.notes && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">
                      {v.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
