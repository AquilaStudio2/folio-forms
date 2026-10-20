// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE commands are serialized into the editor sandbox.

export function spreadsheetColumnAnchor(id) {
  return `folio_column_${id}`;
}

export function spreadsheetTableColumnsAnchor(id) {
  return `folio_columns_${id}`;
}

export function spreadsheetBindingAnchors(bindings) {
  return [
    ...(bindings?.fields || []).map((field) => field.anchor),
    ...(bindings?.table
      ? [
          bindings.table.anchor,
          ...(bindings.table.columns.length
            ? [spreadsheetTableColumnsAnchor(bindings.table.id)]
            : []),
          ...bindings.table.columns.map((column) =>
            spreadsheetColumnAnchor(column.id)
          ),
        ]
      : []),
  ];
}

export function reconcileSpreadsheetColumns(bindings, result) {
  if (!result?.ok) {
    throw new Error(result?.error || "ตรวจสอบตำแหน่งคอลัมน์ไม่สำเร็จ");
  }
  if (!bindings?.table) {
    return bindings;
  }
  const offsets = new Map(result.offsets);
  return {
    ...bindings,
    table: {
      ...bindings.table,
      columns: bindings.table.columns.map((column) => {
        if (!offsets.has(column.id)) {
          throw new Error(`ไม่พบตำแหน่งคอลัมน์ ${column.label}`);
        }
        return { ...column, offset: offsets.get(column.id) };
      }),
    },
  };
}

// A column's identity travels with its native named range when columns are
// inserted or moved. Never infer identity from its current ordinal position.
export function spreadsheetColumnsCommand() {
  try {
    const input = Asc.scope.folioSpreadsheetColumns;
    const table = input?.table;
    if (!table || table.columns.length === 0) {
      return JSON.stringify({
        ok: true,
        changed: false,
        offsets: [],
        anchors: [],
      });
    }
    const readName = (name) => {
      try {
        return Api.GetDefName(name);
      } catch {
        return null;
      }
    };
    const bodyName = readName(table.anchor);
    let body = null;
    try {
      body = bodyName?.GetRefersToRange();
      body?.GetRowsCount();
    } catch {
      body = null;
    }
    if (!body) {
      throw new Error("ไม่พบตำแหน่งตาราง กรุณาผูกตำแหน่งตารางใหม่ก่อนบันทึก");
    }
    const marker = `folio_columns_${table.id}`;
    const names = table.columns.map((column) => `folio_column_${column.id}`);
    const existing = names.map(readName);
    let markerName = readName(marker);
    let changed = false;
    if (input.repair) {
      const expectedWidth =
        Math.max(-1, ...table.columns.map((column) => column.offset)) + 1;
      if (!input.initialize || expectedWidth !== body.GetColumnsCount()) {
        throw new Error(
          "เลือกช่วงข้อมูลให้มีจำนวนคอลัมน์ตรงกับตารางเดิม โดยไม่รวมหัวตาราง"
        );
      }
      for (const name of [...existing, markerName]) {
        if (name && name.Delete() !== true) {
          throw new Error("ล้างตำแหน่งคอลัมน์เดิมไม่สำเร็จ กรุณาลองผูกตำแหน่งใหม่อีกครั้ง");
        }
      }
      existing.fill(null);
      markerName = null;
    }
    if (!markerName && existing.every((name) => !name)) {
      const expectedWidth =
        Math.max(-1, ...table.columns.map((column) => column.offset)) + 1;
      if (!input.initialize || expectedWidth !== body.GetColumnsCount()) {
        throw new Error(
          "โครงสร้างคอลัมน์ตารางเดิมเปลี่ยนไป กรุณาย้อนการแทรกหรือลบคอลัมน์ แล้วเปิดแผงตั้งค่าใหม่ หรือสร้างตารางรายการใหม่"
        );
      }
      const sheet = body.GetWorksheet().GetName().replaceAll("'", "''");
      const columnName = (column) => {
        let result = "";
        for (
          let value = column;
          value > 0;
          value = Math.floor((value - 1) / 26)
        ) {
          result = String.fromCodePoint(65 + ((value - 1) % 26)) + result;
        }
        return result;
      };
      const added = [];
      try {
        for (const [index, column] of table.columns.entries()) {
          const letter = columnName(body.GetCol() + column.offset);
          const reference = `'${sheet}'!$${letter}$${body.GetRow()}:$${letter}$${body.GetRow() + body.GetRowsCount() - 1}`;
          if (Api.AddDefName(names[index], reference, false) !== true) {
            throw new Error(`สร้างตำแหน่งคอลัมน์ ${column.label} ไม่สำเร็จ`);
          }
          added.push(names[index]);
          existing[index] = readName(names[index]);
        }
        if (Api.AddDefName(marker, bodyName.GetRefersTo(), false) !== true) {
          throw new Error("สร้างตำแหน่งอ้างอิงคอลัมน์ตารางไม่สำเร็จ");
        }
        markerName = readName(marker);
      } catch (error) {
        for (const name of added) {
          readName(name)?.Delete();
        }
        throw error;
      }
      changed = true;
    }
    if (!markerName || existing.some((name) => !name)) {
      throw new Error(
        "ตำแหน่งอ้างอิงคอลัมน์หายไป กรุณาย้อนการลบคอลัมน์ หรือลบคอลัมน์นั้นจากการตั้งค่าก่อนบันทึก"
      );
    }
    const offsets = [];
    const anchors = [[marker, markerName.GetRefersTo()]];
    const occupied = new Set();
    for (const [index, column] of table.columns.entries()) {
      const name = existing[index];
      let range = null;
      try {
        range = name?.GetRefersToRange();
        range?.GetRowsCount();
      } catch {
        // Deleted native columns retain a name whose reference is #REF!.
        // Report the mapped column and a recovery action below.
      }
      const offset = range ? range.GetCol() - body.GetCol() : -1;
      if (
        !range ||
        range.GetWorksheet().GetName() !== body.GetWorksheet().GetName() ||
        range.GetColumnsCount() !== 1 ||
        offset < 0 ||
        offset >= body.GetColumnsCount() ||
        range.GetRow() > body.GetRow() + body.GetRowsCount() - 1 ||
        range.GetRow() + range.GetRowsCount() - 1 < body.GetRow() ||
        occupied.has(offset)
      ) {
        throw new Error(
          `ตำแหน่งคอลัมน์ ${column.label} ถูกลบ ย้ายออกนอกตาราง หรือซ้ำกับคอลัมน์อื่น กรุณาย้อนการเปลี่ยนแปลงหรือลบคอลัมน์นี้จากการตั้งค่า`
        );
      }
      occupied.add(offset);
      offsets.push([column.id, offset]);
      anchors.push([names[index], name.GetRefersTo()]);
    }
    return JSON.stringify({ ok: true, changed, offsets, anchors });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error.message || "ตรวจสอบตำแหน่งคอลัมน์ไม่สำเร็จ",
    });
  }
}
