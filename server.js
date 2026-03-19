import express from 'express';
import cors from 'cors';
import mammoth from 'mammoth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const app = express();
const PORT = Number(process.env.PORT || 3001);

const FLOWISE_API_URL =
  process.env.FLOWISE_API_URL ||
  'https://flowiseai.imagentu.cloud/api/v1/prediction/249f53fa-5a1c-4774-a864-037801287861';
const FLOWISE_API_KEY = process.env.FLOWISE_API_KEY || 'QZxfXVUigrt1Yg0YK_QRZaOpghctmxSctBk7Hx4u98E';
const API_TIMEOUT = Number(process.env.API_TIMEOUT_MS || 30 * 60 * 1000);

const DEFAULT_GOOGLE_SHEET_URL = (process.env.DEFAULT_GOOGLE_SHEET_URL || '').trim();
const DEFAULT_GOOGLE_SHEET_ID = (process.env.DEFAULT_GOOGLE_SHEET_ID || '').trim();
const DEFAULT_APPS_SCRIPT_URL = (process.env.DEFAULT_APPS_SCRIPT_URL || '').trim();

const SHEET_LINK_REGEX = /https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>]+/i;
const APP_SCRIPT_URL_REGEX = /https?:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9-_]+\/exec[^\s"'<>]*/i;
const SHEET_ID_REGEX = /(?:\/spreadsheets\/d\/|spreadsheetid["'\s:=]+)([a-zA-Z0-9-_]{20,})/i;
const GID_REGEX = /[#?&]gid=(\d+)/i;
const MAX_TABLE_ROWS = 200;
const DEFAULT_AUTO_ANALYSIS_REQUEST =
  'Tu dong phan tich du lieu tu tep tai len, tom tat insight chinh, bang du lieu chuan hoa va khuyen nghi hanh dong.';

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

function sanitizeText(text) {
  if (text === null || text === undefined) return '';

  let clean = String(text);
  clean = clean.replace(/"/g, "'");
  clean = clean.replace(/\r\n/g, '. ').replace(/\n/g, '. ').replace(/\r/g, '. ');
  clean = clean.replace(/[\x00-\x1F\x7F-\x9F\u2028\u2029]/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function asPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const deFenced = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  if (!(deFenced.startsWith('{') || deFenced.startsWith('['))) return null;

  try {
    return JSON.parse(deFenced);
  } catch {
    return null;
  }
}

function findFirstString(root, predicate) {
  const seen = new WeakSet();
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach(item => queue.push(item));
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string' && predicate(key, value)) {
        return value;
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function trimTrailingPunctuation(url) {
  return url.replace(/[),.;]+$/g, '');
}

function extractSheetLinkFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const matched = text.match(SHEET_LINK_REGEX);
  return matched?.[0] ? trimTrailingPunctuation(matched[0]) : null;
}

function extractAppScriptUrlFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const matched = text.match(APP_SCRIPT_URL_REGEX);
  return matched?.[0] ? trimTrailingPunctuation(matched[0]) : null;
}

function extractSpreadsheetIdFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = text.trim();
  const fromUrl = normalized.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/i);
  if (fromUrl?.[1]) return fromUrl[1];

  const fromGeneric = normalized.match(SHEET_ID_REGEX);
  if (fromGeneric?.[1]) return fromGeneric[1];

  if (/^[a-zA-Z0-9-_]{20,}$/.test(normalized)) return normalized;
  return null;
}

function extractGidFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const matched = text.match(GID_REGEX);
  return matched?.[1] || null;
}

function buildGoogleSheetLink(spreadsheetId, gid = null) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') return null;
  const id = spreadsheetId.trim();
  if (!id) return null;
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  return gid ? `${base}#gid=${gid}` : base;
}

function collectObjectCandidates(root) {
  const candidates = [];
  const seen = new WeakSet();
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);
    candidates.push(current);

    if (Array.isArray(current)) {
      current.forEach(item => {
        if (item && typeof item === 'object') queue.push(item);
        if (typeof item === 'string') {
          const parsed = safeJsonParse(item);
          if (parsed && typeof parsed === 'object') queue.push(parsed);
        }
      });
      continue;
    }

    Object.values(current).forEach(value => {
      if (value && typeof value === 'object') {
        queue.push(value);
        return;
      }
      if (typeof value === 'string') {
        const parsed = safeJsonParse(value);
        if (parsed && typeof parsed === 'object') queue.push(parsed);
      }
    });
  }

  return candidates;
}

