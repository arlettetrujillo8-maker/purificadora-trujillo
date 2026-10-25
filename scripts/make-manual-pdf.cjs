// Genera outputs/Manual-Operacion-Purificadora.pdf (sin dependencias).
// PDF minimo con Helvetica + WinAnsiEncoding, paginas A4 y saltos por contenido.
const fs = require("node:fs");
const path = require("node:path");

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const MAX_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------- texto ----
function sanitize(text) {
  return String(text)
    .replace(/→/g, ">")
    .replace(/—|–/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF\n]/g, "");
}

function escapePdf(text) {
  return sanitize(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Aproxima el ancho de una linea Helvetica (factor ~0.5 por punto).
function wrap(text, fontSize) {
  const factor = fontSize * 0.5;
  const maxChars = Math.max(1, Math.floor(MAX_W / factor));
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// -------------------------------------------------------------- pdf build --
function buildPdf(blocks) {
  // blocks: [{ type: 'title'|'h1'|'h2'|'p'|'li'|'spacer', text }]
  const fontSizes = { title: 19, h1: 15, h2: 13, p: 10.5, li: 10.5 };
  const leading = { title: 24, h1: 20, h2: 17, p: 14, li: 14 };

  // Pre-computa lineas y asigna a paginas.
  const pages = [];
  let page = [];
  let y = PAGE_H - MARGIN;

  function newPage() {
    pages.push(page);
    page = [];
    y = PAGE_H - MARGIN;
  }

  function emit(type, text) {
    const size = fontSizes[type] || 10.5;
    const lines = type === "spacer" ? [] : wrap(text, size);
    const spaceBefore = type === "title" ? 0 : type === "h1" ? 18 : type === "h2" ? 14 : 4;
    if (type !== "spacer") y -= spaceBefore;
    for (const line of lines) {
      if (y - leading[type] < MARGIN) newPage();
      page.push({ type, text: line, size, leading: leading[type] });
      y -= leading[type];
    }
    if (type === "spacer") y -= 8;
  }

  for (const block of blocks) emit(block.type, block.text);
  if (page.length) pages.push(page);

  // ------------------------------------------------------------ objetos ----
  const objects = [];
  const contentStreams = [];
  const pageObjects = [];

  pages.forEach((lines, index) => {
    let stream = "BT\n";
    let curFont = null;
    let curSize = null;
    let y = PAGE_H - MARGIN;
    for (const line of lines) {
      const fontRef = line.type === "title" || line.type === "h1" || line.type === "h2" ? 5 : 4;
      if (fontRef !== curFont || line.size !== curSize) {
        stream += `/${fontRef === 5 ? "F2" : "F1"} ${line.size} Tf\n`;
        curFont = fontRef;
        curSize = line.size;
      }
      stream += `1 0 0 1 ${MARGIN} ${y} Tm (${escapePdf(line.text)}) Tj\n`;
      y -= line.leading;
    }
    stream += "ET";
    const id = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentStreams.push(id);
    pageObjects.push(objects.length + 1 + (index === 0 ? 0 : 0));
  });

  // Reordena: 1 catalog, 2 pages, luego por cada pagina: page, contents, luego fonts.
  // Construye en orden con indices reales.
  const obj = [];
  const pageRefs = [];
  const contentRefs = [];
  let catalogRef, pagesRef, f1Ref, f2Ref;

  // 1: Catalog
  obj.push(null);
  catalogRef = obj.length;
  obj.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  // 2: Pages
  pagesRef = obj.length;
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  obj.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  // 3..N: por pagina -> page obj + contents obj
  pages.forEach((_, i) => {
    const pageRef = obj.length;
    obj.push(null); // placeholder, se rellena despues
    const contentRef = obj.length;
    obj.push(null);
    pageRefs.push(pageRef);
    contentRefs.push(contentRef);
  });
  // Fonts
  f1Ref = obj.length;
  obj.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  f2Ref = obj.length;
  obj.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  // Rellena las paginas y contents con referencias correctas.
  pages.forEach((_, i) => {
    obj[pageRefs[i]] = `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1Ref} 0 R /F2 ${f2Ref} 0 R >> >> /Contents ${contentRefs[i]} 0 R >>`;
    obj[contentRefs[i]] = objects[i];
  });

  // ------------------------------------------------------------ xref ------
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  obj.forEach((body, index) => {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${obj.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < obj.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${obj.length} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// --------------------------------------------------------------- contenido --
const C = (type, text) => ({ type, text });

const blocks = [
  C("title", "Purificadora Trujillo - Manual de operacion"),
  C("p", "Resumen de los flujos de uso diario de la app. Version 20261025-venta-dos-columnas."),
  C("h1", "1. Entrada"),
  C("li", "Administrador: se autentica con la cuenta central (correo + contrasena de Supabase). La sesion queda guardada en el dispositivo."),
  C("li", "Usuario (repartidor/ventanilla): selecciona su nombre y teclea su PIN para iniciar turno. El PIN se pide por turno."),
  C("h1", "2. Venta paso a paso"),
  C("li", "1) Nueva venta > cliente: escribe el nombre y toca la coincidencia (o Registrar cliente nuevo)."),
  C("li", "2) Cantidad de garrafones y precio (viene con el autorizado; si lo cambias, pide motivo y permiso)."),
  C("li", "3) Forma de pago: Efectivo, Fiado o Mixto. Fiado requiere cliente registrado."),
  C("li", "4) Envases: intercambio normal 1:1, o elige Recibio mas/menos vacios o danados."),
  C("li", "5) Registrar venta. Si es efectivo y no hay caja, se abre sola con fondo 0."),
  C("li", "La venta aparece en Ultimas ventas y, si es fiado, suma el saldo del cliente."),
  C("h1", "3. Fiado y pagos"),
  C("li", "Fiado y pagos: lista clientes con saldo (cargos menos abonos) y antiguedad de la deuda."),
  C("li", "Cobrar: abono en efectivo (requiere caja abierta) o transferencia. El saldo se deriva del ledger, no se edita a mano."),
  C("h1", "4. Ruta / Ronda (repartidor)"),
  C("li", "1) Iniciar ronda: elige la ruta (Ruta 1 / Ruta 2) y escribe la carga (ej. 50 llenos desde Local)."),
  C("li", "2) Vender en ruta con canal Ruta 1: cada venta descuenta la carga de la ronda. Si se acaba, pide recarga."),
  C("li", "3) Recargar: cantidad adicional con motivo."),
  C("li", "4) Regresar ronda: llenos que regresan (vienen con lo esperado), vacios que traes (prellenados con el inventario real de la ruta), danados y observacion si los vacios no cuadran."),
  C("li", "5) Cerrar ronda: el boton cambia a Cerrar ronda; al cerrarla, la ruta queda libre."),
  C("li", "La ronda no se cierra si llenos + danados no cuadran con lo esperado sin resolver la inconsistencia."),
  C("h1", "5. Caja"),
  C("li", "Se abre sola al primer movimiento en efectivo (fondo 0) o manualmente desde Caja."),
  C("li", "Cerrar caja: captura el contado fisico. Si no coincide con el esperado, muestra la diferencia y exige motivo."),
  C("h1", "6. Cierre de jornada"),
  C("li", "Sin rondas ni cajas abiertas, pulsa Cerrar jornada."),
  C("li", "Cierra lo que quede y deja la frontera del dia: Ultimas ventas y contadores quedan acotados a la jornada en curso."),
  C("h1", "7. Sin senal (modo offline)"),
  C("li", "Sin internet la app sigue operando igual: las operaciones se guardan localmente y se ven como N pendiente(s) arriba."),
  C("li", "Al reconectar sincronizan solas (sin duplicar). Tambien hay un boton Sincronizar y el panel de cola en Diagnostico."),
  C("spacer", ""),
  C("p", "Sugerencia: el operador debe iniciar sesion en linea; su turno se reanuda si la app se abre sin senal en el mismo dispositivo."),
];

const pdf = buildPdf(blocks);
const out = path.join(__dirname, "..", "outputs", "Manual-Operacion-Purificadora.pdf");
fs.writeFileSync(out, pdf);
console.log(`PDF generado: ${out} (${pdf.length} bytes, ${blocks.length} bloques)`);
