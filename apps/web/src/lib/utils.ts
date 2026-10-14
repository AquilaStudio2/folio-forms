import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...values: ClassValue[]) => twMerge(clsx(values));

export const formatDate = (value: string | undefined) => {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value)
  );
};
