import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpreadsheetTable } from "@/components/submission-result-viewer";
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
});