function extractAssistantContent(candidates) {
  for (const candidate of candidates) {
    const choices = candidate?.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const content = choice?.message?.content || choice?.delta?.content || choice?.text;
        if (typeof content === 'string' && content.trim()) {
          return content.trim();
        }
      }
    }

    const directContent = candidate?.message?.content;
    if (typeof directContent === 'string' && directContent.trim()) {
      return directContent.trim();
    }
  }
  return null;
}

function extractSheetLink(payload, fallbackTexts = []) {
  const candidates = collectObjectCandidates(payload);
  const fallbackList = Array.isArray(fallbackTexts) ? fallbackTexts : [fallbackTexts];

  for (const candidate of candidates) {
    const keyBasedLink = findFirstString(candidate, (key, value) => {
      const lowered = key.toLowerCase();
      return (
        (lowered.includes('sheet') || lowered === 'link' || lowered === 'url') &&
        Boolean(extractSheetLinkFromText(value))
      );
    });
    const parsedLink = extractSheetLinkFromText(keyBasedLink);
    if (parsedLink) return parsedLink;
  }

  for (const candidate of candidates) {
    const anyStringContainingSheet = findFirstString(candidate, (_key, value) => Boolean(extractSheetLinkFromText(value)));
    const parsedLink = extractSheetLinkFromText(anyStringContainingSheet);
    if (parsedLink) return parsedLink;
  }

  for (const fallbackText of fallbackList) {
    const parsedLink = extractSheetLinkFromText(fallbackText);
    if (parsedLink) return parsedLink;
  }

  return null;
}

function resolveSheetLink(payload, fallbackTexts = []) {
  const directLink = extractSheetLink(payload, fallbackTexts);
  if (directLink) return directLink;

  const candidates = collectObjectCandidates(payload);
  const fallbackList = Array.isArray(fallbackTexts) ? fallbackTexts : [fallbackTexts];
  let detectedGid = null;

  for (const candidate of candidates) {
    const gidByKey = findFirstString(candidate, (key, value) => {
      const lowered = key.toLowerCase();
      if (!(lowered === 'gid' || lowered === 'sheetgid' || lowered === 'sheet_id' || lowered === 'sheetid')) {
        return false;
      }
      return /^\d+$/.test(String(value).trim());
    });
    if (gidByKey && /^\d+$/.test(gidByKey.trim())) {
      detectedGid = gidByKey.trim();
      break;
    }
  }

  if (!detectedGid) {
    for (const candidate of candidates) {
      const gidFromAnyString = findFirstString(candidate, (_key, value) => Boolean(extractGidFromText(value)));
      const parsedGid = extractGidFromText(gidFromAnyString);
      if (parsedGid) {
        detectedGid = parsedGid;
        break;
      }
    }
  }

  for (const candidate of candidates) {
    const spreadsheetIdByKey = findFirstString(candidate, (key, value) => {
      const lowered = key.toLowerCase();
      const keyMatches =
        lowered === 'spreadsheetid' ||
        lowered === 'spreadsheet_id' ||
        lowered === 'spreadsheet' ||
        lowered === 'sheetid' ||
        lowered === 'sheet_id' ||
        lowered === 'docid' ||
        lowered.endsWith('spreadsheetid');

      if (!keyMatches) return false;
      return Boolean(extractSpreadsheetIdFromText(value));
    });

    const extractedId = extractSpreadsheetIdFromText(spreadsheetIdByKey);
    if (extractedId) return buildGoogleSheetLink(extractedId, detectedGid);
  }

  for (const candidate of candidates) {
    const idFromAnyString = findFirstString(candidate, (_key, value) => Boolean(extractSpreadsheetIdFromText(value)));
    const extractedId = extractSpreadsheetIdFromText(idFromAnyString);
    if (extractedId) return buildGoogleSheetLink(extractedId, detectedGid);
  }

  for (const fallbackText of fallbackList) {
    const extractedId = extractSpreadsheetIdFromText(fallbackText);
    if (extractedId) {
      const gid = detectedGid || extractGidFromText(fallbackText);
      return buildGoogleSheetLink(extractedId, gid);
    }
  }

  return DEFAULT_GOOGLE_SHEET_URL || buildGoogleSheetLink(DEFAULT_GOOGLE_SHEET_ID) || null;
}

