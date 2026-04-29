import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { sendChatMessage, invalidateChatCache } from '../lib/chatService';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './ChatBot.css';

import novaAiIcon from '../assets/nova-ai-logo.png';

const NOVA_ICON = novaAiIcon;

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `👋 Hi! I'm **NovaAI** — your intelligent assistant.\n\nI have full access to your database and can help you with:\n• 📦 **Orders** — status, details, stats\n• 📊 **Inventory** — stock levels, alerts\n• 🧸 **Toy Boxes** — stock quantities\n• 👥 **Team** — user info and roles\n• 📋 **Activity** — recent actions\n\nAsk me anything! Try: *"How many orders are pending?"*`,
};

export const ChatBot = () => {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatHistoryRef = useRef([]);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const liveTables = [
      'orders',
      'inventory',
      'toy_box_inventory',
      'order_activity_logs',
      'notifications',
      'users',
      'user_roles',
    ];

    const channel = supabase.channel(`nova-ai-live-db-${user.id}`);

    liveTables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          invalidateChatCache();
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await sendChatMessage(trimmed, chatHistoryRef.current);
      const assistantMessage = { role: 'assistant', content: response };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update chat history for context
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        userMessage,
        assistantMessage,
      ].slice(-10);

      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error('ChatBot error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Sorry, something went wrong: ${error.message}. Please try again.`,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    chatHistoryRef.current = [];
  };

  const handleRefreshData = () => {
    invalidateChatCache();
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '🔄 Database cache cleared! My next answer will use fresh data.',
      },
    ]);
  };

  const formatMessageContent = (content) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  };

  if (!user) return null;

  const userName = profile?.name || user?.user_metadata?.full_name || 'User';
  const userAvatar = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={`chatbot-fab ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X size={24} />
        ) : (
          <>
            <img src={NOVA_ICON} alt="NovaAI" className="chatbot-fab-icon" />
            {unreadCount > 0 && (
              <span className="chatbot-unread-badge">{unreadCount}</span>
            )}
          </>
        )}
        <span className="chatbot-fab-ring" />
      </button>

      {/* Chat Panel */}
      <div className={`chatbot-panel ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="chatbot-header">
          <div className="chatbot-header-info">
            <div className="chatbot-avatar">
              <img src={NOVA_ICON} alt="NovaAI" className="chatbot-avatar-img" />
            </div>
            <div>
              <h4>NovaAI</h4>
              <span className="chatbot-status">
                <span className="chatbot-status-dot" />
                Online • Full DB Access
              </span>
            </div>
          </div>
          <div className="chatbot-header-actions">
            <button
              className="chatbot-header-btn"
              onClick={handleRefreshData}
              title="Refresh database cache"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="chatbot-header-btn"
              onClick={handleClearChat}
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
            <button
              className="chatbot-header-btn close"
              onClick={() => setIsOpen(false)}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chatbot-messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`chatbot-message ${msg.role === 'user' ? 'user' : 'bot'}`}
            >
              <div className="chatbot-message-avatar">
                {msg.role === 'user' ? (
                  userAvatar
                    ? <img src={userAvatar} alt="" className="chatbot-user-avatar-mini" />
                    : <span className="chatbot-user-initial">{userInitial}</span>
                ) : (
                  <img src={NOVA_ICON} alt="" className="chatbot-bot-avatar-mini" />
                )}
              </div>
              <div className="chatbot-message-bubble">
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <div
                    className="chatbot-message-content"
                    dangerouslySetInnerHTML={{
                      __html: formatMessageContent(msg.content),
                    }}
                  />
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="chatbot-message bot">
              <div className="chatbot-message-avatar">
                <img src={NOVA_ICON} alt="" className="chatbot-bot-avatar-mini" />
              </div>
              <div className="chatbot-message-bubble">
                <div className="chatbot-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chatbot-input-bar">
          <textarea
            ref={inputRef}
            className="chatbot-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask anything, ${userName.split(' ')[0]}...`}
            rows={1}
            disabled={isTyping}
          />
          <button
            className="chatbot-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            aria-label="Send message"
          >
            {isTyping ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </>
  );
};
