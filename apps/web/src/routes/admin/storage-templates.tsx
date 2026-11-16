import { createFileRoute, Navigate } from "@tanstack/react-router";
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
  "min-h-11 rounded-[10px] border border-[var(--line-strong)] bg-[var(--paper)] px-3";
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
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<StorageTemplate | null>(null);
  const [deleting, setDeleting] = useState<StorageTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const editForm = useRef<HTMLFormElement>(null);
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
  const reset = () => {
    setEditing(null);
    setName("");
    setCategory("");
    setMutationError("");
  };
  const categoryOptions = [...categories];
  for (const id of new Set(
    templates.map((template) => template.document_category_id)
  )) {
    if (!categoryOptions.some((entry) => entry.id === id)) {
      categoryOptions.push({ id, type: "หัวข้อที่บันทึกไว้" });
    }
  }
  const visible = templates.filter(
    (template) => !filter || template.document_category_id === Number(filter)
  );
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setMutationError("");
    try {
      const data = {
        document_category_id: Number(category),
        template_name: name,
      };
      await (editing
        ? apiPatch(`${endpoint}/${editing.id}`, data)
        : apiPost(endpoint, data));
      setFilter(category);
      reset();
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
      setDeleting(null);
      if (editing?.id === deleting.id) {
        reset();
      }
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
        title="แม่แบบจัดเก็บเอกสาร"
        description="จัดการรายการของ Folio เท่านั้น ชื่อแม่แบบต้องตรงกับ DCM การแก้รายการไม่เปลี่ยนไฟล์หรือแบบฟอร์มที่เผยแพร่แล้ว"
      />
      {categoryLoading ? (
        <p role="status">
          <Spinner /> กำลังโหลดหัวข้อเอกสาร
        </p>
      ) : null}
      {categoryError ? (
        <Notice tone="danger">
          โหลดหัวข้อเอกสารไม่สำเร็จ: {categoryError} รายการที่บันทึกไว้ยังคงเดิม
        </Notice>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy || categoryLoading}
        onClick={() => {
          void refreshCategories();
        }}
      >
        โหลดหัวข้อเอกสารใหม่
      </Button>
      <label className="flex flex-col gap-2">
        หัวข้อเอกสาร
        <select
          className={selectClass}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          disabled={busy}
        >
          <option value="">ทุกหัวข้อ</option>
          {categoryOptions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.type} (ID {entry.id})
            </option>
          ))}
        </select>
      </label>
      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold">
          {editing ? "แก้ไขแม่แบบ" : "เพิ่มแม่แบบ"}
        </h2>
        <form ref={editForm} onSubmit={save} className="space-y-4">
          <label className="flex flex-col gap-2">
            ชื่อแม่แบบ
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={255}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-2">
            หัวข้อเอกสารของแม่แบบ
            <select
              className={selectClass}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              disabled={busy}
            >
              <option value="">เลือกหัวข้อเอกสาร</option>
              {categoryOptions.map((entry) => (
                <option
                  key={entry.id}
                  value={entry.id}
                  disabled={
                    !categories.some(
                      (available) => available.id === entry.id
                    ) && editing?.document_category_id !== entry.id
                  }
                >
                  {entry.type} (ID {entry.id})
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy || !name.trim() || !category}>
            {busy ? <Spinner /> : null}บันทึกแม่แบบ
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={reset}
            >
              ยกเลิกแก้ไข
            </Button>
          ) : null}
        </form>
      </Card>
      {mutationError && !deleting ? (
        <Notice tone="danger">{mutationError}</Notice>
      ) : null}
      {listLoading ? (
        <p role="status">
          <Spinner /> กำลังโหลดแม่แบบ
        </p>
      ) : null}
      {listError ? (
        <Notice tone="danger">โหลดรายการไม่สำเร็จ: {listError}</Notice>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy || listLoading}
        onClick={() => {
          void refreshList();
        }}
      >
        โหลดรายการใหม่
      </Button>
      {!listLoading && !listError && visible.length === 0 ? (
        <Notice>ยังไม่มีแม่แบบในหัวข้อที่เลือก</Notice>
      ) : null}
      <ul className="space-y-3">
        {visible.map((template) => (
          <li key={template.id}>
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div className="mr-auto">
                <strong>{template.template_name}</strong>
                <p>
                  {
                    categoryOptions.find(
                      (entry) => entry.id === template.document_category_id
                    )?.type
                  }{" "}
                  (ID {template.document_category_id})
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy || listLoading || Boolean(listError)}
                onClick={() => {
                  setEditing(template);
                  setName(template.template_name);
                  setCategory(String(template.document_category_id));
                  setMutationError("");
                  editForm.current?.querySelector("input")?.focus();
                }}
              >
                แก้ไข
              </Button>
              <Button
                variant="danger"
                disabled={busy || listLoading || Boolean(listError)}
                onClick={() => {
                  setDeleting(template);
                  setMutationError("");
                  dialog.current?.showModal();
                }}
              >
                ลบ
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        aria-labelledby="storage-delete-title"
        className="m-auto max-w-lg rounded-xl bg-[var(--paper)] p-6 text-[var(--ink)] backdrop:bg-black/35"
        onCancel={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        onClose={() => setDeleting(null)}
      >
        <h2 id="storage-delete-title" className="text-xl font-bold">
          ยืนยันลบแม่แบบ
        </h2>
        <p className="my-4">
          ลบ {deleting?.template_name} ออกจากตัวเลือกในอนาคตเท่านั้น ไม่ลบไฟล์ DCM
        </p>
        {mutationError ? <Notice tone="danger">{mutationError}</Notice> : null}
        <div className="mt-4 flex gap-3">
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
            ยืนยันลบ
          </Button>
        </div>
      </dialog>
    </div>
  );
};
export const Route = createFileRoute("/admin/storage-templates")({
  component: StorageTemplatesPage,
});
