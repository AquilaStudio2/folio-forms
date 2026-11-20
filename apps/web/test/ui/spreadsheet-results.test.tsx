import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SpreadsheetTable,
  SubmissionFields,
} from "@/components/submission-result-viewer";
import type { SpreadsheetResultContract } from "@/lib/api";

const table: NonNullable<SpreadsheetResultContract["table"]> = {
  columns: [
    {
      computed: false,
      id: "folio_value",
      key: "value",
      label: "จำนวน",
      offset: 0,
      options: [],
      required: false,
      type: "number",
    },
    {
      computed: false,
      id: "folio_bool",
      key: "approved",
      label: "อนุมัติ",
      offset: 1,
      options: [],
      required: false,
      type: "boolean",
    },
  ],
  id: "folio_table",
  key: "activities",
  label: "รายการ",
};

const receipt = (file_link: string, row_index?: number) => ({
  file_link,
  file_token: "private-receipt-token",
  original_name: "proof.bin",
  size_bytes: 0,
  ...(row_index === undefined ? {} : { row_index }),
});
describe("Excel result table", () => {
  it("shows zero and false and paginates without dropping rows", () => {
    const rows = Array.from({ length: 1051 }, (_, index) => ({
      approved: false,
      value: index,
    }));
    render(<SpreadsheetTable data={{ activities: rows }} table={table} />);
    expect(screen.getByText("รายการ (1051 รายการ)")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("ไม่ใช่")).toHaveLength(50);
    expect(screen.queryByText("50")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText("หน้า 2 / 22")).toBeInTheDocument();
  });
  it("renders only declared selected-revision URLs, including physical rows, without tokens or mutation controls", () => {
    const attachmentField = {
      attachment: { category: "หลักฐาน" },
      computed: false,
      id: "folio_proof",
      key: "proof",
      label: "หลักฐาน",
      options: [],
      required: true,
      type: "text" as const,
    };
    const contract: SpreadsheetResultContract = {
      fields: [attachmentField],
      locations: {},
      table: { ...table, columns: [{ ...attachmentField, offset: 0 }] },
      version: 1,
    };
    const fields = [
      {
        label: "หลักฐาน",
        options: [],
        placeholder: null,
        position: 0,
        tag: "proof",
        type: "text" as const,
      },
    ];
    const latest = {
      activities: [{ proof: receipt("https://files.test/latest-row", 2) }],
      proof: receipt("https://files.test/latest"),
    };
    const { rerender, container } = render(
      <SubmissionFields
        data={latest}
        fields={fields}
        pictures={null}
        spreadsheetContract={contract}
      />
    );
    expect(
      screen.getByRole("link", { name: "https://files.test/latest" })
    ).toHaveAttribute("href", "https://files.test/latest");
    rerender(
      <SubmissionFields
        data={{
          activities: [{ proof: receipt("https://files.test/older-row", 2) }],
          proof: receipt("https://files.test/older-missing"),
        }}
        fields={fields}
        pictures={null}
        spreadsheetContract={contract}
      />
    );
    expect(
      screen.getByRole("link", { name: "https://files.test/older-missing" })
    ).toHaveAttribute("href", "https://files.test/older-missing");
    expect(
      screen.getByRole("link", { name: "https://files.test/older-row" })
    ).toHaveAttribute("href", "https://files.test/older-row");
    expect(
      screen.queryByRole("link", { name: "https://files.test/latest" })
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("private-receipt-token");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(/URL สาธารณะ/u)).toBeInTheDocument();
    rerender(
      <SubmissionFields
        data={{ proof: receipt("data:text/html,untrusted-file") }}
        fields={fields}
        pictures={null}
        spreadsheetContract={contract}
      />
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/ลิงก์ของฉบับนี้ไม่พร้อมใช้งาน/u)).toBeInTheDocument();
  });
});
