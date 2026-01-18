"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { chatWithAgent, getDailyGreeting, getMessageHistory } from "../lib/api";

interface Message {
  id: string;
  text: string;
  role: "user" | "model";
  error?: boolean;
}

interface ChatAssistantProps {
  userId?: string;
}

export default function ChatAssistant({ userId = "00000000-0000-0000-0000-000000000001" }: ChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const messagesDivRef = useRef<HTMLDivElement>(null);

  // Load message history and greeting on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        // Get today's date for filtering
        const today = new Date().toISOString().split('T')[0];

        // Load message history from today
        const historyResponse = await getMessageHistory(userId, 50, today);

        // Convert to Message format
        const loadedMessages: Message[] = historyResponse.messages.map((msg) => ({
          id: msg.id,
          text: msg.content,
          role: msg.role === 'system' ? 'model' : msg.role,
        }));

        // If no greeting exists yet, fetch/generate one
        if (!loadedMessages.some(m => m.role === 'model')) {
          const greetingResponse = await getDailyGreeting(userId);
          loadedMessages.unshift({
            id: greetingResponse.message_id,
            text: greetingResponse.greeting,
            role: 'model',
          });
        }

        setMessages(loadedMessages);
      } catch (error) {
        console.error('Error loading chat history:', error);
        // Show a simple greeting on error
        setMessages([{
          id: 'fallback',
          text: 'Hello! How can I help you today?',
          role: 'model',
        }]);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [userId]);

  // Set initial load to false after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom (only after initial load)
  const scrollToBottom = useCallback(() => {
    if (!isInitialLoad && messagesDivRef.current) {
      messagesDivRef.current.scrollTop = messagesDivRef.current.scrollHeight;
    }
  }, [isInitialLoad]);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || typing) return;

    // Add user message
    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      text: input,
      role: "user",
    };
    setMessages((prev) => [...prev, userMsg]);

    const userInput = input;
    setInput("");
    setTyping(true);

    try {
      // Call the agent API
      const response = await chatWithAgent({
        message: userInput,
        user_id: userId,
        session_id: sessionId
      });

      // Add agent response
      if (response.success) {
        const agentMsg: Message = {
          id: Math.random().toString(36).substring(7),
          text: response.response,
          role: "model",
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        // Show error message
        const errorMsg: Message = {
          id: Math.random().toString(36).substring(7),
          text: response.error || "I apologize, but I encountered an error. Please try again.",
          role: "model",
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (error) {
      console.error("Error calling agent:", error);
      // Show error message
      const errorMsg: Message = {
        id: Math.random().toString(36).substring(7),
        text: "I'm having trouble connecting. Please check your internet connection and try again.",
        role: "model",
        error: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="chat-assistant-container">
      <div className="chat-header">
        <h2 className="chat-title">AI Companion</h2>
        <div className="connection-status">
          <div className="status-dot connected"></div>
          <span className="status-text">Ready</span>
        </div>
      </div>

      <div className="messages-container" ref={messagesDivRef}>
        {loading ? (
          <div className="empty-state">
            <p className="empty-state-text">Loading your conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-text">Start a conversation with your AI companion</p>
            <p className="empty-state-subtext">Ask about meal suggestions, nutrition tips, or pregnancy advice</p>
          </div>
        ) : null}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.role === "user" ? "user-message" : "assistant-message"} ${msg.error ? "error-message" : ""}`}
          >
            <div className="message-content">
              {msg.role === "user" ? (
                msg.text
              ) : (
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="message assistant-message">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Ask me anything..."
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={typing}
        />
        <button
          type="submit"
          className="send-button"
          disabled={typing || !input.trim()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>
    </div>
  );
} 