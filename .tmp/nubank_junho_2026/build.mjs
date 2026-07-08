import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "/Users/youdo/CascadeProjects/windsurf-project/youdo-v2/outputs/nubank_junho_2026";
const previewDir = "/Users/youdo/CascadeProjects/windsurf-project/youdo-v2/.tmp/nubank_junho_2026";
const outputPath = `${outputDir}/gastos_nubank_junho_2026.xlsx`;

const transactions = [
  ["2026-05-13", "Anthropic", "Anthropic / Claude", 20.68, "3869", "BRL 20,00 = USD 4,08"],
  ["2026-05-14", "Claude.Ai Subscription", "Anthropic / Claude", 114.08, "3869", "BRL 110,00 = USD 22,44"],
  ["2026-05-14", "Lovable", "Lovable", 286.16, "3869", "BRL 276,59 = USD 56,29"],
  ["2026-05-16", "Anthropic", "Anthropic / Claude", 261.30, "3869", "BRL 247,50 = USD 49,84"],
  ["2026-05-16", "Twilio Inc", "Twilio", 101.67, "3869", "USD 20,00"],
  ["2026-05-17", "Elevenlabs.Io", "ElevenLabs", 26.21, "3869", "USD 5,00"],
  ["2026-05-19", "Anthropic: Claude Team", "Anthropic / Claude", 680.79, "3869", "BRL 660,20 = USD 131,31"],
  ["2026-05-19", "Lovable", "Lovable", 595.40, "3869", "BRL 577,42 = USD 114,84"],
  ["2026-05-20", "Chatwoot", "Chatwoot", 693.48, "3869", "USD 133,00"],
  ["2026-05-20", "Windsurf", "Windsurf", 135.88, "3869", "BRL 131,13 = USD 26,06"],
  ["2026-05-20", "Www_contabo_com", "Contabo", 83.06, "3869", "EUR 13,45 = USD 15,93"],
  ["2026-05-21", "Dl *Google Ads12047271", "Google Ads", 6000.00, "3869", "Cobrança em reais"],
  ["2026-05-22", "Www_contabo_com", "Contabo", 97.61, "3869", "EUR 15,80 = USD 18,72"],
  ["2026-05-22", "Facebk *Dqp5cmvz42", "Meta Ads", 2846.00, "3869", "Cobrança em reais"],
  ["2026-05-22", "Google Ads1204727139", "Google Ads", 2000.00, "3869", "Cobrança em reais"],
  ["2026-05-23", "Windsurf", "Windsurf", 135.19, "3869", "BRL 130,63 = USD 26,05"],
  ["2026-05-24", "Starlink Internet", "Starlink", 116.19, "3869", "Cobrança em reais"],
  ["2026-05-26", "Apple.Com/Bill", "Apple", 32.90, "3869", "Cobrança em reais"],
  ["2026-05-27", "Google Ads1204727139", "Google Ads", 2000.00, "3869", "Cobrança em reais"],
  ["2026-05-27", "Apple.Com/Us", "Apple", 514.49, "3869", "USD 99,00"],
  ["2026-05-28", "Windsurf", "Windsurf", 78.52, "3869", "USD 15,00"],
  ["2026-05-28", "Ebn *Spotify", "Spotify", 23.90, "3869", "Cobrança em reais"],
  ["2026-05-28", "Openai *Chatgpt Subscr", "OpenAI / ChatGPT", 104.18, "3869", "BRL 99,90 = USD 19,90"],
  ["2026-05-29", "Anthropic", "Anthropic / Claude", 51.71, "3869", "BRL 50,00 = USD 9,89"],
  ["2026-05-31", "Windsurf", "Windsurf", 78.51, "3869", "USD 15,00"],
  ["2026-06-01", "Facebk *75wkvnd422", "Meta Ads", 77.26, "3869", "USD 14,84"],
  ["2026-06-01", "Ebn *Spotify", "Spotify", 23.90, "3869", "Cobrança em reais"],
  ["2026-06-02", "Starlink Internet", "Starlink", 471.04, "3869", "Cobrança em reais"],
  ["2026-06-02", "Google Ads1204727139", "Google Ads", 2282.06, "3869", "Cobrança em reais"],
  ["2026-06-02", "Anthropic", "Anthropic / Claude", 51.60, "3869", "BRL 50,00 = USD 9,91"],
  ["2026-06-02", "Google Workspace_youdo", "Google Workspace", 807.47, "3869", "Cobrança em reais"],
  ["2026-06-02", "Apple.Com/Bill", "Apple", 19.90, "3869", "Cobrança em reais"],
  ["2026-06-07", "Openai *Chatgpt Subscr", "OpenAI / ChatGPT", 106.08, "3869", "USD 20,00"],
  ["2026-06-09", "Uber Uber *Trip Help.U", "Uber", 5.44, "8184", "Cobrança em reais"],
];