function resolveAppScriptUrl(payload, fallbackTexts = []) {
  const candidates = collectObjectCandidates(payload);
  const fallbackList = Array.isArray(fallbackTexts) ? fallbackTexts : [fallbackTexts];

  for (const candidate of candidates) {
    const appScriptByKey = findFirstString(candidate, (key, value) => {
      const lowered = key.toLowerCase();
      const keyMatches =
        lowered.includes('appscript') ||
        lowered.includes('apps_script') ||
        lowered.includes('script_url') ||
        lowered.includes('webapp') ||
        lowered.includes('http_url');
      if (!keyMatches) return false;
      return Boolean(extractAppScriptUrlFromText(value));
    });
    const parsed = extractAppScriptUrlFromText(appScriptByKey);
    if (parsed) return parsed;
  }

  for (const candidate of candidates) {
    const anyString = findFirstString(candidate, (_key, value) => Boolean(extractAppScriptUrlFromText(value)));
    const parsed = extractAppScriptUrlFromText(anyString);
    if (parsed) return parsed;
  }

  for (const fallbackText of fallbackList) {
    const parsed = extractAppScriptUrlFromText(fallbackText);
    if (parsed) return parsed;
  }

  return DEFAULT_APPS_SCRIPT_URL || null;
}

function normalizeRecordsToTable(records) {
  if (!Array.isArray(records) || records.length === 0) return null;

  const headerSet = new Set();
  records.forEach(record => {
    if (asPlainObject(record)) {
      Object.keys(record).forEach(key => headerSet.add(key));
    }
  });

  const headers = Array.from(headerSet);
  if (headers.length === 0) return null;

  const rows = records.slice(0, MAX_TABLE_ROWS).map(record =>
    headers.map(header => {
      if (!asPlainObject(record)) return '';
      const value = record[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
  );

  return { headers, rows };
}

function normalizeTableCandidate(candidate) {
  if (!candidate) return null;

  if (Array.isArray(candidate)) {
    if (candidate.length === 0) return null;

    if (Array.isArray(candidate[0])) {
      const rows = candidate.slice(0, MAX_TABLE_ROWS).map(row =>
        Array.isArray(row) ? row.map(cell => (cell === null || cell === undefined ? '' : String(cell))) : []
      );
      const columnCount = rows[0]?.length || 0;
      const headers = Array.from({ length: columnCount }, (_, index) => `Cột ${index + 1}`);
      return { headers, rows };
    }

    return normalizeRecordsToTable(candidate);
  }

  if (!asPlainObject(candidate)) return null;

  if (Array.isArray(candidate.headers) && Array.isArray(candidate.rows)) {
    const headers = candidate.headers.map(item => String(item));
    const rows = candidate.rows.slice(0, MAX_TABLE_ROWS).map(row =>
      Array.isArray(row) ? row.map(cell => (cell === null || cell === undefined ? '' : String(cell))) : []
    );
    return { headers, rows };
  }

  if (Array.isArray(candidate.columns) && Array.isArray(candidate.rows)) {
    const headers = candidate.columns.map(item => String(item));
    const rows = candidate.rows.slice(0, MAX_TABLE_ROWS).map(row =>
      Array.isArray(row) ? row.map(cell => (cell === null || cell === undefined ? '' : String(cell))) : []
    );
    return { headers, rows };
  }

  if (Array.isArray(candidate.data)) {
    return normalizeTableCandidate(candidate.data);
  }

  return null;
}

function parseMarkdownTable(text) {
  if (typeof text !== 'string' || !text.includes('|')) return null;

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length - 2; i += 1) {
    const headerLine = lines[i];
    const dividerLine = lines[i + 1];
    if (!headerLine.includes('|')) continue;
    if (!/^\|?[\s:\-|]+\|[\s:\-|]*$/.test(dividerLine)) continue;

    const parseLine = line =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());

    const headers = parseLine(headerLine).filter(Boolean);
    if (headers.length === 0) continue;

    const rows = [];
    for (let r = i + 2; r < lines.length && rows.length < MAX_TABLE_ROWS; r += 1) {
      const rowLine = lines[r];
      if (!rowLine.includes('|')) break;
      const cells = parseLine(rowLine);
      if (cells.length === 0) continue;
      rows.push(cells);
    }

    if (rows.length > 0) return { headers, rows };
  }

  return null;
}

function parseLooseCsvTable(text) {
  if (typeof text !== 'string' || !text.includes(',')) return null;

  const cleanCell = cell => String(cell || '').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim();
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) return null;

  const multilineRows = normalizedText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.includes(','))
    .map(line => line.split(',').map(cleanCell).filter(Boolean))
    .filter(row => row.length >= 2);

  if (multilineRows.length >= 2) {
    const headers = multilineRows[0];
    if (headers.length >= 3) {
      const rows = multilineRows
        .slice(1, MAX_TABLE_ROWS + 1)
        .map(row => (row.length >= headers.length ? row.slice(0, headers.length) : [...row, ...Array(headers.length - row.length).fill('')]));
      if (rows.length > 0) return { headers, rows };
    }
  }

  const prepared = normalizedText.replace(/\.\s*(?=(?:ORD|HD|INV|BILL|DH)\w*)/gi, ',');
  const tokens = prepared
    .split(',')
    .map(cleanCell)
    .filter(Boolean);

  const firstRecordIndex = tokens.findIndex(token => /^(ORD|HD|INV|BILL|DH)\w*/i.test(token));
  if (firstRecordIndex <= 1) return null;

  const headers = tokens.slice(0, firstRecordIndex);
  if (headers.length < 3) return null;

  const values = tokens.slice(firstRecordIndex);
  const rows = [];
  for (let i = 0; i + headers.length <= values.length && rows.length < MAX_TABLE_ROWS; i += headers.length) {
    rows.push(values.slice(i, i + headers.length));
  }

  return rows.length > 0 ? { headers, rows } : null;
}

