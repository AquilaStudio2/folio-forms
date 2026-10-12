import { createFileRoute } from "@tanstack/react-router";

import { AdminFormsPage } from "@/features/admin-forms/admin-forms-page";

export const Route = createFileRoute("/admin/")({ component: AdminFormsPage });
