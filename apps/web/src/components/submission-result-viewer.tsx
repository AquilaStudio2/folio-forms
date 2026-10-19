import type { KeyboardEvent } from "react";
import { useState } from "react";

import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
import { Badge, Notice } from "@/components/ui";
import { formatDateTime } from "@/lib/api";
import type {
  ReceiptField,
  ResponseRevision,
  SpreadsheetResultContract,
} from "@/lib/api";

const fieldValue = (
  field: ReceiptField,
  value: unknown,
  picturePresent?: boolean
): string => {
  if (field.type === "picture") {
    if (picturePresent === undefined) {
      return "รูปภาพตรวจสอบไม่ได้";
    }
    return picturePresent ? "มีรูปภาพแนบ" : "ไม่มีรูปภาพ";
  }
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (
    (field.type === "checkbox" || field.type === "boolean") &&
    typeof value === "boolean"
  ) {
    return value ? "ใช่" : "ไม่ใช่";
  }
  if (typeof value === "string") {
    return (
      field.options.find((option) => option.value === value)?.displayText ??
      value
    );
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "มีข้อมูลที่บันทึกแล้ว";
};

const spreadsheetDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "ใช่" : "ไม่ใช่";
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "—";
};

export const SpreadsheetTable = ({
  data,
  table,
}: {
  data: Record<string, unknown>;
  table: NonNullable<SpreadsheetResultContract["table"]>;
}) => {
  const [page, setPage] = useState(0);
  const rows = Array.isArray(data[table.key])
    ? (data[table.key] as Record<string, unknown>[])
    : [];
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="mt-6">
      <h3 className="font-semibold">
        {table.label} ({rows.length} รายการ)
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{table.label}</caption>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th className="border p-3" scope="col" key={column.id}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice(currentPage * 50, (currentPage + 1) * 50)
              .map((row, index) => (
                <tr key={currentPage * 50 + index}>
                  {table.columns.map((column) => (
                    <td
                      className="border p-3 whitespace-pre-wrap"
                      key={column.id}
                    >
                      {spreadsheetDisplayValue(row?.[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-3 items-center">
        <button
          type="button"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          หน้าก่อนหน้า
        </button>
        <span aria-live="polite">
          หน้า {currentPage + 1} / {pages}
        </span>
        <button
          type="button"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          หน้าถัดไป
        </button>
      </div>
    </section>
  );
};

export const SubmissionFields = ({
  data,
  fields,
  pictures,
  title = "ข้อมูลคำตอบ",
  spreadsheetContract,
}: {
  data: Record<string, unknown>;
  fields: ReceiptField[];
  pictures: Record<string, boolean> | null;
  title?: string;
  spreadsheetContract?: SpreadsheetResultContract | null;
}) => (
  <>
    <h2 className="mb-4 font-semibold">{title}</h2>
    <dl className="space-y-3">
      {fields.map((field) => (
        <div
          className="rounded-[10px] border border-[var(--line)] p-4"
          key={field.tag}
        >
          <dt className="font-semibold">{field.label}</dt>
          <dd className="mt-2 whitespace-pre-wrap break-words text-[var(--ink-soft)]">
            {fieldValue(field, data[field.tag], pictures?.[field.tag])}
          </dd>
        </div>
      ))}
    </dl>
    {spreadsheetContract?.table ? (
      <SpreadsheetTable data={data} table={spreadsheetContract.table} />
    ) : null}
  </>
);

export const SubmissionRevisionHistory = ({
  className,
  revisions,
}: {
  className: string;
  revisions: ResponseRevision[];
}) => (
  <ol className={className}>
    {revisions.map((revision) => (
      <li
        className="rounded-[10px] border border-[var(--line)] p-3 text-sm"
        key={revision.revision}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={revision.revision === 0 ? "neutral" : "warning"}>
            {revision.revision === 0
              ? "Submission เดิม"
              : `Correction ${revision.revision}`}
          </Badge>
          <span className="text-[var(--ink-soft)]">
            {formatDateTime(revision.createdAt)}
          </span>
        </div>
        {revision.reason ? (
          <p className="mt-2 text-[var(--ink-soft)]">
            เหตุผล: {revision.reason}
          </p>
        ) : null}
        {revision.actorName || revision.actorEmail ? (
          <p className="mt-1 text-[var(--ink-soft)]">
            ผู้แก้ไข: {revision.actorName ?? revision.actorEmail}
          </p>
        ) : null}
      </li>
    ))}
  </ol>
);
export const SubmissionResultViewer = ({
  configUrl,
  data,
  documentAvailable,
  fields,
  fieldsError,
  pictures,
  spreadsheetContract,
}: {
  configUrl?: string;
  data: Record<string, unknown>;
  documentAvailable: boolean | null;
  fields: ReceiptField[];
  fieldsError?: string | null;
  spreadsheetContract?: SpreadsheetResultContract | null;
  pictures: Record<string, boolean> | null;
}) => {
  const [activeTab, setActiveTab] = useState<"document" | "fields">("document");
  const activateAdjacentTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const nextTab = activeTab === "document" ? "fields" : "document";
    setActiveTab(nextTab);
    document
      .querySelector<HTMLButtonElement>(`#submission-${nextTab}-tab`)
      ?.focus();
  };

  let fieldsContent: React.ReactNode = null;
  if (activeTab === "fields") {
    fieldsContent = fieldsError ? (
      <Notice tone="danger">{fieldsError}</Notice>
    ) : (
      <SubmissionFields
        data={data}
        fields={fields}
        pictures={pictures}
        spreadsheetContract={spreadsheetContract}
      />
    );
  }

  return (
    <div>
      <div
        aria-label="Result view"
        className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-4"
        role="tablist"
      >
        <button
          aria-controls="submission-document-panel"
          aria-selected={activeTab === "document"}
          className={`min-h-10 rounded-[10px] border border-[var(--line-strong)] px-3 text-sm font-semibold ${
            activeTab === "document"
              ? "bg-[var(--ink)] text-[var(--paper)]"
              : "bg-[var(--paper)] text-[var(--ink-soft)]"
          }`}
          id="submission-document-tab"
          onClick={() => setActiveTab("document")}
          onKeyDown={activateAdjacentTab}
          role="tab"
          type="button"
        >
          Document
        </button>
        <button
          aria-controls="submission-fields-panel"
          aria-selected={activeTab === "fields"}
          className={`min-h-10 rounded-[10px] border border-[var(--line-strong)] px-3 text-sm font-semibold ${
            activeTab === "fields"
              ? "bg-[var(--ink)] text-[var(--paper)]"
              : "bg-[var(--paper)] text-[var(--ink-soft)]"
          }`}
          id="submission-fields-tab"
          onClick={() => setActiveTab("fields")}
          onKeyDown={activateAdjacentTab}
          role="tab"
          type="button"
        >
          Fields
        </button>
      </div>
      <div
        aria-labelledby="submission-document-tab"
        className="pt-4"
        hidden={activeTab !== "document"}
        id="submission-document-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "document" &&
        documentAvailable !== false &&
        configUrl ? (
          <OnlyOfficeEditor
            configUrl={configUrl}
            readOnly
            title="Read-only submission document"
          />
        ) : null}
        {activeTab === "document" &&
        (documentAvailable === false || !configUrl) ? (
          <Notice>เอกสารสำหรับฉบับนี้ไม่พร้อมใช้งาน</Notice>
        ) : null}
      </div>
      <div
        aria-labelledby="submission-fields-tab"
        className="pt-4"
        hidden={activeTab !== "fields"}
        id="submission-fields-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {fieldsContent}
      </div>
    </div>
  );
};
