import type * as RouterModule from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Route as SubmissionsRoute } from "@/routes/admin/forms/$formId/submissions/index";
import { Route as ResultsRoute } from "@/routes/admin/results/index";
import { Route as DashboardRoute } from "@/routes/dashboard";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ loading: false, user: { id: "user", role: "admin" } }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof RouterModule>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useParams: () => ({ formId: "form" }),
  useSearch: () => ({}),
}));

beforeEach(() => {
  const rows = ["docx", "xlsx"].map((documentKind) => ({
    documentKind,
    formPublicId: documentKind,
    formTitle: `Form ${documentKind}`,
    id: documentKind,
    state: "draft",
    status: "draft",
    userEmail: `${documentKind}@example.test`,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          nextCursor: null,
          responses: rows,
          results: rows,
          submissions: rows,
        })
      )
    )
  );
});

describe("document kind badges on response lists", () => {
  it.each([
    ["dashboard", DashboardRoute],
    ["admin results", ResultsRoute],
    ["form submissions", SubmissionsRoute],
  ] as const)("shows DOCX and Excel kinds on %s", async (_name, route) => {
    const Page = route.options.component as ComponentType;
    render(<Page />);
    expect(
      await screen.findByLabelText("ประเภทเอกสาร: DOCX")
    ).toHaveTextContent("DOCX");
    expect(
      screen.getByLabelText("ประเภทเอกสาร: Excel (XLSX)")
    ).toHaveTextContent("Excel (XLSX)");
  });
});
