export type TableCell = string | number | boolean | null;

export interface TableData {
  headers: string[];
  rows: TableCell[][];
}

export interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  notebookLink?: string;
  sheetLink?: string | null;
  appScriptUrl?: string | null;
  tableData?: TableData | Record<string, unknown>[] | null;
  files?: UploadedFile[];
}

export interface UploadedFile {
  id: string;
  name: string;
  type: 'image' | 'file';
  file: File;
  preview?: string;
  // description?: string;
}

export interface ChatState {
  messages: Message[];
  uploadedFiles: UploadedFile[];
  isLoading: boolean;
}
