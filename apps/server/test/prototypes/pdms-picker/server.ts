// Test-only feasibility fixture. Not registered by the Folio application.
interface PrototypeContext {
  session: string;
  names: string[];
  selections: Record<string, string>;
  revision: number;
}
interface PrototypeOptions {
  port?: number;
  fallback?: (request: Request, context: PrototypeContext) => Promise<Response>;
  onSelection?: (expected?: {
    note: string;
    rowNote: string;
  }) => Promise<unknown>;
}
export const startPickerPrototype = ({
  port = 58_101,
  fallback,
  onSelection,
}: PrototypeOptions = {}) => {
  const session = crypto.randomUUID();
  const names = Array.from(
    { length: 2500 },
    (_, index) => `โครงการทดสอบ ${String(index).padStart(4, "0")}`
  );
  const targets: Record<string, string> = { project: "A1:B1", table: "A4" };
  const selections: Record<string, string> = {};
  let revision = 0;
  const server = Bun.serve({
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/prototype/select") {
        if (request.headers.get("X-Prototype-Session") !== session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = (await request.json()) as {
          target: string;
          name: string;
          revision: number;
          expected?: { note: string; rowNote: string };
        };
        if (body.revision !== revision) {
          return Response.json({ error: "Stale target" }, { status: 409 });
        }
        if (
          !Object.hasOwn(targets, body.target) ||
          !names.includes(body.name)
        ) {
          return Response.json(
            { error: "Choose a current project" },
            { status: 422 }
          );
        }
        const prior = selections[body.target];
        selections[body.target] = body.name;
        try {
          const operation = onSelection
            ? await onSelection(body.expected)
            : undefined;
          revision += 1;
          return Response.json({
            address: targets[body.target],
            name: body.name,
            revision,
            ...(operation ? { operation } : {}),
          });
        } catch (error) {
          if (prior === undefined) {
            Reflect.deleteProperty(selections, body.target);
          } else {
            selections[body.target] = prior;
          }
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Save failed; workbook retained",
            },
            { status: 409 }
          );
        }
      }
      if (url.pathname === "/prototype/catalog") {
        if (request.headers.get("X-Prototype-Session") !== session) {
          return new Response("Unauthorized", { status: 401 });
        }
        return Response.json({ names, revision });
      }
      return fallback
        ? fallback(request, { names, revision, selections, session })
        : new Response("Not found", { status: 404 });
    },
    port,
  });
  return {
    origin: server.url.origin,
    session,
    stop: async () => {
      await server.stop(true);
    },
  };
};
