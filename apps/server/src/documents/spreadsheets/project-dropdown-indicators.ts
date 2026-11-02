import type {
  SpreadsheetBindings,
  SpreadsheetColumn,
  SpreadsheetField,
} from "./contract";

export { spreadsheetProjectDropdownIndicatorCommand } from "./project-dropdown-indicator-command.js";

export type ProjectDropdownIndicatorTarget =
  | (Pick<SpreadsheetField, "id" | "anchor" | "label"> & { kind: "field" })
  | (Pick<SpreadsheetColumn, "id" | "offset" | "label"> & {
      anchor: string;
      kind: "column";
    });

export const projectDropdownIndicatorTargets = (
  bindings: Pick<SpreadsheetBindings, "fields" | "table">
): ProjectDropdownIndicatorTarget[] => {
  const fields = bindings.fields
    .filter((field) => field.source === "pdms-project-name")
    .map<ProjectDropdownIndicatorTarget>((field) => ({
      anchor: field.anchor,
      id: field.id,
      kind: "field",
      label: field.label,
    }));
  const { table } = bindings;
  if (!table) {
    return fields;
  }
  return [
    ...fields,
    ...table.columns
      .filter((column) => column.source === "pdms-project-name")
      .map<ProjectDropdownIndicatorTarget>((column) => ({
        anchor: table.anchor,
        id: column.id,
        kind: "column",
        label: column.label,
        offset: column.offset,
      })),
  ];
};
