import { createFileRoute, Navigate } from "@tanstack/react-router";
import { FolderArchive, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Button, Card, Input, Notice, Spinner } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { roleFor, useAuth } from "@/lib/auth";

interface Category {
  id: number;
  type: string;
}
interface StorageTemplate {
  id: string;
  template_name: string;
  document_category_id: number;
}
const endpoint = "/api/admin/storage-templates";
const selectClass =
  "min-h-11 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--paper)] px-3";
const message = (error: unknown) =>
  error instanceof ApiError
    ? (error.userMessage ?? error.message)
    : "ไม่สามารถติดต่อระบบได้ กรุณาลองใหม่";

// oxlint-disable-next-line complexity -- Keep catalog editing, loading and confirmation states in the page that owns them.
const StorageTemplatesPage = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<StorageTemplate[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [listError, setListError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<StorageTemplate | null>(null);
  const [deleting, setDeleting] = useState<StorageTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const payload = await apiGet<{ templates: StorageTemplate[] }>(endpoint);
      setTemplates(payload.templates);
    } catch (error) {
      setListError(message(error));
    } finally {
      setListLoading(false);
    }
  }, []);
  const refreshCategories = useCallback(async () => {
    setCategoryLoading(true);
    setCategoryError("");
    try {
      const payload = await apiGet<{ categories: Category[] }>(
        `${endpoint}/categories`
      );
      setCategories(payload.categories);
    } catch (error) {
      setCategoryError(message(error));
    } finally {
      setCategoryLoading(false);
    }
  }, []);
  useEffect(() => {
    if (roleFor(user) === "admin") {
      void refreshList();
      void refreshCategories();
    }
  }, [user, refreshList, refreshCategories]);
  if (roleFor(user) !== "admin") {
    return <Navigate to="/admin/results" search={{ form: undefined }} />;
  }
  const categoryOptions = [...categories];
  for (const id of new Set(
    templates.map((template) => template.document_category_id)
  )) {
    if (!categoryOptions.some((entry) => entry.id === id)) {
      categoryOptions.push({ id, type: "หัวข้อที่บันทึกไว้" });
    }
  }
  const visible = templates.filter(
    (template) =>
      category !== "" && template.document_category_id === Number(category)
  );
  const categoryAvailable = categories.some(
    (entry) => String(entry.id) === category
  );
  const editingOriginalCategory = templates.find(
    (template) => template.id === editing?.id
  )?.document_category_id;
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setMutationError("");
    try {
      const data = editing
        ? {
            document_category_id: editing.document_category_id,
            template_name: editing.template_name,
          }
        : { document_category_id: Number(category), template_name: name };
      await (editing
        ? apiPatch(`${endpoint}/${editing.id}`, data)
        : apiPost(endpoint, data));
      if (editing) {
        editDialog.current?.close();
      } else {
        setName("");
      }
      await refreshList();
    } catch (error) {
      setMutationError(message(error));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting || busy) {
      return;
    }
    setBusy(true);
    setMutationError("");
    try {
      await apiDelete(`${endpoint}/${deleting.id}`, { confirm: true });
      dialog.current?.close();
      await refreshList();
    } catch (error) {
      setMutationError(message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="ตั้งค่าระบบ"
        description="จัดการการตั้งค่าและข้อมูลสำหรับผู้ดูแลระบบ"
      />
      <Card>
        <section aria-labelledby="storage-templates-title">
          <div className="flex items-start gap-3 border-b border-[var(--line)] p-5 sm:p-6">
            <span className="rounded-xl bg-[var(--accent-soft)] p-3">
              <FolderArchive size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="storage-templates-title" className="text-xl font-bold">
                แม่แบบจัดเก็บเอกสาร
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                ชื่อแม่แบบต้องตรงกับ DCM จัดการเฉพาะรายการของ Folio
                โดยไม่เปลี่ยนไฟล์หรือแบบฟอร์มที่เผยแพร่แล้ว
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-[24rem_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4 border-b border-[var(--line)] p-5 sm:p-6 md:border-r md:border-b-0">
              <label className="flex flex-col gap-2 font-semibold">
                หัวข้อเอกสาร
                <select
                  className={selectClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={busy || categoryLoading}
                >
                  <option value="">เลือกหัวข้อเอกสาร</option>
                  {categoryOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.type}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-[var(--ink-soft)]">
                เลือกหัวข้อเพื่อดูและจัดการแม่แบบในกลุ่มนี้
              </p>
              {categoryLoading ? (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Spinner /> กำลังโหลดหัวข้อเอกสาร
                </p>
              ) : null}
              {categoryError ? (
                <div className="space-y-3">
                  <Notice tone="danger">
                    โหลดหัวข้อเอกสารไม่สำเร็จ: {categoryError} รายการที่บันทึกไว้ยังคงเดิม
                  </Notice>
                  <Button
                    variant="secondary"
                    disabled={busy || categoryLoading}
                    onClick={() => {
                      void refreshCategories();
                    }}
                  >
                    ลองโหลดหัวข้ออีกครั้ง
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 space-y-5 p-5 sm:p-6">
              <form onSubmit={save} aria-busy={busy}>
                <label
                  className="mb-2 block font-semibold"
                  htmlFor="new-template-name"
                >
                  ชื่อแม่แบบ
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="new-template-name"
                    className="min-w-0 flex-1"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="ระบุชื่อแม่แบบให้ตรงกับ DCM"
                    required
                    maxLength={255}
                    disabled={busy || !categoryAvailable}
                  />
                  <Button
                    type="submit"
                    className="min-h-11 shrink-0"
                    disabled={busy || !name.trim() || !categoryAvailable}
                  >
                    {busy && !editing && !deleting ? (
                      <Spinner />
                    ) : (
                      <Plus size={16} aria-hidden="true" />
                    )}
                    เพิ่มแม่แบบ
                  </Button>
                </div>
              </form>
              {mutationError && !editing && !deleting ? (
                <Notice tone="danger">{mutationError}</Notice>
              ) : null}
              {listLoading ? (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Spinner /> กำลังโหลดแม่แบบ
                </p>
              ) : null}
              {listError ? (
                <div className="space-y-3">
                  <Notice tone="danger">โหลดรายการไม่สำเร็จ: {listError}</Notice>
                  <Button
                    variant="secondary"
                    disabled={busy || listLoading}
                    onClick={() => {
                      void refreshList();
                    }}
                  >
                    ลองโหลดรายการอีกครั้ง
                  </Button>
                </div>
              ) : null}
              {!listLoading && !listError ? (
                <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                  <table className="w-full table-fixed text-left text-sm">
                    <caption className="sr-only">
                      แม่แบบจัดเก็บเอกสารในหัวข้อที่เลือก
                    </caption>
                    <colgroup>
                      <col />
                      <col className="w-32 sm:w-56" />
                    </colgroup>
                    <thead className="bg-[var(--muted-soft)] text-[var(--ink-soft)]">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          ชื่อแม่แบบ
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3 text-right font-semibold"
                        >
                          จัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {visible.map((template) => (
                        <tr key={template.id}>
                          <td className="break-all px-4 py-3 font-medium">
                            {template.template_name}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                className="min-h-11 min-w-11 px-2 sm:px-3"
                                aria-label={`แก้ไข ${template.template_name}`}
                                disabled={busy}
                                onClick={() => {
                                  setEditing(template);
                                  setMutationError("");
                                  editDialog.current?.showModal();
                                }}
                              >
                                <Pencil size={16} aria-hidden="true" />
                                <span className="hidden sm:inline">แก้ไข</span>
                              </Button>
                              <Button
                                variant="ghost"
                                className="min-h-11 min-w-11 px-2 text-[var(--danger)] sm:px-3"
                                aria-label={`ลบ ${template.template_name}`}
                                disabled={busy}
                                onClick={() => {
                                  setDeleting(template);
                                  setMutationError("");
                                  dialog.current?.showModal();
                                }}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                                <span className="hidden sm:inline">ลบ</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {visible.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-10 text-center text-[var(--ink-soft)]"
                          >
                            {category
                              ? "ยังไม่มีรายการ"
                              : "เลือกหัวข้อเอกสารเพื่อดูรายการแม่แบบ"}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </Card>
      <dialog
        ref={editDialog}
        aria-labelledby="storage-edit-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-[var(--paper)] p-6 text-[var(--ink)] backdrop:bg-black/35"
        onCancel={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        onClose={() => {
          setEditing(null);
          setMutationError("");
        }}
      >
        <form onSubmit={save} className="space-y-4" aria-busy={busy}>
          <h2 id="storage-edit-title" className="text-xl font-bold">
            แก้ไขแม่แบบ
          </h2>
          <label className="flex flex-col gap-2">
            ชื่อแม่แบบ
            <Input
              value={editing?.template_name ?? ""}
              onChange={(event) => {
                if (editing) {
                  setEditing({ ...editing, template_name: event.target.value });
                }
              }}
              required
              maxLength={255}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-2">
            หัวข้อเอกสารของแม่แบบ
            <select
              className={selectClass}
              value={editing?.document_category_id ?? ""}
              onChange={(event) => {
                if (editing) {
                  setEditing({
                    ...editing,
                    document_category_id: Number(event.target.value),
                  });
                }
              }}
              required
              disabled={busy}
            >
              <option value="" disabled>
                เลือกหัวข้อเอกสาร
              </option>
              {categoryOptions.map((entry) => (
                <option
                  key={entry.id}
                  value={entry.id}
                  disabled={
                    !categories.some(
                      (available) => available.id === entry.id
                    ) && editingOriginalCategory !== entry.id
                  }
                >
                  {entry.type}
                </option>
              ))}
            </select>
          </label>
          {mutationError && editing ? (
            <Notice tone="danger">{mutationError}</Notice>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => editDialog.current?.close()}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              disabled={busy || !editing?.template_name.trim()}
            >
              {busy ? <Spinner /> : null}บันทึกการแก้ไข
            </Button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={dialog}
        aria-labelledby="storage-delete-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-[var(--paper)] p-6 text-[var(--ink)] backdrop:bg-black/35"
        onCancel={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        onClose={() => {
          setDeleting(null);
          setMutationError("");
        }}
      >
        <h2 id="storage-delete-title" className="text-xl font-bold">
          ยืนยันลบแม่แบบ
        </h2>
        <p className="my-4 break-words">
          ลบ {deleting?.template_name} ออกจากตัวเลือกในอนาคตเท่านั้น ไม่ลบไฟล์ DCM
        </p>
        {mutationError && deleting ? (
          <Notice tone="danger">{mutationError}</Notice>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              void remove();
            }}
          >
            {busy ? <Spinner /> : null}ยืนยันลบ
          </Button>
        </div>
      </dialog>
    </div>
  );
};
export const Route = createFileRoute("/admin/storage-templates")({
  component: StorageTemplatesPage,
});
