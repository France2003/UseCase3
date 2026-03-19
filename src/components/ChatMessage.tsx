import React from 'react';
import {
  User,
  FileText,
  ExternalLink,
  ChevronRight,
  Bot,
  LineChart,
  Link2,
  Table2,
} from 'lucide-react';
import type { Message, TableCell, TableData } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const GOOGLE_SHEET_REGEX = /https?:\/\/docs\.google\.com\/spreadsheets\/[^\s"'<>)]*/i;
const NOTEBOOK_REGEX = /https?:\/\/notebooklm\.google\.com\/[^\s"'<>)]*/i;
const APP_SCRIPT_REGEX = /https?:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9-_]+\/exec[^\s"'<>)]*/i;
const ORDER_CODE_REGEX = /\b(?:ORD|HD|INV|BILL|DH)\w*\b/i;
const DATE_REGEX = /\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/;
const TIME_REGEX = /\b\d{1,2}:\d{2}\b/;
const CHANNEL_PATTERN = '(?:GrabFood|ShopeeFood|Zalo|Facebook|Dine-in|Khách vãng lai|Khach vang lai)';

const trimTrailingPunctuation = (url: string) => url.replace(/[),.;]+$/g, '');

const extractLink = (text: string, regex: RegExp) => {
  if (typeof text !== 'string' || !text.trim()) return null;
  const matched = text.match(regex);
  if (!matched?.[0]) return null;
  return trimTrailingPunctuation(matched[0]);
};

const cellToString = (value: TableCell | unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const normalizeTableData = (rawData: Message['tableData']) => {
  if (!rawData) return null;

  if (Array.isArray(rawData)) {
    if (rawData.length === 0) return null;

    const first = rawData[0] as unknown;

    if (Array.isArray(first)) {
      const rows = (rawData as unknown[]).map(row =>
        Array.isArray(row) ? row.map(cell => cellToString(cell)) : []
      );
      const headerCount = rows[0]?.length || 0;
      const headers = Array.from({ length: headerCount }, (_, index) => `Cột ${index + 1}`);
      return { headers, rows };
    }

    const records = rawData as Record<string, unknown>[];
    const headerSet = new Set<string>();
    records.forEach(record => {
      Object.keys(record || {}).forEach(key => headerSet.add(key));
    });
    const headers = Array.from(headerSet);
    const rows = records.map(record => headers.map(header => cellToString(record?.[header])));
    return headers.length > 0 ? { headers, rows } : null;
  }

  const objectData = rawData as TableData & {
    columns?: string[];
    rows?: unknown[];
  };

  if (Array.isArray(objectData.headers) && Array.isArray(objectData.rows)) {
    const headers = objectData.headers.map(item => String(item));
    const rows = objectData.rows.map(row =>
      Array.isArray(row) ? row.map(cell => cellToString(cell)) : headers.map(() => '')
    );
    return { headers, rows };
  }

  if (Array.isArray(objectData.columns) && Array.isArray(objectData.rows)) {
    const headers = objectData.columns.map(item => String(item));
    const rows = objectData.rows.map(row =>
      Array.isArray(row) ? row.map(cell => cellToString(cell)) : headers.map(() => '')
    );
    return { headers, rows };
  }

  return null;
};

const looksLikeDatasetPayload = (text: string) => {
  if (typeof text !== 'string') return false;
  const normalized = text.trim();
  if (normalized.length < 140) return false;

  const commaCount = (normalized.match(/,/g) || []).length;
  const numberCount = (normalized.match(/\b\d+\b/g) || []).length;
  const hasOrderCode = ORDER_CODE_REGEX.test(normalized);
  const hasDate = DATE_REGEX.test(normalized);
  const hasTime = TIME_REGEX.test(normalized);
  const hasDatasetKeywords =
    /mã đơn|ngày|khung giờ|kênh bán|doanh thu|lợi nhuận|số lượng|đơn giá|giá vốn|tên món/i.test(normalized);

  if (commaCount >= 12 && (hasOrderCode || hasDatasetKeywords)) return true;
  return hasOrderCode && hasDate && hasTime && numberCount >= 10;
};

const parseWhitespaceDatasetFromText = (text: string): TableData | null => {
  if (typeof text !== 'string' || !ORDER_CODE_REGEX.test(text)) return null;

  const normalized = text.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\t/g, ' ').trim();
  if (!normalized) return null;

  const firstRecordIndex = normalized.search(ORDER_CODE_REGEX);
  if (firstRecordIndex < 0) return null;

  const body = normalized.slice(firstRecordIndex).trim();
  const rowRegex = new RegExp(
    `(\\b(?:ORD|HD|INV|BILL|DH)\\w*\\b)\\s+` +
      `(\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4})\\s+` +
      `(\\d{1,2}:\\d{2})\\s+` +
      `(.+?)\\s+` +
      `(${CHANNEL_PATTERN})\\s+` +
      `(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)` +
      `(?=\\s+(?:ORD|HD|INV|BILL|DH)\\w*\\b|$)`,
    'gi'
  );

  const rows: string[][] = [];
  let match: RegExpExecArray | null = rowRegex.exec(body);
  while (match && rows.length < 200) {
    rows.push([
      match[1],
      match[2],
      match[3],
      match[4].trim(),
      match[5],
      match[6],
      match[7],
      match[8],
      match[9],
    ]);
    match = rowRegex.exec(body);
  }

  if (rows.length === 0) return null;
  return {
    headers: ['Mã Đơn', 'Ngày', 'Khung Giờ', 'Tên Món', 'Kênh Bán', 'Số Lượng', 'Đơn Giá', 'Giá Vốn', 'Lợi Nhuận'],
    rows,
  };
};

const parseLooseCsvFromText = (text: string) => {
  if (typeof text !== 'string') return null;

  const cleanCell = (value: string) => value.replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim();
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return null;

  const prepared = normalized.replace(/\.\s*(?=(?:ORD|HD|INV|BILL|DH)\w*)/gi, ',');
  const tokens = prepared.includes(',')
    ? prepared
        .split(',')
        .map(cleanCell)
        .filter(Boolean)
    : [];

  const firstRecordIndex = tokens.findIndex(token => /^(ORD|HD|INV|BILL|DH)\w*/i.test(token));
  if (firstRecordIndex > 1) {
    const headers = tokens.slice(0, firstRecordIndex);
    if (headers.length >= 3) {
      const rows: string[][] = [];
      const values = tokens.slice(firstRecordIndex);
      for (let index = 0; index + headers.length <= values.length && rows.length < 200; index += headers.length) {
        rows.push(values.slice(index, index + headers.length));
      }

      if (rows.length > 0) return { headers, rows };
    }
  }

  return parseWhitespaceDatasetFromText(normalized);
};

const normalizeForCompare = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const normalizeHeaderKey = (header: string) =>
  normalizeForCompare(header).replace(/[^a-z0-9]/g, '');

const getTableColumnClass = (header: string) => {
  const key = normalizeHeaderKey(header);

  if (key.includes('madon') || key.includes('order') || key.includes('id')) {
    return 'w-[120px]';
  }
  if (key.includes('ngay') || key.includes('date')) {
    return 'w-[110px]';
  }
  if (key.includes('khunggio') || key.includes('thoigian') || key.includes('time')) {
    return 'w-[110px]';
  }
  if (key.includes('tenmon') || key.includes('mon') || key.includes('dish')) {
    return 'w-[180px]';
  }
  if (key.includes('kenhban') || key.includes('channel')) {
    return 'w-[130px]';
  }
  if (key.includes('soluong') || key.includes('qty') || key.includes('quantity')) {
    return 'w-[95px] text-right';
  }
  if (
    key.includes('dongia') ||
    key.includes('giavon') ||
    key.includes('loinhuan') ||
    key.includes('doanhthu') ||
    key.includes('revenue') ||
    key.includes('profit')
  ) {
    return 'w-[120px] text-right';
  }

  return 'min-w-[120px]';
};

export const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.type === 'user';
  const trimmedContent = typeof message.content === 'string' ? message.content.trim() : '';

  const contentSheetUrl = extractLink(trimmedContent, GOOGLE_SHEET_REGEX);
  const contentNotebookUrl = extractLink(trimmedContent, NOTEBOOK_REGEX);
  const contentAppScriptUrl = extractLink(trimmedContent, APP_SCRIPT_REGEX);

  const directSheetUrl = contentSheetUrl && trimmedContent === contentSheetUrl ? contentSheetUrl : null;
  const directNotebookUrl = contentNotebookUrl && trimmedContent === contentNotebookUrl ? contentNotebookUrl : null;
  const directAppScriptUrl = contentAppScriptUrl && trimmedContent === contentAppScriptUrl ? contentAppScriptUrl : null;

  const sheetUrl = message.sheetLink || contentSheetUrl || null;
  const appScriptUrl = message.appScriptUrl || contentAppScriptUrl || null;
  const notebookUrl = message.notebookLink || contentNotebookUrl || null;
  const reportUrl = sheetUrl || appScriptUrl || notebookUrl;
  const isDirectReportLink = Boolean(directSheetUrl || directNotebookUrl || directAppScriptUrl);

  const tableData = normalizeTableData(message.tableData);
  const parsedTableFromContent = tableData ? null : parseLooseCsvFromText(message.content);
  const outputTableData = isUser ? null : tableData || parsedTableFromContent;
  const inputTableData = isUser ? parsedTableFromContent : null;
  const hasOutputTable = !isUser && Boolean(outputTableData);
  const isLargeDatasetInput = isUser && (Boolean(inputTableData) || looksLikeDatasetPayload(message.content));
  const shouldHideRawDatasetText = !isUser && Boolean(outputTableData) && looksLikeDatasetPayload(message.content);

  return (
    <div className={`mb-7 flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex items-end gap-3 ${
          isUser
            ? 'max-w-[92%] md:max-w-[82%] flex-row-reverse'
            : hasOutputTable
              ? 'max-w-[99%] md:max-w-[97%] lg:max-w-[95%] flex-row'
              : 'max-w-[96%] md:max-w-[90%] lg:max-w-[84%] flex-row'
        }`}
      >
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
            isUser
              ? 'border-cyan-700/40 bg-gradient-to-br from-cyan-500 to-teal-600 text-white'
              : 'border-cyan-100 bg-white text-cyan-700'
          }`}
        >
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>

        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div
            className={`rounded-[20px] px-5 py-3 text-[15px] leading-relaxed shadow-sm ${
              isUser
                ? 'rounded-br-none bg-gradient-to-br from-cyan-500 to-teal-600 text-white'
                : 'rounded-bl-none border border-cyan-100 bg-white/95 text-slate-700'
            }`}
          >
            <div className={`markdown-content ${isUser ? 'text-white' : 'text-slate-700'}`}>
              {!isUser && isDirectReportLink ? (
                <div className="min-w-[270px] max-w-[460px] py-1">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
                      <LineChart size={13} />
                      Báo cáo doanh thu chuyên sâu
                    </div>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                      TRỰC TIẾP
                    </span>
                  </div>

                  <a
                    href={reportUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-cyan-50 p-4 transition-all hover:border-cyan-300 hover:shadow-lg"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 transition-colors group-hover:bg-cyan-600 group-hover:text-white">
                      <Link2 size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-cyan-800">
                        {sheetUrl ? 'Mở bảng tính Google' : appScriptUrl ? 'Mở kết quả App Script' : 'Mở báo cáo chi tiết'}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        {sheetUrl
                          ? 'Bảng tính phân tích theo thời gian thực'
                          : appScriptUrl
                            ? 'Nhấn để mở endpoint ghi dữ liệu lên Google Sheet'
                            : 'Báo cáo chi tiết đã sẵn sàng'}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-cyan-700 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              ) : isLargeDatasetInput ? (
                <div className="min-w-[280px] max-w-[760px] py-1">
                  <p className="text-sm font-extrabold text-white">Đã gửi dữ liệu đầu vào dạng bảng</p>
                  <p className="mt-1 text-xs font-medium text-white/90">
                    Hệ thống sẽ dùng dữ liệu này để chạy workflow và trả kết quả phân tích ở tin nhắn tiếp theo.
                  </p>

                  {inputTableData && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-white/35 bg-white/10">
                      <table className="min-w-full border-collapse text-[12px]">
                        <thead className="bg-white/20 text-white">
                          <tr>
                            {inputTableData.headers.map(header => (
                              <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-bold">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inputTableData.rows.map((row, rowIndex) => (
                            <tr key={`input-row-${rowIndex}`} className="border-b border-white/20">
                              {row.map((cell, cellIndex) => (
                                <td key={`input-cell-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-3 py-2 text-white/95">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <details className="mt-2 rounded-xl border border-white/35 bg-white/10 p-2">
                    <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.12em] text-white/95">
                      Xem dữ liệu gốc
                    </summary>
                    <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-white/90">
                      {message.content}
                    </p>
                  </details>
                </div>
              ) : shouldHideRawDatasetText ? (
                <p className="text-sm font-semibold text-slate-600">Kết quả từ workflow đã được hiển thị trong bảng bên dưới.</p>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => {
                      void node;
                      return <p className="mb-2 last:mb-0" {...props} />;
                    },
                    h1: ({ node, ...props }) => {
                      void node;
                      return <h1 className="mb-2 border-b border-cyan-200 pb-1 text-xl font-bold" {...props} />;
                    },
                    h2: ({ node, ...props }) => {
                      void node;
                      return <h2 className="mb-2 mt-3 border-l-4 border-cyan-500 pl-2 text-lg font-bold" {...props} />;
                    },
                    ul: ({ node, ...props }) => {
                      void node;
                      return <ul className="mb-2 ml-4 list-disc space-y-1" {...props} />;
                    },
                    ol: ({ node, ...props }) => {
                      void node;
                      return <ol className="mb-2 ml-4 list-decimal space-y-1" {...props} />;
                    },
                    li: ({ node, ...props }) => {
                      void node;
                      return <li className="mb-1" {...props} />;
                    },
                    strong: ({ node, ...props }) => {
                      void node;
                      return <strong className={`font-extrabold ${isUser ? 'text-white' : 'text-cyan-800'}`} {...props} />;
                    },
                    code: ({ node, ...props }) => {
                      void node;
                      return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm text-pink-600" {...props} />;
                    },
                    table: ({ node, ...props }) => {
                      void node;
                      return (
                        <div className="my-3 overflow-x-auto rounded-xl border border-cyan-100 bg-white">
                          <table className="min-w-full table-fixed border-collapse text-xs md:text-sm" {...props} />
                        </div>
                      );
                    },
                    thead: ({ node, ...props }) => {
                      void node;
                      return <thead className="bg-cyan-50 text-cyan-800" {...props} />;
                    },
                    tbody: ({ node, ...props }) => {
                      void node;
                      return <tbody {...props} />;
                    },
                    tr: ({ node, ...props }) => {
                      void node;
                      return <tr className="border-b border-slate-100 odd:bg-white even:bg-slate-50/55" {...props} />;
                    },
                    th: ({ node, ...props }) => {
                      void node;
                      return <th className="px-3 py-2 text-left font-bold align-top" {...props} />;
                    },
                    td: ({ node, ...props }) => {
                      void node;
                      return <td className="px-3 py-2 align-top text-slate-700 whitespace-pre-wrap break-words" {...props} />;
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>

            {!isUser && outputTableData && (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
                <table className="min-w-[980px] w-full border-separate border-spacing-0 text-[15px] text-slate-700">
                  <thead className="bg-cyan-50/90 text-cyan-900">
                    <tr>
                      {outputTableData.headers.map(header => (
                        <th
                          key={header}
                          className={`border-b border-cyan-100 px-4 py-3 text-left text-[15px] font-extrabold align-top ${getTableColumnClass(header)}`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputTableData.rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className="border-b border-slate-200/80 odd:bg-white even:bg-slate-50/65">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`cell-${rowIndex}-${cellIndex}`}
                            className={`border-b border-slate-200/70 px-4 py-3 align-top whitespace-pre-wrap break-words leading-6 ${getTableColumnClass(
                              outputTableData.headers[cellIndex] || ''
                            )}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isUser && reportUrl && !isDirectReportLink && (
              <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-800">
                  {sheetUrl || appScriptUrl ? <Table2 size={16} /> : <LineChart size={16} />}
                  {sheetUrl
                    ? 'Bảng tính Google đã sẵn sàng'
                    : appScriptUrl
                      ? 'Đã ghi dữ liệu qua App Script'
                      : 'Báo cáo đã sẵn sàng'}
                </div>
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-cyan-500"
                >
                  {sheetUrl ? 'Mở bảng tính Google' : appScriptUrl ? 'Mở App Script' : 'Xem báo cáo'}
                  <ExternalLink size={13} />
                </a>
              </div>
            )}

            {!isUser && outputTableData && !sheetUrl && !appScriptUrl && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Chưa nhận link Google Sheet từ workflow. Dữ liệu đã được hiển thị dạng bảng ngay trong chat.
              </div>
            )}
            {message.files && message.files.length > 0 && (
              <div className="mt-3 space-y-2">
                {message.files.map(file => (
                  <div
                    key={file.id}
                    className={`rounded-xl border p-2 ${
                      isUser ? 'border-white/30 bg-white/15' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {file.type === 'image' && file.preview ? (
                      <img src={file.preview} alt="" className="mx-auto max-h-60 max-w-full rounded-lg object-contain" />
                    ) : (
                      <div className="flex items-center gap-2 p-1 text-sm font-semibold">
                        <FileText size={17} />
                        <span className="max-w-[160px] truncate">{file.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <span className="mt-1 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

