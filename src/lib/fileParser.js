/**
 * Client-side file content extraction.
 * Handles PDF, DOCX, XLSX/CSV, and plain text files.
 * Libraries are lazy-loaded to keep the initial bundle small.
 * @module fileParser
 */

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl',
  'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'graphql', 'gql', 'proto', 'svelte', 'vue',
  'log', 'diff', 'patch', 'gitignore', 'dockerfile',
  'makefile', 'cmake', 'gradle', 'swift', 'kt', 'scala',
  'r', 'lua', 'php', 'pl', 'pm', 'ex', 'exs', 'erl',
  'hs', 'clj', 'lisp', 'el', 'vim', 'tf', 'hcl',
]);

/**
 * @param {string} name
 * @returns {string}
 */
function getExt(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function parsePdf(buffer) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    if (text.trim()) pages.push(text);
  }
  return pages.join('\n\n');
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function parseDocx(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function parseSpreadsheet(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      if (workbook.SheetNames.length > 1) {
        sheets.push(`--- Sheet: ${name} ---\n${csv}`);
      } else {
        sheets.push(csv);
      }
    }
  }
  return sheets.join('\n\n');
}

/**
 * Checks if a file is a supported type.
 * @param {File} file
 * @returns {boolean}
 */
export function isSupported(file) {
  const ext = getExt(file.name);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (['pdf'].includes(ext)) return true;
  if (['docx'].includes(ext)) return true;
  if (['xlsx', 'xls', 'ods'].includes(ext)) return true;
  if (file.type.startsWith('text/')) return true;
  return false;
}

/**
 * Extracts text content from a file.
 * @param {File} file
 * @returns {Promise<{name: string, content: string, size: number}>}
 * @throws {Error} If file type is not supported
 */
export async function extractText(file) {
  const ext = getExt(file.name);

  if (ext === 'pdf') {
    const buffer = await file.arrayBuffer();
    const content = await parsePdf(buffer);
    return { name: file.name, content, size: file.size };
  }

  if (ext === 'docx') {
    const buffer = await file.arrayBuffer();
    const content = await parseDocx(buffer);
    return { name: file.name, content, size: file.size };
  }

  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
    const content = await file.text();
    return { name: file.name, content, size: file.size };
  }

  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const content = await parseSpreadsheet(buffer);
    return { name: file.name, content, size: file.size };
  }

  throw new Error(`Unsupported file type: .${ext || 'unknown'}`);
}

/**
 * @returns {string}
 */
export function supportedTypesLabel() {
  return 'PDF, DOCX, XLSX, CSV, and text/code files';
}
