import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Hotel,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  WalletCards,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Message, TableData, UploadedFile } from '../types';
import type { Conversation } from '../utils/storageService';
import { ChatMessage } from './ChatMessage';
import { FileUploader } from './FileUploader';
import { FilePreview } from './FilePreview';
import { ConversationSidebar } from './ConversationSidebar';
import { storageService } from '../utils/storageService';
import { floWiseService } from '../utils/flowise';
import LogoImage from '../assets/images/logo.jpg';

const DEFAULT_CONVERSATION_TITLE = 'Phiên phân tích mới';
const DEFAULT_FILE_ONLY_PROMPT =
  'Tự động phân tích dữ liệu từ tệp tải lên, trả kết quả dạng bảng và kèm liên kết báo cáo nếu có.';
const DEFAULT_FILE_ONLY_MESSAGE = 'Đã gửi tệp để phân tích tự động.';
const INITIAL_BOT_MESSAGE =
  'Xin chào! Tôi là trợ lý trí tuệ quyết định cho ngành Khách sạn - Nhà hàng. Hãy gửi dữ liệu doanh thu, công suất phòng hoặc hiệu suất món ăn, tôi sẽ giúp bạn tìm cơ hội tăng lợi nhuận.';

const KPI_CARDS = [
  {
    label: 'Tăng trưởng doanh thu',
    value: '+18.4%',
    note: 'so với tuần trước',
    icon: TrendingUp,
    iconClass: 'bg-emerald-500/15 text-emerald-700',
    trendClass: 'text-emerald-600',
  },
  {
    label: 'Doanh thu trên phòng',
    value: '$76.2',
    note: 'chỉ số phòng khả dụng',
    icon: Hotel,
    iconClass: 'bg-cyan-500/15 text-cyan-700',
    trendClass: 'text-cyan-700',
  },
  {
    label: 'Biên lợi nhuận F&B',
    value: '+9.1%',
    note: 'mức cải thiện lợi nhuận',
    icon: UtensilsCrossed,
    iconClass: 'bg-amber-500/20 text-amber-700',
    trendClass: 'text-amber-700',
  },
  {
    label: 'Dự báo nhu cầu',
    value: '96 giờ',
    note: 'khung dự báo tiếp theo',
    icon: CalendarClock,
    iconClass: 'bg-indigo-500/15 text-indigo-700',
    trendClass: 'text-indigo-700',
  },
] as const;

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

const parseLooseCsvTable = (text: string): TableData | null => {
  if (typeof text !== 'string' || !text.includes(',')) return null;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return null;

  const cleanCell = (value: string) => value.replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim();
  const prepared = normalized.replace(/\.\s*(?=(?:ORD|HD|INV|BILL|DH)\w*)/gi, ',');
  const tokens = prepared
    .split(',')
    .map(cleanCell)
    .filter(Boolean);

  const firstRecordIndex = tokens.findIndex(token => /^(ORD|HD|INV|BILL|DH)\w*/i.test(token));
  if (firstRecordIndex <= 1) return null;

  const headers = tokens.slice(0, firstRecordIndex);
  if (headers.length < 3) return null;

  const rows: string[][] = [];
  const values = tokens.slice(firstRecordIndex);
  for (let index = 0; index + headers.length <= values.length && rows.length < 200; index += headers.length) {
    rows.push(values.slice(index, index + headers.length));
  }

  return rows.length > 0 ? { headers, rows } : null;
};

