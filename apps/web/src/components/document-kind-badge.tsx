import { FileSpreadsheet, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DocumentKind } from "@/lib/api";

export const DocumentKindBadge = ({
  documentKind = "docx",
}: {
  documentKind?: DocumentKind;
}) => {
  const spreadsheet = documentKind === "xlsx";
  const Icon = spreadsheet ? FileSpreadsheet : FileText;
  const label = spreadsheet ? "Excel (XLSX)" : "DOCX";

  return (
    <Badge
      variant="outline"
      className={
        spreadsheet
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
      }
      aria-label={`ประเภทเอกสาร: ${label}`}
    >
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
};