function collectTableCandidates(payload) {
  const candidates = [];
  if (!payload || typeof payload !== 'object') return candidates;

  const seen = new WeakSet();
  const queue = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach(item => queue.push(item));
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const lowered = key.toLowerCase();
      if (
        lowered === 'table' ||
        lowered === 'tabledata' ||
        lowered === 'sheetdata' ||
        lowered === 'rows' ||
        lowered === 'records' ||
        lowered.endsWith('_table')
      ) {
        candidates.push(value);
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return candidates;
}

function extractTableData(payload, fallbackTexts = []) {
  const objectCandidates = collectObjectCandidates(payload);
  for (const objectCandidate of objectCandidates) {
    const tableCandidates = collectTableCandidates(objectCandidate);
    for (const tableCandidate of tableCandidates) {
      const table = normalizeTableCandidate(tableCandidate);
      if (table && table.headers.length > 0 && table.rows.length > 0) return table;
    }
  }

  const textCandidates = Array.isArray(fallbackTexts) ? fallbackTexts : [fallbackTexts];
  for (const textCandidate of textCandidates) {
    if (typeof textCandidate !== 'string' || !textCandidate.trim()) continue;
    const markdownTable = parseMarkdownTable(textCandidate);
    if (markdownTable) return markdownTable;

    const csvTable = parseLooseCsvTable(textCandidate);
    if (csvTable) return csvTable;
  }

  return null;
}

function isLikelyPureUrl(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/i.test(trimmed);
}

function resolveText(rawFlowiseData, normalizedData) {
  const directText = rawFlowiseData?.text || rawFlowiseData?.answer || rawFlowiseData?.output || rawFlowiseData?.message;
  if (typeof directText === 'string' && directText.trim()) {
    const looksLikeJson = Boolean(safeJsonParse(directText));
    if (!looksLikeJson) return directText;
  }

  const objectCandidates = collectObjectCandidates(normalizedData);
  const assistantContent = extractAssistantContent(objectCandidates);
  if (assistantContent) return assistantContent;

  for (const objectCandidate of objectCandidates) {
    const nestedText = findFirstString(objectCandidate, (key, value) => {
      const lowered = key.toLowerCase();
      if (
        ![
          'text',
          'answer',
          'summary',
          'message',
          'output',
          'result',
          'analysis',
          'content',
          'chatreply',
          'chat_reply',
          'chat_reply_ai',
          'final_answer',
          'finalanswer',
          'analysis_result',
          'result_text',
          'bao_cao_ai',
          'baocaoai',
          'report',
          'report_text',
        ].includes(lowered)
      ) {
        return false;
      }
      return value.trim().length > 0 && !Boolean(safeJsonParse(value));
    });
    if (nestedText) return nestedText;
  }

  for (const objectCandidate of objectCandidates) {
    const anyReadableText = findFirstString(objectCandidate, (_key, value) => {
      if (typeof value !== 'string') return false;
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (trimmed.length < 12) return false;
      if (isLikelyPureUrl(trimmed)) return false;
      if (Boolean(safeJsonParse(trimmed))) return false;
      return true;
    });
    if (anyReadableText) return anyReadableText;
  }

  return 'Workflow chưa trả nội dung phân tích.';
}

function normalizeFlowiseData(rawData) {
  const safeRaw = asPlainObject(rawData) ? rawData : { text: String(rawData ?? '') };
  const fromText = safeJsonParse(safeRaw.text);
  const fromAnswer = safeJsonParse(safeRaw.answer);

  return {
    ...safeRaw,
    ...(asPlainObject(fromText) ? fromText : {}),
    ...(asPlainObject(fromAnswer) ? fromAnswer : {}),
  };
}

function getUploadExtension(upload) {
  const name = typeof upload?.name === 'string' ? upload.name.toLowerCase().trim() : '';
  if (!name.includes('.')) return '';
  return name.slice(name.lastIndexOf('.') + 1);
}

function isSpreadsheetUpload(upload) {
  const mime = typeof upload?.mime === 'string' ? upload.mime.toLowerCase() : '';
  const ext = getUploadExtension(upload);

  if (['csv', 'xlsx', 'xls'].includes(ext)) return true;
  if (mime.includes('spreadsheetml')) return true;
  if (mime.includes('ms-excel')) return true;
  if (mime.includes('csv')) return true;
  return false;
}

function normalizeMatrixToTable(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return null;

  const cleanedRows = matrix
    .map(row => {
      const source = Array.isArray(row) ? row : [row];
      const cells = source.map(cell => {
        if (cell === null || cell === undefined) return '';
        return String(cell).trim();
      });

      let lastIndex = cells.length - 1;
      while (lastIndex >= 0 && !cells[lastIndex]) lastIndex -= 1;
      return lastIndex >= 0 ? cells.slice(0, lastIndex + 1) : [];
    })
    .filter(row => row.length > 0 && row.some(cell => cell !== ''));

  if (cleanedRows.length === 0) return null;

  const columnCount = cleanedRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return null;

  let headers = cleanedRows[0];
  let dataRows = cleanedRows.slice(1);
  const headerLooksLikeText = headers.some(cell => /[A-Za-zÀ-ỹ]/.test(cell));

  if (!headerLooksLikeText || dataRows.length === 0) {
    headers = Array.from({ length: columnCount }, (_, index) => `Cột ${index + 1}`);
    dataRows = cleanedRows;
  }

  const normalizedHeaders = Array.from({ length: columnCount }, (_, index) => {
    const value = headers[index];
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || `Cột ${index + 1}`;
  });

  const rows = dataRows.slice(0, MAX_TABLE_ROWS).map(row =>
    Array.from({ length: columnCount }, (_, index) => {
      const value = row[index];
      return value === undefined || value === null ? '' : String(value).trim();
    })
  );

  return rows.length > 0 ? { headers: normalizedHeaders, rows } : null;
}

function parseSpreadsheetTable(buffer) {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      raw: false,
      dense: true,
      cellDates: false,
    });

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets?.[sheetName];
      if (!sheet) continue;

      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
      });

      const table = normalizeMatrixToTable(matrix);
      if (table) return table;
    }

    return null;
  } catch (error) {
    console.error('Spreadsheet parsing error:', error?.message || error);
    return null;
  }
}

