import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet } from "@/lib/api";

import { formCatalogPath } from "./catalog";
import type { FormCatalogQuery, FormCatalogResponse } from "./catalog";

export const useFormCatalog = (
  query: FormCatalogQuery,
  onPageClamp: (page: number) => void
) => {
  const path = formCatalogPath(query);
  const latestPath = useRef(path);
  latestPath.current = path;
  const [data, setData] = useState<FormCatalogResponse>({
    forms: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
  const [loading, setLoading] = useState(true);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    const requestedPath = latestPath.current;
    const requestedPage = Number(
      new URLSearchParams(requestedPath.split("?")[1]).get("page")
    );
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiGet<FormCatalogResponse>(requestedPath, {
        signal: currentController.signal,
      });
      if (requestId.current === id && latestPath.current === requestedPath) {
        setData(payload);
        if (payload.pagination.page !== requestedPage) {
          onPageClamp(payload.pagination.page);
        }
      }
    } catch (caughtError) {
      if (requestId.current === id && latestPath.current === requestedPath) {
        setError(caughtError);
      }
    } finally {
      if (requestId.current === id && latestPath.current === requestedPath) {
        setSettledPath(requestedPath);
        setLoading(false);
      }
    }
  }, [onPageClamp]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [path, reload]);

  const requestPending = loading || settledPath !== path;
  return {
    data,
    error: requestPending ? null : error,
    loading: requestPending,
    reload,
  };
};
