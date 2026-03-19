import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import type { UploadedFile } from '../types';

interface Props {
  onFilesUpload: (files: UploadedFile[]) => void;
}
export const FileUploader: React.FC<Props> = ({ onFilesUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newFiles: UploadedFile[] = filesArray.map(file => {
        const isImage = file.type.startsWith('image/');
        return {
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          type: (isImage ? 'image' : 'file') as 'image' | 'file',
          file: file,
          preview: isImage ? URL.createObjectURL(file) : undefined
        };
      });
      onFilesUpload(newFiles);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  return (
    <>
      <input
        type="file"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleChange}
        accept="image/*,.pdf,.docx,.txt,.csv,.xlsx,.xls"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="shrink-0 rounded-full border border-cyan-100 p-2.5 text-slate-500 transition-all hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
      >
        <Paperclip size={22} />
      </button>
    </>
  );
};