function tableDataToPromptText(tableData) {
  if (!tableData?.headers?.length || !Array.isArray(tableData.rows) || tableData.rows.length === 0) return '';

  const headerText = tableData.headers.join(', ');
  const rowText = tableData.rows
    .slice(0, Math.min(80, MAX_TABLE_ROWS))
    .map(row => (Array.isArray(row) ? row.join(', ') : ''))
    .filter(Boolean)
    .join(' | ');

  return sanitizeText(`${headerText}. ${rowText}`);
}

async function extractTextFromUpload(upload) {
  if (!upload?.data) return { text: '', tableData: null };

  try {
    const base64Content = upload.data.includes(',') ? upload.data.split(',')[1] : upload.data;
    const buffer = Buffer.from(base64Content, 'base64');
    let rawText = '';
    let tableData = null;

    if (isSpreadsheetUpload(upload)) {
      tableData = parseSpreadsheetTable(buffer);
      rawText = tableDataToPromptText(tableData);
    } else if (upload.mime === 'application/pdf') {
      try {
        const data = await pdfParse(buffer);
        rawText = data.text;
      } catch {
        return { text: '', tableData: null };
      }
    } else if (upload.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } catch {
        return { text: '', tableData: null };
      }
    } else if (upload.mime === 'text/plain') {
      rawText = buffer.toString('utf-8');
    }

    return {
      text: sanitizeText(rawText),
      tableData,
    };
  } catch (error) {
    console.error('Upload parsing error:', error?.message || error);
    return { text: '', tableData: null };
  }
}

