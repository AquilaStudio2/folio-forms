import type { DocumentKind, ManifestField, Prisma } from "@onlyoffice/db";
import { monthChoices, provinceChoices } from "@onlyoffice/results-filters";

import { excelBindingSchemas } from "../forms/excel-binding";

export interface ResultAnswerFilters {
  fiscal_year?: string;
  month?: string;
  province?: string;
}

export interface ResultAnswerValues {
  fiscalYear: number | null;
  month: string | null;
  province: string | null;
}

const savedFiscalYear = (
  value: Prisma.JsonValue | undefined
): number | null => {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  if (typeof value === "string" && !/^[1-9]\d*$/u.test(value)) {
    return null;
  }
  const year = Number(value);
  return Number.isSafeInteger(year) && year > 0 ? year : null;
};

export const resultAnswerValues = ({
  data,
  documentKind,
  fields,
}: {
  data: Prisma.JsonValue | undefined;
  documentKind: DocumentKind;
  fields: readonly Pick<ManifestField, "binding" | "tag" | "type">[];
}): ResultAnswerValues => {
  const valueFor = (tag: keyof ResultAnswerFilters) => {
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !fields.some(
        (field) =>
          field.tag === tag &&
          field.type !== "table" &&
          (documentKind !== "xlsx" ||
            excelBindingSchemas.scalar.safeParse(field.binding).success)
      )
    ) {
      return;
    }
    return data[tag];
  };
  const province = valueFor("province");
  const month = valueFor("month");
  return {
    fiscalYear: savedFiscalYear(valueFor("fiscal_year")),
    month:
      typeof month === "string" && monthChoices.includes(month) ? month : null,
    province:
      typeof province === "string" && provinceChoices.includes(province.trim())
        ? province.trim()
        : null,
  };
};

export const matchesResultAnswers = ({
  filters,
  values,
}: {
  filters: ResultAnswerFilters;
  values: ResultAnswerValues;
}): boolean =>
  (filters.province === undefined || values.province === filters.province) &&
  (filters.month === undefined || values.month === filters.month) &&
  (filters.fiscal_year === undefined ||
    String(values.fiscalYear) === filters.fiscal_year);
