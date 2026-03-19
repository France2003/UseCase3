import type { Message } from '../types';

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  pinned?: boolean;
}

const STORAGE_KEY = 'hospital_199_conversations';
const CURRENT_CONVERSATION_KEY = 'current_conversation_id';
const MOJIBAKE_PATTERN = /\u00C3.|\u00C2.|\u00C6.|\u00C4.|\u00E1\u00BB.|\u00E1\u00BA.|\u00E2\u20AC|\u00F0\u0178/u;

const parseDateOrNow = (value: unknown): Date => {
  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const repairMojibake = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || !MOJIBAKE_PATTERN.test(value)) {
    return typeof value === 'string' ? value : '';
  }

  try {
    const bytes = Uint8Array.from(Array.from(value), char => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!decoded || decoded.includes('\uFFFD')) return value;
    return decoded;
  } catch {
    return value;
  }
};

const normalizeMessage = (rawMessage: any): { value: Message; changed: boolean } => {
  const content = typeof rawMessage?.content === 'string' ? rawMessage.content : '';
  const repairedContent = repairMojibake(content);

  const sheetLink =
    typeof rawMessage?.sheetLink === 'string' ? repairMojibake(rawMessage.sheetLink) : rawMessage?.sheetLink;
  const notebookLink =
    typeof rawMessage?.notebookLink === 'string' ? repairMojibake(rawMessage.notebookLink) : rawMessage?.notebookLink;

  return {
    value: {
      ...rawMessage,
      content: repairedContent,
      sheetLink,
      notebookLink,
      timestamp: parseDateOrNow(rawMessage?.timestamp),
    },
    changed:
      repairedContent !== content ||
      sheetLink !== rawMessage?.sheetLink ||
      notebookLink !== rawMessage?.notebookLink,
  };
};

const normalizeConversation = (rawConversation: any): { value: Conversation; changed: boolean } => {
  const title = typeof rawConversation?.title === 'string' ? rawConversation.title : '';
  const repairedTitle = repairMojibake(title);

  const rawMessages = Array.isArray(rawConversation?.messages) ? rawConversation.messages : [];
  let hasMessageChange = false;
  const messages = rawMessages.map((rawMessage: any) => {
    const normalized = normalizeMessage(rawMessage);
    if (normalized.changed) hasMessageChange = true;
    return normalized.value;
  });

  return {
    value: {
      ...rawConversation,
      title: repairedTitle || 'Phiên phân tích mới',
      messages,
      pinned: rawConversation?.pinned ?? false,
      createdAt: parseDateOrNow(rawConversation?.createdAt),
      updatedAt: parseDateOrNow(rawConversation?.updatedAt),
    },
    changed: repairedTitle !== title || hasMessageChange,
  };
};

export const storageService = {
  getAllConversations(): Conversation[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];

      let shouldPersist = false;
      const conversations = parsed.map(rawConversation => {
        const normalized = normalizeConversation(rawConversation);
        if (normalized.changed) shouldPersist = true;
        return normalized.value;
      });

      if (shouldPersist) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      }

      return conversations;
    } catch (error) {
      console.error('Lỗi khi tải hội thoại:', error);
      return [];
    }
  },

  getConversation(id: string): Conversation | null {
    return this.getAllConversations().find(conversation => conversation.id === id) || null;
  },

  createConversation(title: string, messages: Message[] = []): Conversation {
    const conversation: Conversation = {
      id: Date.now().toString(),
      title,
      messages,
      createdAt: new Date(),
      updatedAt: new Date(),
      pinned: false,
    };

    const conversations = this.getAllConversations();
    conversations.unshift(conversation);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    return conversation;
  },

  saveConversation(conversation: Conversation): void {
    const conversations = this.getAllConversations();
    const index = conversations.findIndex(item => item.id === conversation.id);

    const updated: Conversation = {
      ...conversation,
      updatedAt: new Date(),
    };

    if (index >= 0) conversations[index] = updated;
    else conversations.unshift(updated);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  },

  saveConversations(conversations: Conversation[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  },

  updateConversation(id: string, data: Partial<Conversation>): void {
    const conversations = this.getAllConversations().map(conversation =>
      conversation.id === id ? { ...conversation, ...data, updatedAt: new Date() } : conversation
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  },

  duplicateConversation(id: string): void {
    const conversations = this.getAllConversations();
    const target = conversations.find(conversation => conversation.id === id);
    if (!target) return;

    const copy: Conversation = {
      ...target,
      id: Date.now().toString(),
      title: `${target.title} (Bản sao)`,
      createdAt: new Date(),
      updatedAt: new Date(),
      pinned: false,
    };

    conversations.unshift(copy);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  },

  updateConversationMessages(conversationId: string, messages: Message[]): void {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return;
    conversation.messages = messages;
    this.saveConversation(conversation);
  },

  deleteConversation(id: string): void {
    const filtered = this.getAllConversations().filter(conversation => conversation.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  getCurrentConversationId(): string | null {
    return localStorage.getItem(CURRENT_CONVERSATION_KEY);
  },

  setCurrentConversationId(id: string): void {
    localStorage.setItem(CURRENT_CONVERSATION_KEY, id);
  },

  clearCurrentConversationId(): void {
    localStorage.removeItem(CURRENT_CONVERSATION_KEY);
  },

  searchConversations(query: string): Conversation[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllConversations().filter(
      conversation =>
        conversation.title.toLowerCase().includes(lowerQuery) ||
        conversation.messages.some(message => message.content.toLowerCase().includes(lowerQuery))
    );
  },
};