const suppliers = [
  "Google Ads",
  "Meta Ads",
  "Anthropic / Claude",
  "Lovable",
  "Google Workspace",
  "Chatwoot",
  "Starlink",
  "Apple",
  "Windsurf",
  "OpenAI / ChatGPT",
  "Contabo",
  "Twilio",
  "Spotify",
  "ElevenLabs",
  "Uber",
];

const supplierPi = {
  "Anthropic / Claude": "167",
  "Lovable": "167",
  "Google Workspace": "167",
  "Chatwoot": "167",
  "Starlink": "167",
  "Apple": "178",
  "Windsurf": "167",
  "OpenAI / ChatGPT": "167",
  "Contabo": "167",
  "Twilio": "167",
  "Spotify": "178",
  "ElevenLabs": "167",
  "Uber": "A confirmar",
  "Google Ads": "Rateio",
  "Meta Ads": "Rateio",
};

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Resumo por fornecedor");
const detail = workbook.worksheets.add("Lançamentos");
const allocation = workbook.worksheets.add("Lançamentos por PI");

summary.showGridLines = false;
detail.showGridLines = false;
allocation.showGridLines = false;

detail.getRange("A1:G35").values = [
  ["Data", "Fornecedor original", "Fornecedor unificado", "Valor (R$)", "PI / regra", "Cartão final", "Moeda / valor original"],
  ...transactions.map(([date, original, normalized, value, card, source]) => [
    new Date(`${date}T12:00:00Z`),
    original,
    normalized,
    value,
    supplierPi[normalized],
    card,
    source,
  ]),
];
detail.tables.add("A1:G35", true, "LancamentosNubank");
detail.freezePanes.freezeRows(1);
detail.getRange("A2:A35").setNumberFormat("dd/mm/yyyy");
detail.getRange("D2:D35").setNumberFormat('"R$" #,##0.00;[Red]-"R$" #,##0.00');
detail.getRange("A1:G1").format = {
  fill: "#6F2DBD",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 28,
  verticalAlignment: "center",
};
detail.getRange("A2:G35").format.borders = { preset: "all", style: "thin", color: "#E7E2ED" };
detail.getRange("A2:G35").format.rowHeight = 21;
detail.getRange("A:A").format.columnWidth = 13;
detail.getRange("B:B").format.columnWidth = 28;
detail.getRange("C:C").format.columnWidth = 23;
detail.getRange("D:D").format.columnWidth = 15;
detail.getRange("E:E").format.columnWidth = 16;
detail.getRange("F:F").format.columnWidth = 13;
detail.getRange("G:G").format.columnWidth = 30;
detail.getRange("D2:D35").format.horizontalAlignment = "right";
detail.getRange("E2:F35").format.horizontalAlignment = "center";

