import React from 'react';
import { X, FileText } from 'lucide-react';
import type { UploadedFile } from '../types';

interface Props {
  files: UploadedFile[];
  onRemove: (id: string) => void;
}

export const FilePreview: React.FC<Props> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {files.map((file) => (
        <div key={file.id} className="group relative flex items-center gap-2 rounded-xl border border-cyan-100 bg-white/95 p-1.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-cyan-50">
            {file.type === 'image' && file.preview ? (
              <img src={file.preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <FileText size={16} className="text-cyan-700" />
            )}
          </div>
          <span className="max-w-[120px] truncate text-[11px] font-medium text-slate-600">{file.name}</span>
          <button
            onClick={() => onRemove(file.id)}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
};
