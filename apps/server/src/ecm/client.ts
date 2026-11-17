import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Prisma, prisma } from "@onlyoffice/db";
import { z } from "zod";

import { fail } from "../http/errors";

export interface EcmConfiguration {
  apiUrl: string;
  username: string;
  password: string;
  encryptionKey: string;
}

export interface EcmRuntime {
  now: () => number;
  sleep: (milliseconds: number) => Promise<unknown>;
  timeoutSignal: (milliseconds: number) => AbortSignal;
  fetch: typeof fetch;
}

const runtime: EcmRuntime = {
  fetch,
  now: Date.now,
  sleep: Bun.sleep,
  timeoutSignal: AbortSignal.timeout,
};
const skewMs = 30_000;
const renewAheadMs = 12 * 60 * 60 * 1000;
const authBudgetMs = 30_000;
const persistenceAllowanceMs = 5000;
const unavailable = (): never =>
  fail(
    503,
    "ecm_unavailable",
    "ระบบเอกสารแนบยังไม่พร้อม กรุณาติดต่อผู้ดูแล โดยไม่ต้องเข้าสู่ระบบ Folio ใหม่"
  );
const rejected = (): never =>
  fail(
    502,
    "ecm_rejected",
    "ระบบเอกสารแนบปฏิเสธคำขอ กรุณาติดต่อผู้ดูแล โดยไม่ต้องเข้าสู่ระบบ Folio ใหม่"
  );

export const ecmConfigurationFromEnv = (): EcmConfiguration | null => {
  const { ECM_API_URL, ECM_USERNAME, ECM_PASSWORD, ECM_TOKEN_ENCRYPTION_KEY } =
    process.env;
  return ECM_API_URL || ECM_USERNAME || ECM_PASSWORD || ECM_TOKEN_ENCRYPTION_KEY
    ? {
        apiUrl: ECM_API_URL ?? "",
        encryptionKey: ECM_TOKEN_ENCRYPTION_KEY ?? "",
        password: ECM_PASSWORD ?? "",
        username: ECM_USERNAME ?? "",
      }
    : null;
};

const configurationSchema = z.object({
  apiUrl: z.url(),
  encryptionKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  password: z.string().min(1),
  username: z.string().min(1),
});
const loginResponse = z.object({
  data: z.object({
    expire: z
      .string()
      .transform((value) =>
        // DCM's local timestamps are UTC+7, not the Folio host timezone.
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)
          ? `${value.replace(" ", "T")}+07:00`
          : value
      )
      .pipe(z.iso.datetime({ offset: true })),
    token: z
      .string()
      .min(1)
      .max(16_384)
      .regex(/^[!-~]+$/u),
  }),
});
interface AuthState {
  account_key: string;
  generation: bigint;
  status: string;
  owner: string | null;
  deadline: Date | null;
  lease_until: Date | null;
  encrypted_token: string | null;
  expires_at: Date | null;
}
interface Bearer {
  token: string;
  generation: bigint;
}

type LoginAttempt =
  | { kind: "ready"; token: string; expiry: Date }
  | { kind: "retry"; retryAfter: number }
  | { kind: "permanent" };

