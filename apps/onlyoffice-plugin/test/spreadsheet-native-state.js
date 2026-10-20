// oxlint-disable no-empty-function class-methods-use-this prefer-named-capture-group no-use-before-define max-classes-per-file no-extraneous-class -- Small editor-model constructor adapter; actual formula translation and XML behavior are tested in ONLYOFFICE runtime suites.
const propertyNames = {
  alertStyle: "errorStyle",
  errorMessage: "error",
  errorTitle: "errorTitle",
  ignoreBlank: "allowBlank",
  inCellDropdown: "showDropDown",
  inputMessage: "prompt",
  inputTitle: "promptTitle",
  operator: "operator",
  showError: "showErrorMessage",
  showInput: "showInputMessage",
  type: "type",
};

const addressAt = (column, row) => {
  let letters = "";
  for (
    let index = column + 1;
    index > 0;
    index = Math.floor((index - 1) / 26)
  ) {
    letters = String.fromCodePoint(65 + ((index - 1) % 26)) + letters;
  }
  return `${letters}${row + 1}`;
};

const boundsOf = (address) => {
  const coordinates = address
    .replaceAll("$", "")
    .split(":")
    .map((cell) => {
      const [letters, row] = cell.match(/^([A-Z]+)(\d+)$/u).slice(1);
      return {
        column:
          [...letters].reduce(
            (value, character) => value * 26 + character.codePointAt(0) - 64,
            0
          ) - 1,
        row: Number(row) - 1,
      };
    });
  const [first, last = first] = coordinates;
  return new NativeRange(first.column, first.row, last.column, last.row);
};

class NativeRange {
  constructor(c1, r1, c2, r2) {
    Object.assign(this, { c1, c2, r1, r2 });
  }
  clone() {
    return new NativeRange(this.c1, this.r1, this.c2, this.r2);
  }
}

class NativeFormula {
  constructor(text) {
    this.text = text;
  }
  clone() {
    return new NativeFormula(this.text);
  }
  setOffset() {}
}

class NativeValidation {
  _init() {}
  clone() {
    const result = Object.assign(new NativeValidation(), this);
    result.formula1 = this.formula1?.clone() ?? null;
    result.formula2 = this.formula2?.clone() ?? null;
    result.ranges = this.ranges.map(
      (range) => new NativeRange(range.c1, range.r1, range.c2, range.r2)
    );
    return result;
  }
}

export const createNativeValidationModel = (validations) => ({
  AscCommonExcel: { CDataValidation: NativeValidation },
  constructors: { CDataFormula: NativeFormula, Range: NativeRange },
  range: (address) => ({ bbox: boundsOf(address) }),
  rules(address) {
    const target = boundsOf(address);
    return [...validations].flatMap(([key, state]) => {
      const bounds = boundsOf(key);
      if (
        bounds.c1 > target.c2 ||
        bounds.c2 < target.c1 ||
        bounds.r1 > target.r2 ||
        bounds.r2 < target.r1
      ) {
        return [];
      }
      const rule = new NativeValidation();
      rule.Id = key;
      rule.ranges = [bounds];
      for (const [publicName, nativeName] of Object.entries(propertyNames)) {
        rule[nativeName] = state[publicName];
      }
      rule.formula1 =
        state.formula1 === undefined || state.formula1 === null
          ? null
          : new NativeFormula(state.formula1);
      rule.formula2 =
        state.formula2 === undefined || state.formula2 === null
          ? null
          : new NativeFormula(state.formula2);
      return [rule];
    });
  },
  worksheet: {
    addDataValidation(rule) {
      for (const range of rule.ranges) {
        const first = addressAt(range.c1, range.r1);
        const last = addressAt(range.c2, range.r2);
        const key = first === last ? first : `${first}:${last}`;
        const state = {};
        for (const [publicName, nativeName] of Object.entries(propertyNames)) {
          if (rule[nativeName] !== undefined) {
            state[publicName] = rule[nativeName];
          }
        }
        state.formula1 = rule.formula1?.text;
        state.formula2 = rule.formula2?.text;
        validations.set(key, state);
      }
    },
    deleteDataValidationById(id) {
      validations.delete(id);
    },
  },
});
