// oxlint-disable require-await -- Transport fixture uses fetch's promise contract.
import type * as RouterModule from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/admin/forms/new";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useBlocker: vi.fn(), useNavigate: () => vi.fn() };
});
const Creator = Route.options.component as ComponentType;

beforeEach(() => {
  vi.restoreAllMocks();
});
describe("Excel template creator", () => {
  it("clears a selected DOCX upload when switching to blank Excel and restores DOCX upload choices", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) =>
        init?.method === "POST"
          ? Response.json({ form: { publicId: "excel" } })
          : Response.json({ excel: true })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<Creator />);
    fireEvent.click(screen.getByRole("radio", { name: /อัปโหลดไฟล์ DOCX/u }));
    fireEvent.change(screen.getByLabelText("ไฟล์ต้นแบบ (.docx)"), {
      target: { files: [new File(["word"], "original.docx")] },
    });
    fireEvent.change(screen.getByLabelText("ชื่อแบบฟอร์ม"), {
      target: { value: "Excel" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Excel (XLSX)" }));
    expect(screen.getByLabelText("ชื่อแบบฟอร์ม")).toHaveValue("Excel");
    expect(
      screen.queryByRole("radio", { name: /อัปโหลดไฟล์/u })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ไฟล์ต้นแบบ/u)).not.toBeInTheDocument();
    fireEvent.submit(
      screen
        .getByRole("button", { name: "สร้างแบบร่าง" })
        .closest("form") as HTMLFormElement
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST")
      ).toBe(true)
    );
    const request = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST"
    )?.[1];
    const body = request?.body as FormData;
    expect(body.get("documentKind")).toBe("xlsx");
    expect(body.get("source")).toBe("blank");
    expect(body.has("template")).toBe(false);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "สร้างแบบร่าง" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("radio", { name: "Word (DOCX)" }));
    fireEvent.click(screen.getByRole("radio", { name: /อัปโหลดไฟล์ DOCX/u }));
    expect(screen.getByLabelText("ไฟล์ต้นแบบ (.docx)")).toHaveAttribute(
      "accept",
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(screen.queryByText(/เลือกแล้ว/u)).not.toBeInTheDocument();
  });
  it("retains DOCX upload validation and submits the selected Word file", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) =>
        init?.method === "POST"
          ? Response.json({ form: { publicId: "word" } })
          : Response.json({ excel: true })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<Creator />);
    fireEvent.click(screen.getByRole("radio", { name: /อัปโหลดไฟล์ DOCX/u }));
    const input = screen.getByLabelText("ไฟล์ต้นแบบ (.docx)");
    fireEvent.change(input, {
      target: { files: [new File(["excel"], "wrong.xlsx")] },
    });
    expect(screen.getByText("รองรับเฉพาะไฟล์ DOCX")).toBeInTheDocument();
    fireEvent.change(input, {
      target: { files: [new File(["word"], "template.docx")] },
    });
    fireEvent.change(screen.getByLabelText("ชื่อแบบฟอร์ม"), {
      target: { value: "Word" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "สร้างแบบร่าง" })
        .closest("form") as HTMLFormElement
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST")
      ).toBe(true)
    );
    const body = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST"
    )?.[1]?.body as FormData;
    expect(body.get("documentKind")).toBe("docx");
    expect(body.get("source")).toBe("upload");
    expect((body.get("template") as File).name).toBe("template.docx");
  });
});
