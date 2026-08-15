// parser.js
// Convierte el .xls/.xlsx del cuadrante en una estructura de datos limpia.
//
// Estructura esperada por bloque (se repite tantas veces como secciones haya):
//   Fila 1: "NOMBRE SECCIÓN" | 1 | 2 | 3 | ... (números de día)
//   Fila 2: "DÍA DE LA SEMANA" | M | X | J | ... (letras del día)
//   Fila 3 (opcional, solo en subgrupos): "SEGURIDAD JEFATURA" | turno base por día
//   Filas siguientes: una por persona. Celda vacía = sigue el turno base
//   (si existe); celda con código = ese código manda ese día.

function normalizeCell(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim().toUpperCase();
}

function isSectionHeader(row) {
  return !!(row && row[0] && typeof row[1] === 'number' && row[1] === 1);
}

function countDays(row) {
  let n = 0;
  for (let c = 1; c < row.length; c++) {
    if (typeof row[c] === 'number') n++;
    else break;
  }
  return n;
}

/**
 * @param {Array<Array<any>>} aoa - hoja convertida con sheet_to_json(ws, {header:1, raw:true})
 * @returns {{ title: string, sections: Array }}
 */
export function parseCuadrante(aoa) {
  // Título general: primera celda no vacía de la fila 0 (suele estar en col 3, ej. "UPS (SEGURIDAD)")
  const row0 = aoa[0] || [];
  const titleCell = row0.find((v) => v !== undefined && v !== null && String(v).trim() !== '');
  const title = titleCell ? String(titleCell).trim() : 'Cuadrante';

  const sections = [];
  let r = 1;

  while (r < aoa.length) {
    const row = aoa[r] || [];

    if (isSectionHeader(row)) {
      const name = String(row[0]).trim();
      const numDays = countDays(row);
      const dayNumbers = row.slice(1, 1 + numDays).map((v) => Number(v));
      r++;

      const weekdayRow = aoa[r] || [];
      const weekdays = weekdayRow.slice(1, 1 + numDays).map(normalizeCell);
      r++;

      let groupShift = null;
      const maybeGroupRow = aoa[r] || [];
      if (String(maybeGroupRow[0] || '').trim().toUpperCase() === 'SEGURIDAD JEFATURA') {
        groupShift = maybeGroupRow.slice(1, 1 + numDays).map(normalizeCell);
        r++;
      }

      const people = [];
      while (r < aoa.length) {
        const prow = aoa[r] || [];
        if (!prow[0] || isSectionHeader(prow)) break;
        people.push({
          name: String(prow[0]).trim(),
          shifts: prow.slice(1, 1 + numDays).map(normalizeCell),
        });
        r++;
      }

      sections.push({ name, numDays, dayNumbers, weekdays, groupShift, people });
    } else {
      r++;
    }
  }

  return { title, sections };
}

/**
 * Lee un ArrayBuffer (del <input type="file">) y devuelve la estructura parseada.
 * Requiere que la librería global `XLSX` (SheetJS) esté cargada.
 */
export function parseWorkbookArrayBuffer(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  // Usa la primera hoja que tenga más de una fila (evita hojas vacías tipo "Hoja1")
  const sheetName =
    wb.SheetNames.find((n) => {
      const ws = wb.Sheets[n];
      const ref = ws['!ref'];
      return ref && XLSX.utils.decode_range(ref).e.r > 1;
    }) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  return parseCuadrante(aoa);
}

/**
 * Lee TODAS las hojas de un libro con datos reconocibles (para Excel con
 * varios meses, una hoja por mes). Ignora hojas vacías o irrelevantes.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Array<{ sheetName: string, title: string, sections: Array }>}
 */
export function parseWorkbookAllSheets(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const results = [];

  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const ref = ws['!ref'];
    if (!ref || XLSX.utils.decode_range(ref).e.r <= 1) return; // hoja vacía

    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const parsed = parseCuadrante(aoa);
    if (!parsed.sections || parsed.sections.length === 0) return; // no reconocible

    results.push({ sheetName, title: parsed.title, sections: parsed.sections });
  });

  return results;
}