export const ChatBot: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', type: 'bot', content: INITIAL_BOT_MESSAGE, timestamp: new Date() },
  ]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedConversations = storageService.getAllConversations();
    setConversations(savedConversations);

    const savedCurrentId = storageService.getCurrentConversationId();
    if (savedCurrentId) {
      const selected = savedConversations.find(conversation => conversation.id === savedCurrentId);
      if (selected) {
        setCurrentConversationId(selected.id);
        setMessages(selected.messages);
        setHasUserSentMessage(selected.messages.some(message => message.type === 'user'));
        storageService.setCurrentConversationId(selected.id);
        return;
      }
    }

    if (savedConversations.length === 0) {
      const newConversation = storageService.createConversation(DEFAULT_CONVERSATION_TITLE, [
        { id: '1', type: 'bot', content: INITIAL_BOT_MESSAGE, timestamp: new Date() },
      ]);
      setConversations([newConversation]);
      setCurrentConversationId(newConversation.id);
      setMessages(newConversation.messages);
      setHasUserSentMessage(false);
      storageService.setCurrentConversationId(newConversation.id);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [inputValue]);

  const generateConversationTitle = (userMessage: string): string => {
    const maxLength = 50;
    const cleaned = userMessage.trim().slice(0, maxLength);
    return cleaned.length > 0 ? cleaned : DEFAULT_CONVERSATION_TITLE;
  };

  const handleNewConversation = () => {
    const newConversation = storageService.createConversation(DEFAULT_CONVERSATION_TITLE, [
      { id: '1', type: 'bot', content: INITIAL_BOT_MESSAGE, timestamp: new Date() },
    ]);
    setConversations(prev => [newConversation, ...prev]);
    handleSelectConversation(newConversation.id);
    setHasUserSentMessage(false);
  };

  const handleSelectConversation = (id: string) => {
    const conversation = storageService.getConversation(id);
    if (!conversation) return;

    setCurrentConversationId(id);
    setMessages(conversation.messages);
    setUploadedFiles([]);
    setInputValue('');
    storageService.setCurrentConversationId(id);
    setHasUserSentMessage(conversation.messages.some(message => message.type === 'user'));
  };

  const handleDeleteConversation = (id: string) => {
    storageService.deleteConversation(id);
    setConversations(prev => prev.filter(conversation => conversation.id !== id));

    if (currentConversationId !== id) return;

    const remaining = storageService.getAllConversations();
    if (remaining.length > 0) {
      handleSelectConversation(remaining[0].id);
    } else {
      handleNewConversation();
    }
  };

  const autoSaveConversation = (updatedMessages: Message[], userMessage?: string) => {
    if (!currentConversationId) return;

    const conversation = storageService.getConversation(currentConversationId);
    if (!conversation) return;

    let updatedTitle = conversation.title;
    if (updatedTitle === DEFAULT_CONVERSATION_TITLE && userMessage && !hasUserSentMessage) {
      updatedTitle = generateConversationTitle(userMessage);
      setHasUserSentMessage(true);
    }

    const updatedConversation: Conversation = {
      ...conversation,
      title: updatedTitle,
      messages: updatedMessages,
      updatedAt: new Date(),
    };

    storageService.saveConversation(updatedConversation);
    setConversations(storageService.getAllConversations());
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

  const handleSendMessage = async () => {
    if (!inputValue.trim() && uploadedFiles.length === 0) return;

    const trimmedInput = inputValue.trim();
    const currentFiles = [...uploadedFiles];
    const isFileOnlyRequest = !trimmedInput && currentFiles.length > 0;
    const apiQuestion = isFileOnlyRequest ? DEFAULT_FILE_ONLY_PROMPT : inputValue;
    const userInputContent = isFileOnlyRequest ? DEFAULT_FILE_ONLY_MESSAGE : inputValue;
    setIsLoading(true);
    setInputValue('');
    setUploadedFiles([]);

    try {
      const flowiseUploads = await Promise.all(
        currentFiles.map(async file => ({
          data: await fileToBase64(file.file),
          name: file.name,
          mime: file.file.type,
        }))
      );

      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: userInputContent,
        timestamp: new Date(),
        files: currentFiles.length > 0 ? currentFiles : undefined,
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      autoSaveConversation(newMessages, userInputContent);

      const response = await floWiseService.query(
        apiQuestion,
        currentConversationId || `session-${Date.now()}`,
        flowiseUploads
      );

      const sheetLink = pickString(
        response.sheetLink,
        response.link_sheet,
        response.sheet_url,
        response.googleSheetUrl
      );
      const appScriptUrl = pickString(response.appScriptUrl, response.app_script_url);
      const responseText = pickString(response.text, response.answer) || '';
      const tableData = response.tableData || response.table || parseLooseCsvTable(responseText) || null;

      const botContent = responseText.trim()
        ? responseText
        : tableData
          ? 'Workflow đã trả về dữ liệu dạng bảng.'
          : 'Workflow chưa trả nội dung phân tích. Vui lòng kiểm tra node trả lời trong Flowise.';

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: botContent,
        timestamp: new Date(),
        notebookLink: pickString(response.notebookLink, response.link_notebook),
        sheetLink: sheetLink || null,
        appScriptUrl: appScriptUrl || null,
        tableData,
      };

      const updatedMessages = [...newMessages, botMessage];
      setMessages(updatedMessages);
      autoSaveConversation(updatedMessages);
    } catch (error) {
      console.error('Lỗi khi gọi API:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: 'Xin lỗi, hệ thống phân tích đang quá tải. Vui lòng thử lại sau ít phút.',
        timestamp: new Date(),
      };
      const updatedMessages = [...messages, errorMessage];
      setMessages(updatedMessages);
      autoSaveConversation(updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateConversation = (id: string, patch: Partial<Conversation>) => {
    storageService.updateConversation(id, patch);
    setConversations(storageService.getAllConversations());
  };

  return (
    <div className="hospitality-dashboard-bg flex h-[100dvh] overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onUpdateConversation={handleUpdateConversation}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 px-3 pt-1 md:px-6 md:pt-2">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="hospitality-glass hospitality-hero rounded-[20px] px-3 py-2.5 md:px-4 md:py-2.5"
          >
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/70 bg-white/90 p-1.5 pr-2.5 shadow-sm">
                    <img src={LogoImage} alt="Logo" className="h-8 w-8 rounded-lg border border-cyan-100 object-cover" />
                    <div className="leading-tight">
                      <p className="text-[11px] font-extrabold text-slate-800">Trung tâm điều hành phân tích</p>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                        Nền tảng trí tuệ nhân tạo
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/80 bg-cyan-50/90 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-700">
                    <Sparkles size={12} /> Trí tuệ quyết định
                  </span>
                </div>

                <h1 className="mt-1.5 text-lg font-black leading-tight text-slate-900 md:text-xl">
                  Tối ưu Ngành Khách sạn - Nhà hàng
                </h1>
                <p className="mt-1 text-[13px] font-semibold text-slate-600">
                  Biến dữ liệu thành quyết định, tập trung vào hiệu quả vận hành và lợi nhuận.
                </p>

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    <Hotel size={12} className="text-cyan-700" /> Công suất phòng
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    <UtensilsCrossed size={12} className="text-amber-600" /> Biên lợi nhuận F&B
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    <ShieldCheck size={12} className="text-emerald-600" /> Khuyến nghị theo dữ liệu
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:w-[500px]">
                {KPI_CARDS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.06 }}
                      className="hospitality-kpi rounded-xl px-2.5 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {item.label}
                        </p>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-lg ${item.iconClass}`}>
                          <Icon size={11} />
                        </span>
                      </div>
                      <p className="mt-0.5 text-base font-black text-slate-900 md:text-lg">{item.value}</p>
                      <p className={`truncate text-[9px] font-semibold ${item.trendClass}`}>{item.note}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </header>

        <main className="scrollbar-thin relative z-10 flex-1 overflow-y-auto px-3 pb-1 pt-1 md:px-6 md:pb-2">
          <div className="hospitality-chat-shell relative h-full w-full min-h-0 overflow-x-hidden rounded-[22px] px-3 py-3 md:px-5 md:py-3">
            <div className="pointer-events-none absolute right-8 top-8 h-20 w-20 rounded-full bg-cyan-300/25 blur-2xl" />
            <div className="pointer-events-none absolute bottom-8 left-8 h-24 w-24 rounded-full bg-amber-300/20 blur-2xl" />

            {messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {isLoading && (
              <div className="mb-6 ml-2 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-white/90 p-4">
                <div className="flex gap-1.5 pt-2">
                  <span className="hospitality-pulse-dot h-2 w-2 rounded-full bg-cyan-500" />
                  <span className="hospitality-pulse-dot h-2 w-2 rounded-full bg-teal-500 [animation-delay:0.22s]" />
                  <span className="hospitality-pulse-dot h-2 w-2 rounded-full bg-amber-500 [animation-delay:0.44s]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">Hệ thống đang xử lý mô hình doanh thu...</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Gợi ý sẽ bao gồm dự báo nhu cầu, tối ưu giá và khung thời gian khuyến mãi.
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        <footer className="relative z-20 px-3 pb-2 md:px-6 md:pb-3">
          <div className="relative w-full">
            <div className="mb-1.5 px-2">
              <FilePreview files={uploadedFiles} onRemove={id => setUploadedFiles(files => files.filter(file => file.id !== id))} />
            </div>

            <div className="hospitality-input-shell flex items-end gap-2 rounded-[18px] px-2 py-1.5 md:px-2.5">
              <div className="mb-1 shrink-0">
                <FileUploader onFilesUpload={files => setUploadedFiles(prev => [...prev, ...files])} />
              </div>

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={event => setInputValue(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Vui lòng nhập câu hỏi..."
                className="max-h-24 min-h-[42px] flex-1 resize-none overflow-hidden border-none bg-transparent px-2 py-2 text-[14px] font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() && !uploadedFiles.length}
                className="group mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-900/20 transition-all hover:-translate-y-0.5 hover:shadow-cyan-700/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>

            <div className="mt-1.5 flex items-center justify-between px-3">
              <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 hospitality-pulse-dot" />
                Tín hiệu doanh thu trực tiếp
              </span>
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 md:inline-flex md:items-center md:gap-1">
                <WalletCards size={11} /> Không gian điều hành
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
