import { useEffect } from "react";

interface ReauthenticationRequest {
  handled: boolean;
  resolve: (allowed: boolean) => void;
}

export const useReauthenticationGuard = (
  blocked: boolean,
  onBlocked: () => void
): void => {
  useEffect(() => {
    if (!blocked) {
      return;
    }
    const handleReauthentication = (event: Event) => {
      const { detail } = event as CustomEvent<ReauthenticationRequest>;
      if (!detail || detail.handled) {
        return;
      }
      detail.handled = true;
      detail.resolve(false);
      onBlocked();
    };
    window.addEventListener("folio:before-reauth", handleReauthentication);
    return () =>
      window.removeEventListener("folio:before-reauth", handleReauthentication);
  }, [blocked, onBlocked]);
};