summary.mergeCells("A1:E1");
summary.getRange("A1").values = [["Gastos Nubank - Fatura de junho de 2026"]];
summary.getRange("A1:E1").format = {
  fill: "#6F2DBD",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  rowHeight: 38,
};
summary.getRange("A3:B5").values = [
  ["Total da fatura", null],
  ["Fornecedores unificados", null],
  ["Lançamentos", null],
];
summary.getRange("B3").formulas = [["=ROUND(SUM('Lançamentos'!D2:D35),2)"]];
summary.getRange("B4").formulas = [["=COUNTA(A9:A23)"]];
summary.getRange("B5").formulas = [["=COUNTA('Lançamentos'!A2:A35)"]];
summary.getRange("A3:A5").format = {
  fill: "#EEE5F7",
  font: { bold: true, color: "#3B1D59" },
};
summary.getRange("B3:B5").format = {
  fill: "#FAF8FC",
  font: { bold: true, color: "#241332", size: 12 },
};
summary.getRange("A3:B5").format.borders = { preset: "all", style: "thin", color: "#D8C9E7" };
summary.getRange("B3").setNumberFormat('"R$" #,##0.00');
summary.getRange("B4:B5").setNumberFormat("0");

summary.getRange("A8:E23").values = [
  ["Fornecedor unificado", "Quantidade", "Total (R$)", "% da fatura", "PI / regra"],
  ...suppliers.map((supplier) => [supplier, null, null, null, supplierPi[supplier]]),
];
for (let row = 9; row <= 23; row += 1) {
  summary.getRange(`B${row}`).formulas = [[`=COUNTIF('Lançamentos'!$C$2:$C$35,A${row})`]];
  summary.getRange(`C${row}`).formulas = [[`=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A${row},'Lançamentos'!$D$2:$D$35),2)`]];
  summary.getRange(`D${row}`).formulas = [[`=C${row}/$B$3`]];
}
summary.tables.add("A8:E23", true, "ResumoFornecedores");
summary.getRange("A8:E8").format = {
  fill: "#6F2DBD",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 28,
  verticalAlignment: "center",
};
summary.getRange("A9:E23").format.borders = { preset: "all", style: "thin", color: "#E7E2ED" };
summary.getRange("A9:E23").format.rowHeight = 22;
summary.getRange("C9:C23").setNumberFormat('"R$" #,##0.00');
summary.getRange("D9:D23").setNumberFormat("0.0%");
summary.getRange("A:A").format.columnWidth = 27;
summary.getRange("B:B").format.columnWidth = 18;
summary.getRange("C:C").format.columnWidth = 19;
summary.getRange("D:D").format.columnWidth = 15;
summary.getRange("E:E").format.columnWidth = 17;
summary.getRange("B9:D23").format.horizontalAlignment = "right";
summary.getRange("E9:E23").format.horizontalAlignment = "center";
summary.freezePanes.freezeRows(8);

summary.getRange("F7:G17").values = [
  ["Fornecedor", "Total (R$)"],
  ...suppliers.slice(0, 10).map((supplier, index) => [supplier, null]),
];
for (let row = 8; row <= 17; row += 1) {
  summary.getRange(`G${row}`).formulas = [[`=C${row + 1}`]];
}
summary.getRange("F7:G17").format.font = { size: 9, color: "#6B6370" };
summary.getRange("G8:G17").setNumberFormat('"R$" #,##0');
const chart = summary.charts.add("bar", summary.getRange("F7:G17"));
chart.setPosition("F2", "M20");
chart.title = "Maiores fornecedores";
chart.titleTextStyle.fontSize = 13;
chart.hasLegend = false;
chart.xAxis = { axisType: "textAxis" };
chart.yAxis = { numberFormatCode: 'R$ #,##0' };

summary.getRange("A25:E27").values = [
  ["Critérios de unificação", null, null, null, null],
  ["Google Ads", "DL *Google Ads e Google Ads com identificadores foram agrupados.", null, null, null],
  ["Outros grupos", "Facebk = Meta Ads; Apple.Com = Apple; Anthropic/Claude.Ai = Anthropic / Claude.", null, null, null],
];
summary.mergeCells("A25:E25");
summary.mergeCells("B26:E26");
summary.mergeCells("B27:E27");
summary.getRange("A25:E25").format = {
  fill: "#EEE5F7",
  font: { bold: true, color: "#3B1D59" },
};
summary.getRange("A26:A27").format.font = { bold: true, color: "#3B1D59" };
summary.getRange("A25:E27").format.borders = { preset: "all", style: "thin", color: "#D8C9E7" };
summary.getRange("B26:E27").format.wrapText = true;
summary.getRange("A26:E27").format.rowHeight = 38;

