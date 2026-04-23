import * as XLSX from "xlsx";

export async function loadExcel() {

  const response = await fetch("/dfmergenew.xlsx");

  const buffer = await response.arrayBuffer();

  const workbook = XLSX.read(buffer);

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const json = XLSX.utils.sheet_to_json(sheet);

  return json;
}