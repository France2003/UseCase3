import React, { useMemo, useState } from 'react';
import { Menu, X, Plus, Search, Pin, MessageSquare, Trash2, Sparkles } from 'lucide-react';
import { Reorder } from 'framer-motion';
import type { Conversation } from '../utils/storageService';

interface Props {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onUpdateConversation: (id: string, patch: Partial<Conversation>) => void;
}

export const ConversationSidebar: React.FC<Props> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onUpdateConversation,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    const data = search
      ? conversations.filter(
          conversation =>
            conversation.title.toLowerCase().includes(lower) ||
            conversation.messages.some(message => message.content.toLowerCase().includes(lower))
        )
      : conversations;

    return [...data].sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [search, conversations]);

  const formatDateTime = (date: Date) =>
    new Date(date).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });

  return (
    <>
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-72'
        } flex h-screen shrink-0 flex-col border-r border-white/10 bg-slate-950/90 text-slate-100 backdrop-blur-xl transition-all`}
      >
        <div className="flex h-24 items-center gap-2 border-b border-white/10 p-3">
          {!collapsed && (
            <button
              onClick={onNewConversation}
              className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-950/30 transition-all hover:brightness-110"
            >
              <Plus size={15} className="transition-transform group-hover:rotate-90" />
              Phiên phân tích mới
            </button>
          )}

          <button
            onClick={() => setCollapsed(value => !value)}
            className="rounded-lg border border-white/15 p-2 text-slate-300 transition-colors hover:bg-white/10"
          >
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>

        {!collapsed && (
          <div className="space-y-3 border-b border-white/10 p-3">
            <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 p-3">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
                <Sparkles size={12} /> Trợ lý trí tuệ nhân tạo
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-200/90">
                Theo dõi các phiên phân tích doanh thu và khuyến nghị vận hành theo thời gian thực.
              </p>
            </div>

            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Tìm phiên phân tích..."
                className="w-full rounded-xl border border-white/15 bg-slate-900/90 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/70"
              />
            </div>
          </div>
        )}

        <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
          <Reorder.Group axis="y" values={filtered} onReorder={() => {}} className="space-y-1.5">
            {filtered.map(conversation => {
              const active = currentConversationId === conversation.id;
              return (
                <Reorder.Item
                  key={conversation.id}
                  value={conversation}
                  onClick={() => onSelectConversation(conversation.id)}
                  className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-all ${
                    active
                      ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/20 to-teal-400/10'
                      : 'border border-transparent hover:bg-white/6'
                  }`}
                >
                  <MessageSquare size={16} className={`mt-0.5 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-400'}`} />

                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{conversation.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(conversation.updatedAt)}</p>
                      </div>

                      <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            onUpdateConversation(conversation.id, { pinned: !conversation.pinned });
                          }}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10"
                        >
                          <Pin
                            size={14}
                            className={conversation.pinned ? 'fill-amber-300 text-amber-300' : 'text-slate-400'}
                          />
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            setDeleteTarget(conversation);
                          }}
                          className="rounded-md p-1.5 text-red-300 transition-colors hover:bg-red-500/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>

        <div className="h-[96px] border-t border-white/10 bg-slate-950/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Tổng số phiên</p>
          <p className="mt-1 text-2xl font-black text-cyan-300">{conversations.length}</p>
          <p className="text-[11px] text-slate-500">Các phiên đang được lưu cục bộ.</p>
        </div>
      </aside>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/20 bg-slate-900 p-5 text-slate-100 shadow-2xl">
            <h3 className="text-base font-bold text-red-300">Xác nhận xóa phiên</h3>
            <p className="mt-2 truncate text-sm text-slate-400">{deleteTarget.title}</p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/10"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  onDeleteConversation(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-400"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
