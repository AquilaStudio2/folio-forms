BEGIN;

ALTER TABLE "draft_field_rules"
    ADD COLUMN "label" TEXT,
    ADD COLUMN "type" "FieldType",
    ADD COLUMN "options" JSONB,
    ADD COLUMN "position" INTEGER,
    ADD COLUMN "binding" JSONB;
ALTER TABLE "manifest_fields" ADD COLUMN "binding" JSONB;

-- Fail before removing the legacy source if any binding cannot be represented faithfully.
CREATE FUNCTION pg_temp.xlsx_key(value TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT value IS NOT NULL AND value ~ '^[A-Za-z_][A-Za-z0-9_]*$'
        AND value NOT IN ('__proto__', 'constructor', 'prototype');
$$;
CREATE FUNCTION pg_temp.xlsx_identity(value TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT value IS NOT NULL AND value ~ '^folio_[A-Za-z0-9_]+$';
$$;
CREATE FUNCTION pg_temp.xlsx_validate_field(value JSONB, scalar BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    property TEXT;
    option_value JSONB;
BEGIN
    IF jsonb_typeof(value) IS DISTINCT FROM 'object'
        OR NOT pg_temp.xlsx_identity(value->>'id') OR NOT pg_temp.xlsx_key(value->>'key')
        OR jsonb_typeof(value->'label') IS DISTINCT FROM 'string'
        OR length(trim(value->>'label')) NOT BETWEEN 1 AND 200
        OR value->>'type' NOT IN ('text', 'number', 'date', 'dropdown', 'boolean')
        OR value->>'type' IS NULL
        OR (value ? 'required' AND jsonb_typeof(value->'required') <> 'boolean')
        OR (value ? 'computed' AND jsonb_typeof(value->'computed') <> 'boolean')
        OR (value ? 'options' AND jsonb_typeof(value->'options') <> 'array') THEN
        RAISE EXCEPTION 'Invalid legacy XLSX field: %', value->>'id';
    END IF;
    FOR property IN SELECT jsonb_object_keys(value) LOOP
        IF property NOT IN ('id', 'key', 'label', 'type', 'options', 'required', 'computed')
            AND NOT (scalar AND property IN ('anchor', 'prefillPointer', 'prefillPolicy'))
            AND NOT (NOT scalar AND property = 'offset') THEN
            RAISE EXCEPTION 'Unknown legacy XLSX field property: %', property;
        END IF;
    END LOOP;
    FOR option_value IN SELECT jsonb_array_elements(COALESCE(value->'options', '[]'::jsonb)) LOOP
        IF jsonb_typeof(option_value) <> 'string' OR length(option_value #>> '{}') = 0 THEN
            RAISE EXCEPTION 'Invalid legacy XLSX dropdown option';
        END IF;
    END LOOP;
    IF value->>'type' <> 'dropdown' AND jsonb_array_length(COALESCE(value->'options', '[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'Unexpected legacy XLSX options on non-dropdown field';
    END IF;
    IF value->>'type' = 'dropdown' AND jsonb_array_length(COALESCE(value->'options', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'Missing legacy XLSX dropdown options';
    END IF;
    IF scalar THEN
        IF NOT pg_temp.xlsx_identity(value->>'anchor')
            OR (value ? 'prefillPointer' AND jsonb_typeof(value->'prefillPointer') NOT IN ('string', 'null'))
            OR (value ? 'prefillPolicy' AND (jsonb_typeof(value->'prefillPolicy') IS DISTINCT FROM 'string' OR value->>'prefillPolicy' NOT IN ('editable', 'lock_when_available')))
            OR (COALESCE((value->>'computed')::boolean, false) AND value->>'prefillPointer' IS NOT NULL)
            OR (value->>'prefillPolicy' = 'lock_when_available' AND value->>'prefillPointer' IS NULL) THEN
            RAISE EXCEPTION 'Invalid legacy XLSX scalar binding';
        END IF;
    ELSE
        IF jsonb_typeof(value->'offset') IS DISTINCT FROM 'number'
            OR (value->>'offset')::numeric <> trunc((value->>'offset')::numeric)
            OR (value->>'offset')::numeric NOT BETWEEN 0 AND 16383 THEN
            RAISE EXCEPTION 'Invalid legacy XLSX column offset';
        END IF;
    END IF;
END;
$$;
CREATE FUNCTION pg_temp.xlsx_fields(configuration JSONB)
RETURNS TABLE (
    tag TEXT, label TEXT, type "FieldType", required BOOLEAN,
    prefill_pointer TEXT, prefill_policy "PrefillPolicy", options JSONB,
    "position" INTEGER, binding JSONB
) LANGUAGE plpgsql AS $$
DECLARE
    item JSONB;
    table_item JSONB;
    column_item JSONB;
    property TEXT;
    tags TEXT[] := '{}';
    identities TEXT[] := '{}';
    anchors TEXT[] := '{}';
    column_keys TEXT[] := '{}';
    offsets INTEGER[] := '{}';
    next_position INTEGER := 0;
BEGIN
    IF jsonb_typeof(configuration) IS DISTINCT FROM 'object'
        OR configuration->'version' IS DISTINCT FROM '1'::jsonb
        OR jsonb_typeof(configuration->'fields') IS DISTINCT FROM 'array'
        OR NOT (configuration ? 'table') THEN
        RAISE EXCEPTION 'Invalid legacy XLSX configuration';
    END IF;
    FOR property IN SELECT jsonb_object_keys(configuration) LOOP
        IF property NOT IN ('version', 'fields', 'table', 'locations') THEN
            RAISE EXCEPTION 'Unknown legacy XLSX configuration property: %', property;
        END IF;
    END LOOP;
    FOR item IN SELECT jsonb_array_elements(configuration->'fields') LOOP
        PERFORM pg_temp.xlsx_validate_field(item, true);
        IF item->>'key' = ANY(tags) OR item->>'id' = ANY(identities) OR item->>'anchor' = ANY(anchors) THEN
            RAISE EXCEPTION 'Duplicate legacy XLSX scalar key, identity or anchor';
        END IF;
        tags := array_append(tags, item->>'key');
        identities := array_append(identities, item->>'id');
        anchors := array_append(anchors, item->>'anchor');
        tag := item->>'key'; label := trim(item->>'label');
        type := (CASE item->>'type' WHEN 'boolean' THEN 'checkbox' ELSE item->>'type' END)::"FieldType";
        required := COALESCE((item->>'required')::boolean, false);
        prefill_pointer := item->>'prefillPointer';
        prefill_policy := COALESCE(item->>'prefillPolicy', 'editable')::"PrefillPolicy";
        options := CASE WHEN item->>'type' = 'dropdown' THEN (
            SELECT jsonb_agg(jsonb_build_object('displayText', value, 'value', value))
            FROM jsonb_array_elements_text(item->'options')
        ) ELSE NULL END;
        "position" := next_position; next_position := next_position + 1;
        binding := jsonb_build_object('id', item->>'id', 'anchor', item->>'anchor', 'computed', COALESCE((item->>'computed')::boolean, false));
        RETURN NEXT;
    END LOOP;
    table_item := configuration->'table';
    IF table_item <> 'null'::jsonb THEN
        IF jsonb_typeof(table_item) IS DISTINCT FROM 'object'
            OR NOT pg_temp.xlsx_identity(table_item->>'id') OR NOT pg_temp.xlsx_identity(table_item->>'anchor')
            OR NOT pg_temp.xlsx_key(table_item->>'key')
            OR jsonb_typeof(table_item->'label') IS DISTINCT FROM 'string'
            OR length(trim(table_item->>'label')) NOT BETWEEN 1 AND 200
            OR jsonb_typeof(table_item->'columns') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Invalid legacy XLSX table binding';
        END IF;
        FOR property IN SELECT jsonb_object_keys(table_item) LOOP
            IF property NOT IN ('id', 'anchor', 'key', 'label', 'columns') THEN
                RAISE EXCEPTION 'Unknown legacy XLSX table property: %', property;
            END IF;
        END LOOP;
        IF table_item->>'key' = ANY(tags) OR table_item->>'id' = ANY(identities) OR table_item->>'anchor' = ANY(anchors) THEN
            RAISE EXCEPTION 'Duplicate legacy XLSX table key, identity or anchor';
        END IF;
        identities := array_append(identities, table_item->>'id');
        tag := table_item->>'key'; label := trim(table_item->>'label'); type := 'table';
        required := false; prefill_pointer := NULL; prefill_policy := 'editable'; options := NULL;
        "position" := next_position; next_position := next_position + 1;
        binding := jsonb_build_object('id', table_item->>'id', 'anchor', table_item->>'anchor');
        RETURN NEXT;
        FOR column_item IN SELECT jsonb_array_elements(table_item->'columns') LOOP
            PERFORM pg_temp.xlsx_validate_field(column_item, false);
            IF column_item->>'key' = ANY(column_keys) OR column_item->>'id' = ANY(identities) OR (column_item->>'offset')::integer = ANY(offsets) THEN
                RAISE EXCEPTION 'Duplicate legacy XLSX table column';
            END IF;
            column_keys := array_append(column_keys, column_item->>'key');
            identities := array_append(identities, column_item->>'id');
            offsets := array_append(offsets, (column_item->>'offset')::integer);
            tag := (table_item->>'key') || '.' || (column_item->>'key'); label := trim(column_item->>'label');
            type := (CASE column_item->>'type' WHEN 'boolean' THEN 'checkbox' ELSE column_item->>'type' END)::"FieldType";
            required := COALESCE((column_item->>'required')::boolean, false);
            prefill_pointer := NULL; prefill_policy := 'editable';
            options := CASE WHEN column_item->>'type' = 'dropdown' THEN (
                SELECT jsonb_agg(jsonb_build_object('displayText', value, 'value', value))
                FROM jsonb_array_elements_text(column_item->'options')
            ) ELSE NULL END;
            "position" := next_position; next_position := next_position + 1;
            binding := jsonb_build_object('id', column_item->>'id', 'offset', (column_item->>'offset')::integer, 'computed', COALESCE((column_item->>'computed')::boolean, false));
            RETURN NEXT;
        END LOOP;
    END IF;
END;
$$;

CREATE TEMP TABLE xlsx_draft_rows ON COMMIT DROP AS
SELECT draft."id" AS owner_id, fields.*
FROM "template_drafts" draft JOIN "forms" form ON form."id" = draft."form_id"
CROSS JOIN LATERAL pg_temp.xlsx_fields(draft."spreadsheet_bindings") fields
WHERE form."document_kind" = 'xlsx';
CREATE TEMP TABLE xlsx_manifest_rows ON COMMIT DROP AS
SELECT manifest."id" AS owner_id, fields.*
FROM "field_manifests" manifest
JOIN "published_templates" template ON template."id" = manifest."published_template_id"
JOIN "forms" form ON form."id" = template."form_id"
CROSS JOIN LATERAL pg_temp.xlsx_fields(manifest."spreadsheet_contract") fields
WHERE form."document_kind" = 'xlsx';

-- The old XLSX configuration is canonical; reject unexpected published scalar rows.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM "manifest_fields" existing
        JOIN "field_manifests" manifest ON manifest."id" = existing."manifest_id"
        JOIN "published_templates" template ON template."id" = manifest."published_template_id"
        JOIN "forms" form ON form."id" = template."form_id"
        WHERE form."document_kind" = 'xlsx' AND NOT EXISTS (
            SELECT 1 FROM xlsx_manifest_rows mapped
            WHERE mapped.owner_id = existing."manifest_id" AND mapped.tag = existing."tag"
        )
    ) THEN
        RAISE EXCEPTION 'Legacy XLSX manifest contains fields outside its configuration';
    END IF;
END; $$;

-- Published Prefill is already frozen in the existing lifecycle tables. Do not
-- silently discard a pointer that exists only in the legacy JSON configuration.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM xlsx_manifest_rows mapped
        JOIN "field_manifests" manifest ON manifest."id" = mapped.owner_id
        LEFT JOIN "prefill_configurations" configuration ON configuration."published_template_id" = manifest."published_template_id"
        LEFT JOIN "prefill_fields" field ON field."configuration_id" = configuration."id" AND field."tag" = mapped.tag
        WHERE mapped.prefill_pointer IS NOT NULL AND (
            field."id" IS NULL OR field."pointer" IS DISTINCT FROM mapped.prefill_pointer
            OR field."policy" IS DISTINCT FROM mapped.prefill_policy
        )
    ) OR EXISTS (
        SELECT 1 FROM "prefill_fields" field
        JOIN "prefill_configurations" configuration ON configuration."id" = field."configuration_id"
        JOIN "field_manifests" manifest ON manifest."published_template_id" = configuration."published_template_id"
        JOIN "published_templates" template ON template."id" = manifest."published_template_id"
        JOIN "forms" form ON form."id" = template."form_id"
        WHERE form."document_kind" = 'xlsx' AND NOT EXISTS (
            SELECT 1 FROM xlsx_manifest_rows mapped
            WHERE mapped.owner_id = manifest."id" AND mapped.tag = field."tag"
                AND mapped.prefill_pointer = field."pointer" AND mapped.prefill_policy = field."policy"
        )
    ) THEN
        RAISE EXCEPTION 'Legacy XLSX Prefill does not match its published configuration';
    END IF;
END; $$;

DELETE FROM "draft_field_rules" rule USING "template_drafts" draft, "forms" form
WHERE rule."template_draft_id" = draft."id" AND draft."form_id" = form."id" AND form."document_kind" = 'xlsx';
INSERT INTO "draft_field_rules" (
    "id", "template_draft_id", "tag", "label", "type", "required", "prefill_pointer", "prefill_policy", "options", "position", "binding", "created_at", "updated_at"
)
SELECT gen_random_uuid(), owner_id, tag, label, type, required, prefill_pointer, prefill_policy, options, "position", binding, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM xlsx_draft_rows;

ALTER TABLE "manifest_fields" DISABLE TRIGGER "manifest_fields_immutable";
-- Vacate the unique "position" slots while preserving each existing scalar row UUID.
WITH positions AS (
    SELECT field."id", -(ROW_NUMBER() OVER (PARTITION BY field."manifest_id" ORDER BY field."position"))::integer AS temporary_position
    FROM "manifest_fields" field WHERE field."manifest_id" IN (SELECT owner_id FROM xlsx_manifest_rows)
)
UPDATE "manifest_fields" field SET "position" = positions.temporary_position FROM positions WHERE positions."id" = field."id";
INSERT INTO "manifest_fields" (
    "id", "manifest_id", "tag", "label", "type", "required", "prefill_policy", "options", "position", "binding"
)
SELECT gen_random_uuid(), owner_id, tag, label, type, required, prefill_policy, options, "position", binding FROM xlsx_manifest_rows
ON CONFLICT ("manifest_id", "tag") DO UPDATE SET
    "label" = EXCLUDED."label", "type" = EXCLUDED."type", "required" = EXCLUDED."required", "prefill_policy" = EXCLUDED."prefill_policy",
    "options" = EXCLUDED."options", "position" = EXCLUDED."position", "binding" = EXCLUDED."binding";
ALTER TABLE "manifest_fields" ENABLE TRIGGER "manifest_fields_immutable";

-- Only XLSX operations used this redundant transient snapshot.
UPDATE "operations" operation
SET "metadata" = operation."metadata" - 'spreadsheetState'
FROM "forms" form
WHERE operation."form_id" = form."id" AND form."document_kind" = 'xlsx'
    AND jsonb_typeof(operation."metadata") = 'object'
    AND operation."metadata" ? 'spreadsheetState';

ALTER TABLE "template_drafts" DROP COLUMN "spreadsheet_bindings";
ALTER TABLE "field_manifests" DROP COLUMN "spreadsheet_contract";
COMMIT;
