CREATE TABLE "storage_templates" (
    "id" UUID NOT NULL,
    "template_name" VARCHAR(255) NOT NULL,
    "document_category_id" INTEGER NOT NULL,
    CONSTRAINT "storage_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storage_templates_template_name_key" ON "storage_templates"("template_name");
CREATE INDEX "storage_templates_document_category_id_idx" ON "storage_templates"("document_category_id");
