import { expect } from "bun:test";

import { prisma } from "@onlyoffice/db";
import type { DocumentKind, ResponseStatus, Prisma } from "@onlyoffice/db";
import { z } from "zod";

import type { createApp } from "../../../src/app";

const resultListSchema = z.object({
  nextCursor: z.string().nullable(),
  results: z.array(
    z.object({
      id: z.string(),
      latestCorrectionNumber: z.number().nullable(),
      state: z.enum(["draft", "submitted"]),
    })
  ),
});

const savedSubmission = (
  response: { id: string; formId: string; userId: string },
  data: Prisma.InputJsonValue,
  createdAt = new Date("2026-10-01T00:00:00Z")
) =>
  prisma.submission.create({
    data: {
      createdAt,
      data,
      documentKey: crypto.randomUUID(),
      formId: response.formId,
      objectKey: `tests/results/${crypto.randomUUID()}`,
      responseId: response.id,
      userId: response.userId,
    },
  });

export const createResultsHttpFixtures = ({
  app,
  correctionChangedData,
  defaultFields,
  formTitle,
  getAdmin,
}: {
  app: ReturnType<typeof createApp>;
  correctionChangedData: Prisma.InputJsonObject;
  defaultFields: readonly Pick<
    Prisma.ManifestFieldCreateWithoutManifestInput,
    "label" | "tag"
  >[];
  formTitle: string;
  getAdmin: () => { bearer: string; id: string };
}) => {
  const resultForm = async (
    kind: DocumentKind = "docx",
    fields?: Prisma.ManifestFieldCreateWithoutManifestInput[]
  ) => {
    const form = await prisma.form.create({
      data: {
        documentKind: kind,
        publicId: crypto.randomUUID().replaceAll("-", ""),
        publishedTemplate: {
          create: {
            contentHash: "fixture",
            documentKey: crypto.randomUUID(),
            manifest: {
              create: {
                configurationHash: "fixture",
                fields: {
                  create:
                    fields ??
                    defaultFields.map(({ label, tag }, position) => ({
                      label,
                      position,
                      tag,
                      type: "text",
                      ...(kind === "xlsx"
                        ? {
                            binding: {
                              anchor: `folio_${tag}`,
                              computed: false,
                              id: `folio_${tag}`,
                            },
                          }
                        : {}),
                    })),
                },
              },
            },
            objectKey: `tests/results/${crypto.randomUUID()}.${kind}`,
            version: 1,
          },
        },
        status: "published",
        title: `${formTitle} ${kind}`,
        version: 1,
      },
      include: { publishedTemplate: true },
    });
    if (!form.publishedTemplate) {
      throw new Error("A published results fixture is required");
    }
    return { ...form, publishedTemplate: form.publishedTemplate };
  };

  const savedResult = async (
    form: Awaited<ReturnType<typeof resultForm>>,
    data: Prisma.InputJsonValue | typeof Prisma.JsonNull,
    status: ResponseStatus = "draft"
  ) => {
    const owner = await prisma.user.create({
      data: {
        email: `${crypto.randomUUID()}@example.test`,
        id: crypto.randomUUID(),
        name: "Response owner",
      },
    });
    return prisma.response.create({
      data: {
        ...(status === "submitted"
          ? {}
          : {
              draftData: data,
              draftDocumentKey: crypto.randomUUID(),
              draftObjectKey: `tests/results/${crypto.randomUUID()}.${form.documentKind}`,
            }),
        formId: form.id,
        publishedTemplateId: form.publishedTemplate.id,
        publishedVersion: 1,
        status,
        userId: owner.id,
      },
    });
  };

  const savedCorrection = (
    submission: { id: string; responseId: string },
    data: Prisma.InputJsonObject,
    revision: number
  ) =>
    prisma.correction.create({
      data: {
        actorId: getAdmin().id,
        changedData: correctionChangedData,
        data,
        documentKey: crypto.randomUUID(),
        objectKey: `tests/results/${crypto.randomUUID()}`,
        reason: "Verified saved answer",
        responseId: submission.responseId,
        revision,
        submissionId: submission.id,
      },
    });

  const request = (query: Record<string, string>, token = getAdmin().bearer) =>
    app.handle(
      new Request(
        `http://test.local/api/admin/results?${new URLSearchParams(query)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      )
    );

  const detailRequest = (id: string) =>
    app.handle(
      new Request(`http://test.local/api/admin/results/${id}`, {
        headers: { Authorization: `Bearer ${getAdmin().bearer}` },
      })
    );

  const results = async (query: Record<string, string>) => {
    const response = await request(query);
    expect(response.status).toBe(200);
    return resultListSchema.parse(await response.json());
  };

  const resultIds = async (query: Record<string, string>) => {
    const page = await results(query);
    return page.results.map(({ id }) => id);
  };

  return {
    detailRequest,
    request,
    resultForm,
    resultIds,
    results,
    savedCorrection,
    savedResult,
    savedSubmission,
  };
};
