import * as vscode from 'vscode';

const addedDecoration = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: 'rgba(80, 200, 120, 0.18)',
});

// Un timer por archivo (no uno solo compartido): con la revisión en lote,
// varias animaciones de distintos archivos pueden terminar a los pocos
// milisegundos una de otra, y un timer único hacía que la del archivo B
// cancelara la del archivo A antes de que se limpiara sola, dejando el
// resaltado verde de A pegado para siempre.
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

const MAX_ANIMATED_LINES = 400;
const TARGET_TOTAL_MS = 1200;
const MIN_CHUNK_DELAY_MS = 6;
const MAX_CHUNK_DELAY_MS = 30;
const LONG_LINE_CHUNK_SIZE = 40;

/**
 * Reemplaza TODO el contenido de un documento, tipeándolo de a poco si
 * `animate` es true (y el contenido no es enorme) — el archivo se abre como
 * pestaña de vista previa reutilizable en la columna activa, sin dividir la
 * pantalla. Guarda al terminar.
 */
export async function animatedReplaceAll(uri: vscode.Uri, newContent: string, animate: boolean): Promise<void> {
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(uri);
  } catch (openErr) {
    // openTextDocument puede fallar por motivos distintos a "no existe"
    // (binario, encoding que VS Code no reconoce, archivo bloqueado). Antes
    // se asumía siempre "no existe" y se lo vaciaba con fs.writeFile antes
    // de reintentar — eso truncaba a 0 bytes archivos reales que sí
    // existían pero no se podían abrir como texto. Ahora confirmamos con
    // stat() que genuinamente no existe antes de tocar nada.
    let exists = true;
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      exists = false;
    }
    if (exists) throw openErr;
    await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    doc = await vscode.workspace.openTextDocument(uri);
  }
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));

  if (!shouldAnimate(newContent, animate)) {
    await editor.edit((eb) => eb.replace(fullRange, newContent));
  } else {
    await editor.edit((eb) => eb.delete(fullRange), { undoStopBefore: true, undoStopAfter: false });
    await typeInto(editor, 0, newContent);
  }
  await doc.save();

  const end = editor.document.positionAt(editor.document.getText().length);
  flash(editor, new vscode.Range(doc.positionAt(0), end));
}

/**
 * Reemplaza un rango puntual de un documento existente (el resultado de un
 * edit_file) tipeando el texto nuevo en su lugar, sin dividir la pantalla.
 */
export async function animatedReplaceRange(uri: vscode.Uri, range: vscode.Range, newText: string, animate: boolean): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  const startOffset = doc.offsetAt(range.start);
  const removedLength = doc.offsetAt(range.end) - startOffset;
  const lengthBefore = doc.getText().length;

  if (!shouldAnimate(newText, animate)) {
    await editor.edit((eb) => eb.replace(range, newText));
  } else {
    await editor.edit((eb) => eb.delete(range), { undoStopBefore: true, undoStopAfter: false });
    await typeInto(editor, startOffset, newText);
  }
  await doc.save();

  // No usamos startOffset + newText.length directo: en un documento CRLF los
  // '\n' de newText se normalizan a '\r\n' al insertarse (un carácter más por
  // línea) — el mismo desfase que typeInto ya corrige más arriba. Medimos el
  // largo real del documento antes/después para saber cuánto quedó
  // efectivamente insertado, en vez de confiar en newText.length.
  const lengthAfter = editor.document.getText().length;
  const insertedLength = lengthAfter - lengthBefore + removedLength;
  const endOffset = startOffset + insertedLength;
  flash(editor, new vscode.Range(editor.document.positionAt(startOffset), editor.document.positionAt(endOffset)));
}

/** No hay documento que animar para un borrado de archivo — solo un aviso corto. */
export function notifyDelete(relPath: string): void {
  vscode.window.setStatusBarMessage(`Scorpk eliminó ${relPath}`, 4000);
}

function shouldAnimate(text: string, animate: boolean): boolean {
  if (!animate) return false;
  return text.split('\n').length <= MAX_ANIMATED_LINES;
}

async function typeInto(editor: vscode.TextEditor, startOffset: number, text: string): Promise<void> {
  const chunks = toChunks(text);
  if (chunks.length === 0) return;
  const delay = Math.max(MIN_CHUNK_DELAY_MS, Math.min(MAX_CHUNK_DELAY_MS, Math.floor(TARGET_TOTAL_MS / chunks.length)));

  let offset = startOffset;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const pos = editor.document.positionAt(offset);
    const lengthBefore = editor.document.getText().length;
    await editor.edit((eb) => eb.insert(pos, chunk), { undoStopBefore: false, undoStopAfter: i === chunks.length - 1 });
    // No asumimos que se insertaron exactamente chunk.length caracteres: si
    // el documento usa CRLF, VS Code normaliza los '\n' del chunk a '\r\n'
    // al aplicar el edit, insertando un carácter más de lo esperado por
    // línea. Medir el delta real evita que la posición del próximo
    // fragmento quede desfasada — que era la causa de que el "tipeo" se
    // viera desordenado/superpuesto en archivos con fin de línea CRLF.
    const lengthAfter = editor.document.getText().length;
    offset += lengthAfter - lengthBefore;
    const endPos = editor.document.positionAt(offset);
    editor.selection = new vscode.Selection(endPos, endPos);
    editor.revealRange(new vscode.Range(endPos, endPos));
    await sleep(delay);
  }
}

/** Parte el texto en fragmentos "tipeables": por línea, y sub-fragmentando líneas muy largas. */
function toChunks(text: string): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const suffix = i < lines.length - 1 ? '\n' : '';
    if (line.length <= LONG_LINE_CHUNK_SIZE * 2) {
      if (line.length > 0 || suffix) chunks.push(line + suffix);
      continue;
    }
    for (let j = 0; j < line.length; j += LONG_LINE_CHUNK_SIZE) {
      const isLastPiece = j + LONG_LINE_CHUNK_SIZE >= line.length;
      chunks.push(line.slice(j, j + LONG_LINE_CHUNK_SIZE) + (isLastPiece ? suffix : ''));
    }
  }
  return chunks;
}

function flash(editor: vscode.TextEditor, range: vscode.Range): void {
  const key = editor.document.uri.toString();
  editor.setDecorations(addedDecoration, [range]);
  const existing = flashTimers.get(key);
  if (existing) clearTimeout(existing);
  flashTimers.set(
    key,
    setTimeout(() => {
      editor.setDecorations(addedDecoration, []);
      flashTimers.delete(key);
    }, 2000),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
