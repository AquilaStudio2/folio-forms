import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Card, Notice, Spinner } from "@/components/ui";
import {
  ApiError,
  cancelLegacySsoSwitch,
  claimLegacySsoSession,
  confirmLegacySsoSwitch,
  getLegacySsoSwitch,
  safeLegacySsoReturnPath,
  setToken,
} from "@/lib/api";
import type { LegacySsoSwitch } from "@/lib/api";
import { roleFor, useAuth } from "@/lib/auth";

const switchFailureMessage =
  "คำขอนี้หมดอายุหรือไม่สามารถดำเนินการได้ กรุณาเริ่มเข้าสู่ระบบผ่านระบบเดิมอีกครั้ง";
const switchErrorMessage = (error: unknown): string =>
  error instanceof ApiError && error.code === "final_admin_required"
    ? "ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้ กรุณาเพิ่มผู้ดูแลระบบอีกคนก่อนลองใหม่ เซสชันปัจจุบันยังไม่เปลี่ยน"
    : switchFailureMessage;

const IdentityCard = ({
  title,
  identity,
}: {
  title: string;
  identity: { name: string; email: string };
}) => (
  <section className="rounded-xl border border-[var(--line)] p-4">
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
      {title}
    </h2>
    <p className="font-semibold">{identity.name}</p>
    <p className="break-all text-sm text-[var(--ink-soft)]">{identity.email}</p>
  </section>
);

const LegacySsoConfirmRoute = () => {
  const { user } = useAuth();
  const [switchDetails, setSwitchDetails] = useState<LegacySsoSwitch | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadSwitchDetails = async () => {
      try {
        const details = await getLegacySsoSwitch();
        if (!active) {
          return;
        }
        if (!safeLegacySsoReturnPath(details.returnTo)) {
          setError(switchFailureMessage);
          return;
        }
        setSwitchDetails(details);
      } catch {
        if (active) {
          setError(switchFailureMessage);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadSwitchDetails();
    return () => {
      active = false;
    };
  }, []);

  const confirmSwitch = async () => {
    if (!switchDetails) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await confirmLegacySsoSwitch(
        switchDetails.confirmationFingerprint
      );
      const returnTo = safeLegacySsoReturnPath(result.returnTo);
      if (!returnTo) {
        throw new Error("The confirmed return path is unavailable");
      }
      const token = await claimLegacySsoSession();
      if (!token) {
        throw new Error("Could not claim transferred session");
      }
      setToken(token);
      window.location.assign(returnTo);
    } catch (caughtError) {
      setError(switchErrorMessage(caughtError));
      setBusy(false);
    }
  };

  const cancelSwitch = async () => {
    if (!switchDetails) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await cancelLegacySsoSwitch(
        switchDetails.confirmationFingerprint
      );
      const returnTo = safeLegacySsoReturnPath(result.returnTo);
      if (!returnTo) {
        throw new Error("The cancelled return path is unavailable");
      }
      window.location.assign(returnTo);
    } catch {
      setError(switchFailureMessage);
      setBusy(false);
    }
  };

  let content: React.ReactNode = null;
  if (loading) {
    content = (
      <div className="flex items-center gap-3 py-8 text-sm text-[var(--ink-soft)]">
        <Spinner /> กำลังตรวจสอบคำขอ…
      </div>
    );
  } else if (error) {
    content = (
      <div className="space-y-4">
        <Notice tone="danger">{error}</Notice>
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink)] underline"
          to={roleFor(user) === "admin" ? "/admin" : "/dashboard"}
        >
          กลับไปทำงานต่อ <ArrowRight size={16} />
        </Link>
      </div>
    );
  } else if (switchDetails) {
    let identityContent: React.ReactNode;
    let confirmLabel = "ยืนยันเปลี่ยนบัญชี";
    if (switchDetails.sameUser) {
      identityContent = (
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          บัญชีระบบเดิมนี้ตรงกับบัญชีปัจจุบัน ต้องการดำเนินการต่อหรือไม่
        </p>
      );
      confirmLabel = "ดำเนินการต่อ";
    } else {
      identityContent = (
        <>
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            บัญชีระบบเดิมต่างจากบัญชีที่ใช้อยู่ การยืนยันจะเปลี่ยนเซสชัน Folio
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <IdentityCard title="บัญชีปัจจุบัน" identity={switchDetails.current} />
            <IdentityCard title="บัญชีระบบเดิม" identity={switchDetails.legacy} />
          </div>
        </>
      );
    }
    if (busy) {
      confirmLabel = "กำลังเปลี่ยนบัญชี…";
    }
    content = (
      <div className="space-y-5">
        {identityContent}
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={cancelSwitch}
          >
            ยกเลิก
          </Button>
          <Button type="button" disabled={busy} onClick={confirmSwitch}>
            {busy ? <Spinner /> : <ArrowRight size={16} />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-5 py-12 text-[var(--ink)]">
      <Card className="w-full max-w-xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--ink)]">
            <LockKeyhole size={19} />
          </span>
          <div>
            <h1 className="text-xl font-bold">ยืนยันบัญชีระบบเดิม</h1>
            <p className="text-sm text-[var(--ink-soft)]">
              ตรวจสอบบัญชีก่อนเปลี่ยนเซสชัน Folio
            </p>
          </div>
        </div>
        {content}
      </Card>
    </main>
  );
};

export const Route = createFileRoute("/legacy-sso/confirm")({
  component: LegacySsoConfirmRoute,
});