allocation.mergeCells("A1:F1");
allocation.getRange("A1").values = [["Lançamentos por PI - junho de 2026"]];
allocation.getRange("A1:F1").format = {
  fill: "#2F6B55",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  rowHeight: 38,
};
allocation.getRange("A3:F3").values = [[
  "Fornecedor",
  "Categoria",
  "PI",
  "Valor a lançar (R$)",
  "Peso aplicado",
  "Regra / origem",
]];

const directSuppliers = [
  ["Anthropic / Claude", "Serviço", "167"],
  ["Lovable", "Serviço", "167"],
  ["Google Workspace", "Serviço", "167"],
  ["Chatwoot", "Serviço", "167"],
  ["Starlink", "Internet", "167"],
  ["Apple", "Serviço", "178"],
  ["Windsurf", "Serviço", "167"],
  ["OpenAI / ChatGPT", "Serviço", "167"],
  ["Contabo", "Infraestrutura", "167"],
  ["Twilio", "Serviço", "167"],
  ["Spotify", "Serviço", "178"],
  ["ElevenLabs", "Serviço", "167"],
  ["Uber", "Transporte", "A confirmar"],
];

allocation.getRange("A4:F23").values = [
  ...directSuppliers.map(([supplier, category, pi]) => [
    supplier,
    category,
    pi,
    null,
    1,
    "PI conforme referência enviada",
  ]),
  ["Google Ads", "Eventos", "178/176", null, 8267.70 / 11450.27, "Rateio Google Ads da referência"],
  ["Google Ads", "Coworking", "167", null, 2432.21 / 11450.27, "Rateio Google Ads da referência"],
  ["Google Ads", "Rooftop", "178", null, 750.36 / 11450.27, "Rateio Google Ads da referência"],
  ["Meta Ads", "Eventos", "178/176", null, 3411.09 / 9409.11, "Peso normalizado pelos valores-base"],
  ["Meta Ads", "Coworking", "167", null, 2637.89 / 9409.11, "Peso normalizado pelos valores-base"],
  ["Meta Ads", "Rooftop", "178", null, 1895.10 / 9409.11, "Peso normalizado pelos valores-base"],
  ["Meta Ads", "Studios", "167", null, 1465.03 / 9409.11, "Peso normalizado pelos valores-base"],
];
allocation.getRange("F16").values = [["PI não localizado na referência; confirmar"]];

for (let row = 4; row <= 16; row += 1) {
  allocation.getRange(`D${row}`).formulas = [[
    `=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A${row},'Lançamentos'!$D$2:$D$35),2)`,
  ]];
}
allocation.getRange("D17").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A17,'Lançamentos'!$D$2:$D$35)*E17,2)"]];
allocation.getRange("D18").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A18,'Lançamentos'!$D$2:$D$35)*E18,2)"]];
allocation.getRange("D19").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A19,'Lançamentos'!$D$2:$D$35)-D17-D18,2)"]];
allocation.getRange("D20").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A20,'Lançamentos'!$D$2:$D$35)*E20,2)"]];
allocation.getRange("D21").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A21,'Lançamentos'!$D$2:$D$35)*E21,2)"]];
allocation.getRange("D22").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A22,'Lançamentos'!$D$2:$D$35)*E22,2)"]];
allocation.getRange("D23").formulas = [["=ROUND(SUMIF('Lançamentos'!$C$2:$C$35,A23,'Lançamentos'!$D$2:$D$35)-D20-D21-D22,2)"]];

