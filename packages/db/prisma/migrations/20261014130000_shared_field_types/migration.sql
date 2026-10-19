-- New enum values must commit before the following backfill uses them.
ALTER TYPE "FieldType" ADD VALUE 'number';
ALTER TYPE "FieldType" ADD VALUE 'table';
