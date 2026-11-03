import type { DocumentKind, ManifestField, Prisma } from "@onlyoffice/db";
import { monthChoices, provinceChoices } from "@onlyoffice/results-filters";
import type { ResultAnswerDisplayValue } from "@onlyoffice/results-filters";

import { excelBindingSchemas } from "../forms/excel-binding";

export interface ResultAnswerFilters {
  fiscal_year?: string;
  month?: string;
  province?: string;
}

export interface ResultAnswerValues {
  fiscalYear: ResultAnswerDisplayValue;
  month: ResultAnswerDisplayValue;
  province: ResultAnswerDisplayValue;
}

const displayValue = (
  value: Prisma.JsonValue | undefined
): ResultAnswerDisplayValue => {
  if (typeof value === "string") {
    return value.trim() ? value : null;
  }
  return typeof value === "number" || typeof value === "boolean" ? value : null;
};

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
  return {
    fiscalYear: displayValue(valueFor("fiscal_year")),
    month: displayValue(valueFor("month")),
    province: displayValue(valueFor("province")),
  };
};

export const matchesResultAnswers = ({
  filters,
  values,
}: {
  filters: ResultAnswerFilters;
  values: ResultAnswerValues;
}): boolean => {
  const province =
    typeof values.province === "string" &&
    provinceChoices.includes(values.province.trim())
      ? values.province.trim()
      : null;
  const month =
    typeof values.month === "string" && monthChoices.includes(values.month)
      ? values.month
      : null;
  const fiscalYear = savedFiscalYear(values.fiscalYear);
  return (
    (filters.province === undefined || province === filters.province) &&
    (filters.month === undefined || month === filters.month) &&
    (filters.fiscal_year === undefined ||
      String(fiscalYear) === filters.fiscal_year)
  );
};