function getErrorDetails(error) {
  const cause = error?.cause || {};
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    code: cause.code || error?.code || null,
    errno: cause.errno || error?.errno || null,
    syscall: cause.syscall || error?.syscall || null,
    address: cause.address || error?.address || null,
    port: cause.port || error?.port || null,
  };
}

function resolveFlowiseNetworkMessage(details) {
  if (details?.name === 'AbortError' || details?.code === 'ETIMEDOUT') {
    return {
      status: 504,
      error: 'Flowise quá thời gian chờ',
      text: 'Flowise phản hồi quá lâu. Vui lòng thử lại sau.',
    };
  }

  if (details?.code === 'ENOTFOUND') {
    return {
      status: 502,
      error: 'Lỗi DNS Flowise',
      text: 'Không phân giải được domain Flowise. Vui lòng kiểm tra DNS hoặc địa chỉ điểm cuối.',
    };
  }

  if (details?.code === 'ECONNREFUSED') {
    return {
      status: 502,
      error: 'Flowise từ chối kết nối',
      text: 'Flowise từ chối kết nối. Vui lòng kiểm tra dịch vụ đang chạy và đã mở cổng.',
    };
  }

  if (details?.code === 'EACCES') {
    return {
      status: 502,
      error: 'Kết nối ra Flowise bị chặn',
      text: 'Kết nối tới Flowise bị chặn bởi môi trường chạy (tường lửa/chính sách mạng).',
    };
  }

  return {
    status: 502,
    error: 'Không thể kết nối Flowise',
    text: 'Không thể kết nối tới Flowise. Vui lòng kiểm tra mạng và điểm cuối.',
  };
}

app.get('/', (_req, res) =>
  res.json({
    status: 'dang_hoat_dong',
    message: 'Backend phân tích quyết định đang hoạt động',
  })
);

