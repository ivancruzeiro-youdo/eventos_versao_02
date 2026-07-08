import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/youdo/CascadeProjects/windsurf-project/youdo-v2/outputs/lounge2_sheet";

const fichaTecnica = [
  ["Categoria", "Item", "Especificação / Descrição", "Quantidade", "Observações"],
  ["Localização", "Endereço", "Rua Piquiri, 390 - Rebouças", "", ""],
  ["Capacidade", "Capacidade máxima", "102 pessoas", 102, ""],
  ["Audiovisual", "Painel de LED", "3x2m P2 - resolução 1600x800 pixels", 1, ""],
  ["Som", "Sistema de som profissional", "2 PAs, mesa de som com 4 canais disponíveis em XLR ou P10", 1, ""],
  ["Iluminação", "Sistema de luz profissional", "Controlado por MA", 1, ""],
  ["Climatização", "Ar-condicionado Midea Inverter", "30.000 BTUs, frio", 4, ""],
  ["Bar", "Bancada refrigerada", "6 portas, capacidade -4 graus", 1, ""],
  ["Bar", "Cubas", "Cubas da bancada", 3, ""],
  ["Bar", "Estações de bar", "Com cuba para gelo, garrafeiro e 2 prateleiras cada", 2, ""],
  ["Internet", "Download", "200 Mb/s", "", ""],
  ["Internet", "Upload", "50 Mb/s", "", ""],
  ["Planta", "Planta baixa executiva", "Disponível conforme material técnico", "", ""],
  ["Observação", "Bar", "Copos e utensílios de bar na imagem não estão inclusos na estrutura disponível.", "", ""],
];

const mobiliarioDisponivel = [
  ["Item", "Medidas / Descrição", "Quantidade", "Status", "Observações"],
  ["Mesa bistrô preta redonda", "70 cm", 5, "Disponível", ""],
  ["Banqueta Iron preta", "", 20, "Disponível", ""],
  ["Puffe", "1x1 m", 4, "Disponível", ""],
  ["Puffes", "45 cm", 8, "Disponível", ""],
  ["Mesa de apoio", "45 cm", 6, "Disponível", ""],
  ["Cachepô com bambu", "150 cm", 10, "Disponível", ""],
  ["Biombo preto", "180x80 cm", 2, "Disponível", ""],
  ["Adega em madeira", "200x80 cm", 1, "Disponível", ""],
  ["Aparador industrial 2", "220x30 cm", 1, "Disponível", ""],
  ["Sofá de corda", "200x75 cm", 2, "Disponível", ""],
  ["Poltrona de corda", "75x75 cm", 4, "Disponível", ""],
  ["Mesa redonda externa", "90 cm", 1, "Disponível", ""],
  ["Cadeiras de corda", "", 4, "Disponível", ""],
];

const mobiliarioConsulta = [
  ["Item", "Medidas / Descrição", "Quantidade", "Status", "Observações"],
  ["Mesa de jantar em madeira", "80x80 cm", 13, "Mediante consulta", ""],
  ["Cadeira Paris em madeira com estofado preto", "", 80, "Mediante consulta", ""],
  ["Aparador industrial 1", "160x45 cm", 1, "Mediante consulta", ""],
];

function styleSheet(sheet, tableRange, widths) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);

  const used = sheet.getRange(tableRange);
  used.format.font = { name: "Arial", size: 10, color: "#111827" };
  used.format.borders = {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
    bottom: { style: "thin", color: "#E5E7EB" },
  };
  used.format.wrapText = true;
  used.format.verticalAlignment = "top";

  const header = sheet.getRange(tableRange.replace(/\d+:.+/, "1:" + tableRange.split(":")[1].replace(/\d+/, "1")));
  header.format.fill = { color: "#F3F4F6" };
  header.format.font = { bold: true, color: "#111827" };
  header.format.horizontalAlignment = "center";
  header.format.verticalAlignment = "middle";
  header.format.rowHeightPx = 32;
  header.format.borders = { bottom: { style: "medium", color: "#D1D5DB" } };

  const lastRow = tableRange.split(":")[1].replace(/[A-Z]+/, "");
  widths.forEach((widthPx, index) => {
    const column = String.fromCharCode("A".charCodeAt(0) + index);
    sheet.getRange(`${column}1:${column}${lastRow}`).format.columnWidthPx = widthPx;
  });
}

function addTable(sheet, range, name) {
  const table = sheet.tables.add(range, true, name);
  table.style = "TableStyleLight1";
  table.showFilterButton = true;
  table.showBandedRows = false;
  return table;
}

const workbook = Workbook.create();

const ficha = workbook.worksheets.add("Ficha Tecnica");
ficha.getRange(`A1:E${fichaTecnica.length}`).values = fichaTecnica;
styleSheet(ficha, `A1:E${fichaTecnica.length}`, [130, 210, 480, 110, 300]);
ficha.getRange(`D2:D${fichaTecnica.length}`).format.horizontalAlignment = "center";
addTable(ficha, `A1:E${fichaTecnica.length}`, "FichaTecnicaLounge2");

const mob = workbook.worksheets.add("Mobiliario Disponivel");
mob.getRange(`A1:E${mobiliarioDisponivel.length}`).values = mobiliarioDisponivel;
styleSheet(mob, `A1:E${mobiliarioDisponivel.length}`, [260, 190, 110, 150, 300]);
mob.getRange(`C2:C${mobiliarioDisponivel.length}`).format.horizontalAlignment = "center";
mob.getRange(`D2:D${mobiliarioDisponivel.length}`).dataValidation = {
  rule: { type: "list", values: ["Disponível", "Indisponível", "Reservado", "Em manutenção"] },
};
addTable(mob, `A1:E${mobiliarioDisponivel.length}`, "MobiliarioDisponivelLounge2");

const consulta = workbook.worksheets.add("Mediante Consulta");
consulta.getRange(`A1:E${mobiliarioConsulta.length}`).values = mobiliarioConsulta;
styleSheet(consulta, `A1:E${mobiliarioConsulta.length}`, [320, 190, 110, 180, 300]);
consulta.getRange(`C2:C${mobiliarioConsulta.length}`).format.horizontalAlignment = "center";
consulta.getRange(`D2:D${mobiliarioConsulta.length}`).dataValidation = {
  rule: { type: "list", values: ["Mediante consulta", "Disponível", "Indisponível", "Reservado"] },
};
addTable(consulta, `A1:E${mobiliarioConsulta.length}`, "MobiliarioConsultaLounge2");

await fs.mkdir(outputDir, { recursive: true });

for (const sheetName of ["Ficha Tecnica", "Mobiliario Disponivel", "Mediante Consulta"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${sheetName.replaceAll(" ", "_").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "Ficha_Tecnica_Lounge_2.xlsx"));
