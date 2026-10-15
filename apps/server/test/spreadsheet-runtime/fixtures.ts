// These are isolated CLI proof scripts, not scripts accepted by the application's
// HTTP-only builder interface. All inputs and outputs live in the disposable mount.
export const calculationFixture = `
builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet();
sheet.SetName("Form");
sheet.GetRange("A1").SetValue(2);
sheet.GetRange("B1").SetValue(3);
sheet.GetRange("C1").SetValue("=A1*B1");
sheet.GetRange("C2").SetValue("=C1+1");
sheet.GetRange("C3").SetValue("=C2*2");
builder.SaveFile("xlsx", "/work/calculation.xlsx");
builder.CloseFile();
`;

export const rowFixture = `
builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet();
sheet.SetName("Form");
sheet.GetRange("A3").SetValue("Items");
sheet.GetRange("A4").SetValue(2);
sheet.GetRange("B4").SetValue(3);
sheet.GetRange("C4").SetValue("=A4*B4+$E$1");
sheet.GetRange("E1").SetValue(1);
sheet.GetRange("A5").SetValue(4);
sheet.GetRange("B5").SetValue(5);
sheet.GetRange("C5").SetValue("=A5*B5+$E$1");
sheet.GetRange("C6").SetValue("=SUM(C4:C5)");
sheet.GetRange("A4:C4").SetBold(true);
var borders = ["Top", "Bottom", "Left", "Right", "InsideHorizontal", "InsideVertical"];
for (var borderIndex = 0; borderIndex < borders.length; borderIndex++) {
  sheet.GetRange("A4:C5").SetBorders(borders[borderIndex], "Thin", Api.CreateColorFromRGB(0, 0, 0));
}
sheet.GetRange("C4").SetNumberFormat("0.00");
sheet.GetRange("A4").GetValidation().Add("xlValidateWholeNumber", "xlValidAlertStop", "xlBetween", 0, 100);
sheet.GetRange("A8:C8").Merge(false);
sheet.GetRange("A8").SetValue("Agency");
Api.AddDefName("folio_body", "'Form'!$A$4:$C$5", false);
Api.AddDefName("folio_agency", "'Form'!$A$8:$C$8", false);
builder.SaveFile("xlsx", "/work/rows-base.xlsx");
builder.CloseFile();
`;

export const largeFixture = `
builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet();
sheet.SetName("Form");
var values = [];
for (var row = 0; row < 1001; row++) {
  var cells = [];
  for (var column = 0; column < 31; column++) {
    cells.push(row * 31 + column + 1);
  }
  values.push(cells);
}
sheet.GetRange("A1:AE1001").SetValue(values);
sheet.GetRange("AF1002").SetValue("=SUM(A1:AE1001)");
Api.AddDefName("folio_large", "'Form'!$A$1:$AE$1001", false);
Api.RecalculateAllFormulas();
builder.SaveFile("xlsx", "/work/large.xlsx");
builder.CloseFile();
`;
