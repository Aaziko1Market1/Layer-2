import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2 } from 'lucide-react';

export type UserRole = 'visitor' | 'buyer' | 'seller' | 'admin';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  time: string;
}

export interface SupportChatProps {
  /** Pre-set role — hides the role switcher when provided */
  defaultRole?: UserRole;
  /** Label shown in the header, e.g. "Vendor Support" */
  title?: string;
  /** Position of the floating button */
  position?: 'bottom-right' | 'bottom-left';
  /** API base URL (default: /api/support-chat) */
  apiBase?: string;
}

const QUICK_BY_ROLE: Record<UserRole, string[]> = {
  buyer: ['What is MOQ for cotton t-shirts?', 'Payment terms?', 'How does quality assurance work?', 'Shipping to Germany?'],
  seller: ['How do I join Aaziko?', 'What documents do I need?', 'How to list products?', 'How do I get export orders?'],
  admin: ['Platform overview?', 'Active modules?', 'How does Aaziko Assurance work?', 'Buyer journey steps?'],
  visitor: ['What is Aaziko?', 'How does sourcing work?', 'Payment terms?', 'Quality assurance?'],
};

function getTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export default function SupportChat({
  defaultRole,
  title,
  position = 'bottom-right',
  apiBase = '/api/support-chat',
}: SupportChatProps = {}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>(defaultRole ?? 'visitor');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [unread, setUnread] = useState(false);

  const lockRole = !!defaultRole; // hide switcher if role is pre-set
  const QUICK_QUESTIONS = QUICK_BY_ROLE[role];

  // Draggable button state — start left side if bottom-left, right side otherwise
  const [btnPos, setBtnPos] = useState({ x: 24, y: 24 });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Pointer drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragging.current = true;
    dragMoved.current = false;
    const el = e.currentTarget.getBoundingClientRect();
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      bx: window.innerWidth - el.right,
      by: window.innerHeight - el.bottom,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
    if (!dragMoved.current) return;
    const newX = Math.max(8, Math.min(window.innerWidth - 68, dragStart.current.bx - dx));
    const newY = Math.max(8, Math.min(window.innerHeight - 68, dragStart.current.by - dy));
    setBtnPos({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!dragMoved.current) setOpen(o => !o);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setShowQuick(false);
    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      time: getTime(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const res = await fetch(`${apiBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(sessionId ? { sessionId } : {}), message: text.trim(), userRole: role }),
      });
      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: data.reply || data.error || 'Something went wrong.',
        time: getTime(),
      };
      setMessages(prev => [...prev, botMsg]);
      if (!open) setUnread(true);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: 'Connection error. Please try again.',
        time: getTime(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId, role, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const dialogBottom = btnPos.y + 68 + 8;
  const side = position === 'bottom-left' ? 'left' : 'right';

  return (
    <>
      {/* ── CHAT DIALOG ─────────────────────────────────── */}
      {open && (
        <div
          className="fixed z-[999999] flex flex-col overflow-hidden rounded-2xl border border-gray-700 shadow-2xl"
          style={{
            [side]: btnPos.x,
            bottom: dialogBottom,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            height: 520,
            maxHeight: 'calc(100vh - 140px)',
            background: '#111827',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1B4F72, #2471A3)' }}>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-base flex-shrink-0">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-sm">{title ?? 'Aaziko Support'}</div>
              <div className="text-blue-100 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                Online — AI powered
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors text-lg leading-none"
            >
              <X size={16} />
            </button>
          </div>

          {/* Role selector — hidden when role is pre-set by panel */}
          {!lockRole && (
            <div className="flex gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
              <span className="text-gray-500 text-xs self-center mr-1">I am a:</span>
              {(['visitor', 'buyer', 'seller'] as UserRole[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all capitalize border ${
                    role === r
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-blue-500 hover:text-blue-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {/* Role badge — shown when role is locked by panel */}
          {lockRole && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
              <span className="text-gray-500 text-xs">Signed in as:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-600/30 capitalize">
                {role === 'admin' ? 'Admin' : role === 'buyer' ? 'Buyer' : role === 'seller' ? 'Vendor / Seller' : role}
              </span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scroll-smooth"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>

            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-blue-900/40 flex items-center justify-center mx-auto mb-3">
                  <Bot size={28} className="text-blue-400" />
                </div>
                <p className="text-white font-semibold text-sm mb-1">Welcome to Aaziko Support!</p>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Ask me anything about sourcing from India, pricing, shipping, quality, or how to get started.
                </p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-end gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 ${
                    msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'
                  }`}>
                    {msg.role === 'user'
                      ? <User size={12} className="text-white" />
                      : <Bot size={12} className="text-blue-400" />
                    }
                  </div>
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
                <span className={`text-[10px] text-gray-600 mt-1 ${msg.role === 'user' ? 'mr-8' : 'ml-8'}`}>
                  {msg.time}
                </span>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-blue-400" />
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions */}
          {showQuick && messages.length === 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-blue-400 hover:bg-blue-900/30 hover:border-blue-600 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0 bg-gray-900">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your question..."
              rows={1}
              disabled={loading}
              className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
              style={{ minHeight: 40, maxHeight: 96 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0"
            >
              {loading
                ? <Loader2 size={16} className="text-white animate-spin" />
                : <Send size={16} className="text-white" />
              }
            </button>
          </div>

          {/* Footer */}
          <div className="text-center py-1.5 text-[10px] text-gray-600 bg-gray-900 border-t border-gray-800 flex-shrink-0">
            Powered by <span className="text-blue-500 font-medium">Aaziko AI</span>
          </div>
        </div>
      )}

      {/* ── FLOATING BUTTON ─────────────────────────────── */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="fixed z-[1000000] w-14 h-14 rounded-full border-2 border-blue-400/30 flex items-center justify-center shadow-xl transition-transform hover:scale-110 cursor-grab active:cursor-grabbing select-none touch-none"
        style={{
          [side]: btnPos.x,
          bottom: btnPos.y,
          background: 'linear-gradient(135deg, #1B4F72, #2471A3)',
          boxShadow: '0 4px 24px rgba(27,79,114,0.5)',
        }}
        title="Aaziko Support Chat"
      >
        {open
          ? <X size={24} className="text-white pointer-events-none" />
          : <MessageCircle size={24} className="text-white pointer-events-none" />
        }
        {unread && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-400 rounded-full border-2 border-gray-900 animate-pulse" />
        )}
      </button>
    </>
  );
}