allocation.tables.add("A3:F23", true, "LancamentosPorPI");
allocation.freezePanes.freezeRows(3);
allocation.getRange("A3:F3").format = {
  fill: "#2F6B55",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 28,
  verticalAlignment: "center",
};
allocation.getRange("A4:F23").format.borders = { preset: "all", style: "thin", color: "#D9E5DF" };
allocation.getRange("A4:F23").format.rowHeight = 22;
allocation.getRange("D4:D23").setNumberFormat('"R$" #,##0.00');
allocation.getRange("E4:E23").setNumberFormat("0.00%");
allocation.getRange("A:A").format.columnWidth = 24;
allocation.getRange("B:B").format.columnWidth = 18;
allocation.getRange("C:C").format.columnWidth = 14;
allocation.getRange("D:D").format.columnWidth = 22;
allocation.getRange("E:E").format.columnWidth = 16;
allocation.getRange("F:F").format.columnWidth = 36;
allocation.getRange("C4:C23").format.horizontalAlignment = "center";
allocation.getRange("D4:E23").format.horizontalAlignment = "right";

allocation.getRange("A25:C28").values = [
  ["Conferência", "Valor", "Status"],
  ["Total da fatura", null, null],
  ["Total lançado por PI", null, null],
  ["Diferença", null, null],
];
allocation.getRange("B26").formulas = [["=ROUND(SUM('Lançamentos'!D2:D35),2)"]];
allocation.getRange("B27").formulas = [["=ROUND(SUM(D4:D23),2)"]];
allocation.getRange("B28").formulas = [["=ROUND(B27-B26,2)"]];
allocation.getRange("C28").formulas = [['=IF(B28=0,"OK","REVISAR")']];
allocation.getRange("A25:C25").format = {
  fill: "#DCECE5",
  font: { bold: true, color: "#234D3E" },
};
allocation.getRange("A25:C28").format.borders = { preset: "all", style: "thin", color: "#AFCBBC" };
allocation.getRange("A26:A28").format.font = { bold: true };
allocation.getRange("B26:B28").setNumberFormat('"R$" #,##0.00;[Red]-"R$" #,##0.00');
allocation.getRange("C28").format = {
  fill: "#D9EAD3",
  font: { bold: true, color: "#1F5A24" },
  horizontalAlignment: "center",
};

allocation.mergeCells("A30:F30");
allocation.getRange("A30").values = [[
  "Nota: os percentuais exibidos na referência do Facebook somavam 103,90%. Foram usados os valores-base das categorias, normalizados para 100%. Uber não constava na referência e ficou como PI a confirmar.",
]];
allocation.getRange("A30:F30").format = {
  fill: "#FFF2CC",
  font: { color: "#6B5200", italic: true },
  wrapText: true,
  rowHeight: 44,
  verticalAlignment: "center",
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const summaryPreview = await workbook.render({
  sheetName: "Resumo por fornecedor",
  range: "A1:M27",
  scale: 1.4,
  format: "png",
});
await fs.writeFile(`${previewDir}/resumo.png`, new Uint8Array(await summaryPreview.arrayBuffer()));

const detailPreview = await workbook.render({
  sheetName: "Lançamentos",
  range: "A1:G35",
  scale: 1.2,
  format: "png",
});
await fs.writeFile(`${previewDir}/lancamentos.png`, new Uint8Array(await detailPreview.arrayBuffer()));

const allocationPreview = await workbook.render({
  sheetName: "Lançamentos por PI",
  range: "A1:F30",
  scale: 1.3,
  format: "png",
});
await fs.writeFile(`${previewDir}/lancamentos_por_pi.png`, new Uint8Array(await allocationPreview.arrayBuffer()));

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: "Resumo por fornecedor!A1:E23",
  include: "values,formulas",
  tableMaxRows: 24,
  tableMaxCols: 5,
});
console.log(summaryCheck.ndjson);

const allocationCheck = await workbook.inspect({
  kind: "table",
  range: "Lançamentos por PI!A3:F28",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 6,
});
console.log(allocationCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`SAVED ${outputPath}`);
