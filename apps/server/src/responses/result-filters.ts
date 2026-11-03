import type { DocumentKind, ManifestField, Prisma } from "@onlyoffice/db";

import { excelBindingSchemas } from "../forms/excel-binding";

export interface ResultAnswerFilters {
  month?: string;
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
  if (filters.province === undefined && filters.month === undefined) {
    return true;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  return (["province", "month"] satisfies (keyof ResultAnswerFilters)[]).every(
    (tag) => {
      const expected = filters[tag];
      if (expected === undefined) {
        return true;
      }
      if (
        !fields.some(
          (field) =>
            field.tag === tag &&
            field.type !== "table" &&
            (documentKind !== "xlsx" ||
              excelBindingSchemas.scalar.safeParse(field.binding).success)
        )
      ) {
        return false;
      }
      const value = data[tag];
      return (
        typeof value === "string" &&
        (tag === "province" ? value.trim() : value) === expected
      );
    }
  );
};
