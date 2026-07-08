import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "source.xlsx";
const outputPath = "Fechamento JUNHO 2026 - categorizado.xlsx";
const updates = JSON.parse(await fs.readFile("updates.json", "utf8")).updates;

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Cópia de GASTOS DETALHADOS");

for (const update of updates) {
  const zeroBasedRow = update.row - 1;
  if (update.space !== null) {
    sheet.getCell(zeroBasedRow, 4).values = [[update.space]];
  }
  if (update.sector !== null) {
    sheet.getCell(zeroBasedRow, 5).values = [[update.sector]];
  }
}

const check = await workbook.inspect({
  kind: "table",
  sheetId: "Cópia de GASTOS DETALHADOS",
  range: "A1:G25",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 7,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const previewMay = await workbook.render({
  sheetName: "GASTOS DETALHADOS",
  range: "A1:G25",
  scale: 1,
  format: "png",
});
await fs.writeFile("preview-gastos-detalhados.png", new Uint8Array(await previewMay.arrayBuffer()));

const previewJune = await workbook.render({
  sheetName: "Cópia de GASTOS DETALHADOS",
  range: "A1:G25",
  scale: 1,
  format: "png",
});
await fs.writeFile("preview-copia-gastos-detalhados.png", new Uint8Array(await previewJune.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, updatesApplied: updates.length }, null, 2));
