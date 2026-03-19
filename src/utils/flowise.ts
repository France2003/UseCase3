import type { TableData } from '../types';

const PROXY_API_URL = 'http://localhost:3001/api/flowise';

type FlowiseUploadPayload = Record<string, unknown>;

export interface FloWiseResponse {
  text?: string;
  answer?: string;
  sheetLink?: string;
  link_sheet?: string;
  sheet_url?: string;
  googleSheetUrl?: string;
  appScriptUrl?: string;
  app_script_url?: string;
  tableData?: TableData | Record<string, unknown>[];
  table?: TableData | Record<string, unknown>[];
  notebookLink?: string;
  link_notebook?: string;
  error?: string;
  [key: string]: unknown;
}

export const floWiseService = {
  async query(question: string, sessionId: string, uploads: FlowiseUploadPayload[] = []): Promise<FloWiseResponse> {
    try {
      const response = await fetch(PROXY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          sessionId,
          uploads: uploads || [],
        }),
      });

      const data = (await response.json()) as FloWiseResponse;

      if (!response.ok) {
        console.error('Lỗi API Flowise:', data);
        return {
          text: typeof data.text === 'string' ? data.text : 'Hệ thống không thể xử lý yêu cầu. Vui lòng thử lại sau.',
          error: typeof data.error === 'string' ? data.error : 'API Error',
        };
      }

      return data;
    } catch (error) {
      console.error('Lỗi khi gọi API Flowise:', error);
      return {
        text: 'Có lỗi xảy ra khi kết nối với hệ thống.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
