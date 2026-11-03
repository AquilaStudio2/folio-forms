import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  FileText,
  KeyRound,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  UserRound,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import { LegacySsoSwitchButton } from "@/components/legacy-sso-switch-button";
import { Button, Notice, Spinner } from "@/components/ui";
import { ApiError, homePathForRole } from "@/lib/api";
import { roleFor, useAuth } from "@/lib/auth";

const navigationLinkClassName =
  "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] [&>svg]:shrink-0";

const AdminNavigation = ({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) => {
  const formsAreActive =
    pathname === "/admin" || pathname.startsWith("/admin/forms/");
  const auditAreActive = pathname.startsWith("/admin/audit");
  const resultsAreActive = pathname.startsWith("/admin/results");
  const authoringIsActive = pathname.startsWith("/admin/ai-authoring");

  return (
    <>
      <Link
        to="/admin"
        className={`${navigationLinkClassName} ${
          formsAreActive ? "bg-[var(--accent-soft)] text-[var(--ink)]" : ""
        }`}
        activeOptions={{ exact: true }}
        aria-current={formsAreActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <FileText size={16} />
        แบบฟอร์ม
      </Link>
      <Link
        to="/admin/results"
        search={{ form: undefined }}
        className={`${navigationLinkClassName} ${
          resultsAreActive ? "bg-[var(--accent-soft)] text-[var(--ink)]" : ""
        }`}
        aria-current={resultsAreActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <ClipboardList size={16} />
        ผลลัพธ์
      </Link>
      <Link
        to="/admin/audit"
        className={`${navigationLinkClassName} ${
          auditAreActive ? "bg-[var(--accent-soft)] text-[var(--ink)]" : ""
        }`}
        aria-current={auditAreActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <ScrollText size={16} />
        Audit Trail
      </Link>
      <Link
        to="/admin/users"
        className={navigationLinkClassName}
        activeProps={{
          className: "bg-[var(--accent-soft)] text-[var(--ink)]",
        }}
        onClick={onNavigate}
      >
        <UsersRound size={16} />
        จัดการผู้ใช้
      </Link>
      <Link
        to="/admin/ai-authoring"
        className={`${navigationLinkClassName} ${
          authoringIsActive ? "bg-[var(--accent-soft)] text-[var(--ink)]" : ""
        }`}
        aria-current={authoringIsActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <WandSparkles size={16} />
        AI Authoring
      </Link>
    </>
  );
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState<"cleanup" | "sign-out" | null>(
    null
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const role = roleFor(user);
  const homePath = homePathForRole(role);
  const [legacySsoError, setLegacySsoError] = useState(false);

  const logout = async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await signOut();
      await navigate({
        replace: true,
        search: { returnTo: undefined },
        to: "/login",
      });
    } catch (error) {
      setLogoutError(
        error instanceof ApiError && error.sessionRevoked
          ? "cleanup"
          : "sign-out"
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-5 py-3 lg:px-8">
          <Link
            to={homePath}
            className="flex w-fit shrink-0 items-center gap-3 whitespace-nowrap"
            onClick={() => setOpen(false)}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--ink)] text-[var(--accent)]">
              <FileText size={18} strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold tracking-[-0.03em]">
              Folio Forms
            </span>
          </Link>
          <button
            className="justify-self-end rounded-lg p-2 lg:hidden"
            type="button"
            aria-label="เปิดหรือปิดเมนูนำทาง"
            aria-expanded={open}
            aria-controls="main-navigation account-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav
            id="main-navigation"
            className={`${open ? "flex" : "hidden"} col-span-2 flex-col gap-1 border-t border-[var(--line)] pt-3 lg:row-start-2 lg:flex lg:flex-row lg:items-center lg:gap-2`}
            aria-label="เมนูหลัก"
          >
            {role === "admin" ? (
              <AdminNavigation
                pathname={location.pathname}
                onNavigate={() => setOpen(false)}
              />
            ) : null}
            {role === "viewer" ? (
              <Link
                to="/admin/results"
                search={{ form: undefined }}
                className={navigationLinkClassName}
                onClick={() => setOpen(false)}
              >
                <ClipboardList size={16} />
                ผลลัพธ์
              </Link>
            ) : null}
            {role === "user" ? (
              <Link
                to="/dashboard"
                className={navigationLinkClassName}
                activeProps={{
                  className: "bg-[var(--accent-soft)] text-[var(--ink)]",
                }}
                onClick={() => setOpen(false)}
              >
                My responses
              </Link>
            ) : null}
          </nav>
          <div
            id="account-navigation"
            role="group"
            aria-label="บัญชีผู้ใช้"
            className={`${open ? "flex" : "hidden"} col-span-2 min-w-0 flex-col gap-2 whitespace-nowrap border-t border-[var(--line)] pt-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:flex lg:flex-row lg:items-center lg:justify-end lg:border-0 lg:pt-0 [&_svg]:shrink-0`}
          >
            <div className="flex flex-col items-start gap-1 lg:flex-row lg:items-center">
              <LegacySsoSwitchButton
                onError={() => setLegacySsoError(true)}
                onStart={() => {
                  setOpen(false);
                  setLegacySsoError(false);
                }}
              />
              <Link
                to="/change-password"
                search={{
                  returnTo: homePath,
                }}
                className={navigationLinkClassName}
                onClick={() => setOpen(false)}
              >
                <KeyRound size={16} />
                เปลี่ยนรหัสผ่าน
              </Link>
            </div>
            <span className="mx-1 hidden h-6 w-px bg-[var(--line)] lg:block" />
            <span className="flex w-fit min-w-0 items-center gap-2 rounded-full bg-[var(--muted-soft)] px-3 py-1.5 text-sm text-[var(--ink-soft)]">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                {role === "admin" ? (
                  <ShieldCheck size={15} />
                ) : (
                  <UserRound size={15} />
                )}
              </span>
              <span className="max-w-36 truncate">
                {user?.name ?? user?.email}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="min-h-10 justify-start whitespace-nowrap lg:justify-center"
              disabled={loggingOut}
              onClick={logout}
            >
              {loggingOut ? <Spinner /> : <LogOut size={15} />}
              {loggingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
            </Button>
          </div>
        </div>
      </header>
      {logoutError ? (
        <div className="mx-auto max-w-[1240px] px-5 pt-4 lg:px-8">
          <Notice tone="danger">
            {logoutError === "cleanup"
              ? "ออกจากระบบแล้ว แต่การล้างข้อมูล AI ไม่สำเร็จ"
              : "ไม่สามารถออกจากระบบได้ กรุณาลองใหม่อีกครั้ง"}
          </Notice>
        </div>
      ) : null}
      {legacySsoError ? (
        <div className="mx-auto max-w-[1240px] px-5 pt-4 lg:px-8">
          <Notice tone="danger">ไม่สามารถเชื่อมต่อบัญชีระบบเดิมได้ กรุณาลองอีกครั้ง</Notice>
        </div>
      ) : null}
      <main className="mx-auto max-w-[1240px] px-5 py-8 lg:px-8 lg:py-12">
        {children}
      </main>
    </div>
  );
};

export const PageHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.04em] lg:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 max-w-[68ch] text-[var(--ink-soft)]">
          {description}
        </p>
      ) : null}
    </div>
    {action}
  </div>
);
