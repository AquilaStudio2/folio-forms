import type { DocumentKind, ManifestField, Prisma } from "@onlyoffice/db";

import { excelBindingSchemas } from "../forms/excel-binding";

export interface ResultAnswerFilters {
  province?: string;
}

export const matchesResultAnswers = ({
  data,
  documentKind,
  fields,
  filters,
}: {
  data: Prisma.JsonValue | undefined;
  documentKind: DocumentKind;
  fields: readonly Pick<ManifestField, "binding" | "tag" | "type">[];
  filters: ResultAnswerFilters;
}): boolean => {
  if (filters.province === undefined) {
    return true;
  }
  if (
    !fields.some(
      (field) =>
        field.tag === "province" &&
        field.type !== "table" &&
        (documentKind !== "xlsx" ||
          excelBindingSchemas.scalar.safeParse(field.binding).success)
    )
  ) {
    return false;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  return (
    typeof data.province === "string" &&
    data.province.trim() === filters.province
  );
};