const retryAfterDelay = (value: string | null, now: number): number => {
  if (!value) {
    return 0;
  }
  if (/^\d+$/u.test(value)) {
    return Number(value) * 1000;
  }
  if (
    !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(
      value
    )
  ) {
    return 0;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
};

const jsonBody = async (
  response: Response,
  maximum = 262_144
): Promise<unknown> => {
  const reader = response.body?.getReader();
  if (!reader) {
    return unavailable();
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Bound and consume the upstream stream sequentially.
      const part = await reader.read();
      if (part.done) {
        break;
      }
      length += part.value.byteLength;
      if (length > maximum) {
        return unavailable();
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel();
  }
};

export class EcmClient {
  private readonly configuration: EcmConfiguration | null;
  private readonly runtime: EcmRuntime;

  constructor(
    configuration: EcmConfiguration | null,
    overrides: Partial<EcmRuntime> = {}
  ) {
    this.configuration = configuration;
    this.runtime = { ...runtime, ...overrides };
  }

  private configured() {
    const parsed = configurationSchema.safeParse(this.configuration);
    if (!parsed.success) {
      return unavailable();
    }
    const configuration = parsed.data;
    const url = new URL(configuration.apiUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    ) {
      return unavailable();
    }
    const key = Buffer.from(configuration.encryptionKey, "base64");
    if (
      key.length !== 32 ||
      key.toString("base64") !== configuration.encryptionKey
    ) {
      return unavailable();
    }
    const base = url.pathname.replace(/\/+$/u, "");
    url.pathname = base.endsWith("/api/beeecm/public")
      ? base
      : `${base}/api/beeecm/public`;
    const accountKey = createHash("sha256")
      .update(`${url.href}\0${configuration.username}`)
      .digest("hex");
    return {
      ...configuration,
      accountKey,
      baseUrl: url.href.replace(/\/$/u, ""),
      key,
    };
  }
  categoryScope(scope: string): string {
    return createHash("sha256")
      .update(`${this.configured().accountKey}\0${scope}`)
      .digest("hex");
  }

  private seal(token: string): string {
    const { key, accountKey } = this.configured();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(accountKey));
    const encrypted = Buffer.concat([
      cipher.update(token, "utf-8"),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
      "base64"
    );
  }

  private open(ciphertext: string): string {
    try {
      const { key, accountKey } = this.configured();
      const bytes = Buffer.from(ciphertext, "base64");
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12)
      );
      cipher.setAAD(Buffer.from(accountKey));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString("utf-8");
    } catch {
      return unavailable();
    }
  }

  private async state(): Promise<AuthState> {
    const { accountKey } = this.configured();
    const [state] = await prisma.$queryRaw<AuthState[]>(
      Prisma.sql`SELECT * FROM "ecm_auth_states" WHERE "account_key" = ${accountKey}`
    );
    if (!state) {
      return unavailable();
    }
    return state;
  }

  private async loginAttempt(
    timeoutMs: number,
    requestBudgetMs: number
  ): Promise<LoginAttempt> {
    const configuration = this.configured();
    try {
      const response = await this.runtime.fetch(
        `${configuration.baseUrl}/login`,
        {
          body: JSON.stringify({
            password: configuration.password,
            username: configuration.username,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          redirect: "manual",
          signal: this.runtime.timeoutSignal(timeoutMs),
        }
      );
      if (!response.ok) {
        const transient =
          response.status === 408 ||
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599);
        const retryAfter = retryAfterDelay(
          response.headers.get("Retry-After"),
          this.runtime.now()
        );
        await response.body?.cancel().catch(() => {
          // Body cancellation cannot turn a verified permanent HTTP rejection into a transport retry.
        });
        return transient
          ? { kind: "retry", retryAfter }
          : { kind: "permanent" };
      }
      let payload: unknown;
      try {
        payload = await jsonBody(response);
      } catch (error) {
        return error instanceof DOMException
          ? { kind: "retry", retryAfter: 0 }
          : { kind: "permanent" };
      }
      const parsed = loginResponse.safeParse(payload);
      if (!parsed.success) {
        return { kind: "permanent" };
      }
      const expiry = new Date(parsed.data.data.expire);
      if (
        !Number.isFinite(expiry.getTime()) ||
        expiry.getTime() <= this.runtime.now() + requestBudgetMs + skewMs
      ) {
        return { kind: "permanent" };
      }
      return { expiry, kind: "ready", token: parsed.data.data.token };
    } catch (error) {
      return error instanceof TypeError || error instanceof DOMException
        ? { kind: "retry", retryAfter: 0 }
        : { kind: "permanent" };
    }
  }

  private async login(
    state: AuthState,
    requestBudgetMs: number
  ): Promise<void> {
    const configuration = this.configured();
    const deadline = state.deadline?.getTime() ?? 0;
    let authenticated: Extract<LoginAttempt, { kind: "ready" }> | null = null;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remaining = deadline - this.runtime.now();
        if (remaining <= 0) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- One shared login job owns sequential attempts and their common deadline.
        const result = await this.loginAttempt(
          Math.min(15_000, remaining),
          requestBudgetMs
        );
        if (result.kind === "ready") {
          authenticated = result;
          break;
        }
        if (result.kind === "permanent") {
          break;
        }
        const delay = Math.max((attempt + 1) * 1000, result.retryAfter);
        if (
          attempt === 2 ||
          !Number.isFinite(delay) ||
          this.runtime.now() + delay >= deadline
        ) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- Backoff must finish before the next bounded login attempt.
        await this.runtime.sleep(delay);
      }
      if (authenticated && this.runtime.now() < deadline) {
        await prisma.$executeRaw(
          // Materialize the owned row lock before evaluating either deadline fence.
          Prisma.sql`
            WITH owned AS MATERIALIZED (
              SELECT "account_key", "deadline"
              FROM "ecm_auth_states"
              WHERE "account_key" = ${configuration.accountKey}
                AND "generation" = ${state.generation}
                AND "owner" = ${state.owner}::uuid
                AND "status" = 'loading'
              FOR UPDATE
            )
            UPDATE "ecm_auth_states" AS auth
            SET "status" = 'ready', "owner" = NULL,
                "encrypted_token" = ${this.seal(authenticated.token)},
                "expires_at" = ${authenticated.expiry}
            FROM owned
            WHERE auth."account_key" = owned."account_key"
              AND auth."generation" = ${state.generation}
              AND auth."owner" = ${state.owner}::uuid
              AND auth."status" = 'loading'
              AND owned."deadline" > ${new Date(this.runtime.now())}
              AND owned."deadline" > clock_timestamp()
          `
        );
      }
    } finally {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "ecm_auth_states" SET "status" = 'error', "owner" = NULL, "encrypted_token" = NULL, "expires_at" = NULL WHERE "account_key" = ${configuration.accountKey} AND "generation" = ${state.generation} AND "owner" = ${state.owner}::uuid AND "status" = 'loading'`
      );
    }
  }

  private async bearer(requestBudgetMs: number): Promise<Bearer> {
    const { accountKey } = this.configured();
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "ecm_auth_states" ("account_key") VALUES (${accountKey}) ON CONFLICT DO NOTHING`
    );
    let state = await this.state();
    if (
      state.status === "loading" &&
      state.lease_until &&
      state.lease_until.getTime() <= this.runtime.now()
    ) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "ecm_auth_states" SET "status" = 'error', "owner" = NULL, "encrypted_token" = NULL, "expires_at" = NULL WHERE "account_key" = ${accountKey} AND "generation" = ${state.generation} AND "status" = 'loading' AND "lease_until" <= ${new Date(this.runtime.now())}`
      );
      return unavailable();
    }
    const sufficient = (
      value: AuthState,
      minimumRemainingMs = requestBudgetMs + skewMs
    ): value is AuthState & { encrypted_token: string } =>
      Boolean(
        value.status === "ready" &&
        value.encrypted_token &&
        value.expires_at &&
        value.expires_at.getTime() > this.runtime.now() + minimumRemainingMs
      );
    // Early renewal applies to cached tokens, not fresh login validation.
    if (sufficient(state, Math.max(renewAheadMs, requestBudgetMs + skewMs))) {
      return {
        generation: state.generation,
        token: this.open(state.encrypted_token),
      };
    }
    if (state.status !== "loading") {
      const now = this.runtime.now();
      const owner = crypto.randomUUID();
      const claimed = await prisma.$executeRaw(
        Prisma.sql`UPDATE "ecm_auth_states" SET "generation" = "generation" + 1, "status" = 'loading', "owner" = ${owner}::uuid, "deadline" = ${new Date(now + authBudgetMs)}, "lease_until" = ${new Date(now + authBudgetMs + persistenceAllowanceMs)}, "encrypted_token" = NULL, "expires_at" = NULL WHERE "account_key" = ${accountKey} AND "generation" = ${state.generation} AND "status" <> 'loading'`
      );
      state = await this.state();
      if (claimed === 1 && state.owner === owner) {
        await this.login(state, requestBudgetMs);
      }
    }
    const { generation } = state;
    const deadline = state.deadline?.getTime() ?? this.runtime.now();
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Each read observes the shared job generation before waiting again.
      state = await this.state();
      if (state.generation !== generation) {
        return unavailable();
      }
      if (sufficient(state)) {
        return { generation, token: this.open(state.encrypted_token) };
      }
      if (state.status !== "loading" || this.runtime.now() >= deadline) {
        return unavailable();
      }
      // oxlint-disable-next-line no-await-in-loop -- Waiters observe one bounded shared job without starting their own retry budget.
      await this.runtime.sleep(Math.min(50, deadline - this.runtime.now()));
    }
  }

  async request(
    path: "document/category" | "file" | `file?token=${string}`,
    init: RequestInit = {},
    budgetMs = 15_000,
    beforeSend?: () => Promise<void>
  ): Promise<Response> {
    if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0) {
      return unavailable();
    }
    const configuration = this.configured();
    const bearer = await this.bearer(budgetMs);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${bearer.token}`);
    await beforeSend?.();
    try {
      const response = await this.runtime.fetch(
        `${configuration.baseUrl}/${path}`,
        {
          ...init,
          headers,
          redirect: "manual",
          signal: init.signal
            ? AbortSignal.any([
                init.signal,
                this.runtime.timeoutSignal(budgetMs),
              ])
            : this.runtime.timeoutSignal(budgetMs),
        }
      );
      if (response.status === 401) {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "ecm_auth_states" SET "status" = 'idle', "encrypted_token" = NULL, "expires_at" = NULL WHERE "account_key" = ${configuration.accountKey} AND "generation" = ${bearer.generation} AND "status" = 'ready'`
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        return rejected();
      }
      return response;
    } catch {
      return unavailable();
    }
  }

  accountKey(): string {
    return this.configured().accountKey;
  }

  async originalBytes(link: string, expectedSize: number): Promise<Blob> {
    const { origin } = new URL(this.configured().baseUrl);
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return unavailable();
    }
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.href.includes("#") ||
      !Number.isSafeInteger(expectedSize) ||
      expectedSize < 0 ||
      expectedSize > 10_000_000
    ) {
      return unavailable();
    }
    try {
      const response = await this.runtime.fetch(url.href, {
        credentials: "omit",
        redirect: "manual",
        signal: this.runtime.timeoutSignal(90_000),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        return unavailable();
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          for (;;) {
            // oxlint-disable-next-line no-await-in-loop -- Bound actual original bytes, never trust Content-Length.
            const part = await reader.read();
            if (part.done) {
              break;
            }
            size += part.value.byteLength;
            if (size > 10_000_000 || size > expectedSize) {
              return unavailable();
            }
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel();
        }
      }
      if (size !== expectedSize) {
        return unavailable();
      }
      return new Blob(chunks);
    } catch {
      return unavailable();
    }
  }

  async upload(
    body: FormData,
    beforeSend: () => Promise<void>
  ): Promise<{ file_link: string; file_token: string }> {
    // Upload has its own 90-second transport budget, independent of the shared 30-second login job.
    const response = await this.request(
      "file",
      { body, method: "POST" },
      90_000,
      beforeSend
    );
    const parsed = z
      .object({
        data: z.preprocess(
          (value) => (Array.isArray(value) ? value : [value]),
          z
            .array(
              z.object({
                file_link: z.url().refine((value) => {
                  const url = new URL(value);
                  return (
                    !url.username &&
                    !url.password &&
                    !url.hash &&
                    (url.protocol === "https:" ||
                      (url.protocol === "http:" &&
                        ["localhost", "127.0.0.1", "[::1]"].includes(
                          url.hostname
                        )))
                  );
                }),
                file_token: z
                  .string()
                  .min(1)
                  .max(16_384)
                  .regex(/^[!-~]+$/u),
              })
            )
            .length(1)
        ),
        status: z.literal(200),
      })
      .safeParse(await jsonBody(response));
    if (!parsed.success) {
      return unavailable();
    }
    const [receipt] = parsed.data.data;
    if (!receipt) {
      return unavailable();
    }
    return receipt;
  }

  async deleteFile(
    token: string,
    beforeSend?: () => Promise<void>
  ): Promise<void> {
    const response = await this.request(
      `file?token=${encodeURIComponent(token)}`,
      { method: "DELETE" },
      30_000,
      beforeSend
    );
    const parsed = z
      .object({ data: z.null(), status: z.literal(200) })
      .safeParse(await jsonBody(response));
    if (!parsed.success) {
      unavailable();
    }
  }

  async categoryEntries(): Promise<{ id: number; type: string }[]> {
    try {
      const response = await this.request("document/category");
      const parsed = z
        .array(
          z.object({
            id: z.number().int(),
            type: z
              .string()
              .min(1)
              .max(255)
              .refine(
                (name) => name.trim().length > 0 && !/\p{Cc}/u.test(name)
              ),
          })
        )
        .max(10_000)
        .safeParse(await jsonBody(response));
      if (!parsed.success) {
        return unavailable();
      }
      if (
        new Set(parsed.data.map((category) => category.id)).size !==
        parsed.data.length
      ) {
        return unavailable();
      }
      return parsed.data;
    } catch {
      return unavailable();
    }
  }

  async categories(): Promise<string[]> {
    const categories = await this.categoryEntries();
    return [...new Set(categories.map((category) => category.type))];
  }
}