app.post('/api/flowise', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      question,
      sessionId,
      uploads,
      ...passthroughPayload
    } = req.body || {};

    const shortSessionId = sessionId?.slice?.(-6) || 'N/A';
    console.log(`\n[YÊU CẦU] phiên=${shortSessionId}`);

    const hasUploadRequest = Array.isArray(uploads) && uploads.length > 0;
    let fileContext = '';
    let hasFiles = false;
    let uploadedTableData = null;
    let uploadedFileNames = [];

    if (hasUploadRequest) {
      console.log(`Đang xử lý ${uploads.length} tệp tải lên...`);
      for (const upload of uploads) {
        const parsedUpload = await extractTextFromUpload(upload);
        const text = parsedUpload?.text || '';
        const safeName = sanitizeText(upload.name || 'tep');
        if (safeName) uploadedFileNames.push(safeName);

        if (!uploadedTableData && parsedUpload?.tableData) {
          uploadedTableData = parsedUpload.tableData;
          hasFiles = true;
        }

        if (!text) continue;

        fileContext += ` [BAT DAU FILE: ${safeName}] ${text} [KET THUC FILE] `;
        hasFiles = true;
      }
    }

    const safeQuestion = sanitizeText(question || '');
    let finalQuestion = safeQuestion;
    if (hasUploadRequest) {
      const effectiveQuestion = safeQuestion || DEFAULT_AUTO_ANALYSIS_REQUEST;
      if (hasFiles && fileContext.trim()) {
        finalQuestion = `DU LIEU TAI LIEU: ${fileContext} | YEU CAU: ${effectiveQuestion}`;
      } else {
        const nameContext = uploadedFileNames.join(', ') || 'tep khong xac dinh';
        finalQuestion = `TEP TAI LEN: ${nameContext} | YEU CAU: ${effectiveQuestion}`;
      }
    }

    if (!finalQuestion) {
      finalQuestion = DEFAULT_AUTO_ANALYSIS_REQUEST;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const flowiseUrl = `${FLOWISE_API_URL}?apikey=${FLOWISE_API_KEY}`;

    let flowiseResponse;
    try {
      flowiseResponse = await fetch(flowiseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: finalQuestion,
          chatId: sessionId,
          ...passthroughPayload,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const details = getErrorDetails(error);
      const fail = resolveFlowiseNetworkMessage(details);
      console.error('[Lỗi gọi Flowise]', { url: FLOWISE_API_URL, ...details });
      return res.status(fail.status).json({
        error: fail.error,
        text: fail.text,
        details,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!flowiseResponse.ok) {
      const errorText = await flowiseResponse.text();
      console.error(`Flowise trả lỗi ${flowiseResponse.status}:`, errorText.slice(0, 240));

      return res.status(flowiseResponse.status).json({
        error: `Flowise API lỗi ${flowiseResponse.status}`,
        text: 'Hệ thống đang bận. Vui lòng thử lại sau.',
      });
    }

    const rawText = await flowiseResponse.text();
    const rawData = safeJsonParse(rawText) || { text: rawText };
    const normalizedData = normalizeFlowiseData(rawData);

    const responseText = resolveText(rawData, normalizedData);
    const fallbackTexts = [responseText].filter(text => typeof text === 'string' && text.trim());
    const sheetLink = resolveSheetLink(normalizedData, fallbackTexts);
    const appScriptUrl = resolveAppScriptUrl(normalizedData, fallbackTexts);
    const tableDataFromWorkflow = extractTableData(normalizedData, fallbackTexts);
    const tableData = tableDataFromWorkflow || uploadedTableData || null;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[THÀNH CÔNG] ${elapsed}s | bảng_tính=${sheetLink ? 'có' : 'không'} | bảng_dữ_liệu=${tableData ? 'có' : 'không'}`);

    return res.json({
      ...normalizedData,
      text: responseText,
      sheetLink,
      link_sheet: sheetLink,
      appScriptUrl,
      tableData,
      processedFiles: hasFiles && Array.isArray(uploads) ? uploads.map(file => file?.name).join(', ') : 'Không có',
    });
  } catch (error) {
    const details = getErrorDetails(error);
    console.error('[Lỗi máy chủ]', details);

    const isTimeout = details.name === 'AbortError' || details.code === 'ETIMEDOUT';
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Quá thời gian chờ' : 'Lỗi nội bộ',
      text: isTimeout ? 'Hệ thống xử lý quá lâu.' : 'Lỗi kết nối nội bộ.',
      details,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Máy chủ đang chạy tại http://localhost:${PORT}`);
});
