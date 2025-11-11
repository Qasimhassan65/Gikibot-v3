'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import {
  Fragment,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

type Role = 'user' | 'assistant';

interface Citation {
  title: string;
  snippet: string;
}

interface ChatMessage {
  id: number;
  role: Role;
  content: string;
  citations?: Citation[];
}

export default function ChatPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = (searchParams.get('type') || 'undergrad').toLowerCase();
  const routeType = typeParam === 'grad' ? 'grad' : 'undergrad';

  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      content:
        routeType === 'undergrad'
          ? 'You are now chatting with the GIKI Undergraduate Admissions assistant. Ask me anything about eligibility, test, deadlines, fees, etc.'
          : 'You are now chatting with the GIKI Graduate Admissions assistant. Ask me anything about MS/PhD requirements, tests, policies, etc.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adjustTextareaHeight(textareaRef.current);
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          type: routeType,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Request failed');
      }

      const data = await res.json();
      const text: string =
        data.text || data.response || 'Sorry, no response received.';

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: text,
        citations: Array.isArray(data.citations)
          ? data.citations
          : [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      const assistantMessage: ChatMessage = {
        id: Date.now() + 2,
        role: 'assistant',
        content:
          'Sorry, there was an error talking to the admissions assistant. Please try again.',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading) {
        formRef.current?.requestSubmit?.();
      }
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  return (
    <div className="page-root">
      <div className="card chat-card">
        <div className="card-header">
          <div>
            <div className="card-title">
              {routeType === 'undergrad'
                ? 'GIKI Undergraduate Admissions'
                : 'GIKI Graduate Admissions'}
            </div>
            <div className="card-subtitle">
              Ask questions based strictly on the official policy document.
            </div>
          </div>
          <button
            onClick={handleBack}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 11,
              color: '#555',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            change program
          </button>
        </div>

        <div className="chat-container">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`message ${m.role}`}
            >
              {renderMessageContent(m.content)}

              {m.role === 'assistant' &&
                m.citations &&
                m.citations.length > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      paddingTop: 4,
                      borderTop: '1px solid #eee',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        marginBottom: 2,
                        color: '#555',
                      }}
                    >
                      Sources
                    </div>
                    <ul
                      style={{
                        listStyleType: 'disc',
                        paddingLeft: 14,
                        margin: 0,
                        fontSize: 10,
                        color: '#666',
                      }}
                    >
                      {m.citations.slice(0, 4).map((c, i) => (
                        <li key={i}>
                          <span
                            style={{
                              fontWeight: 500,
                            }}
                          >
                            {c.title}
                          </span>
                          {': '}
                          {c.snippet}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ))}

          {loading && (
            <div className="message assistant">
              Thinking based on the official policy...
            </div>
          )}
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="chat-input-row"
        >
          <textarea
            className="chat-input"
            value={input}
            placeholder="Type your question here..."
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            ref={textareaRef}
            rows={1}
            aria-label="Message input"
          />
          <button
            className="chat-send-btn"
            type="submit"
            disabled={loading}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="page-root">
      <div className="card chat-card">
        <div className="chat-container">
          <div className="message assistant">Loading chat…</div>
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(content: string): ReactNode {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return null;
  }

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const normalizedBlocks = blocks.length > 0 ? blocks : [trimmed];

  return normalizedBlocks.map((block, blockIndex) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const isList =
      lines.length > 0 && lines.every((line) => /^[-*•]\s+/.test(line));

    if (isList) {
      return (
        <ul
          className="message-list"
          key={`list-${blockIndex}`}
        >
          {lines.map((line, lineIndex) => (
            <li key={`list-${blockIndex}-${lineIndex}`}>
              {formatInlineText(line.replace(/^[-*•]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    if (lines.length > 0) {
      return (
        <p
          className="message-paragraph"
          key={`para-${blockIndex}`}
        >
          {lines.map((line, lineIndex) => (
            <Fragment key={`para-${blockIndex}-line-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {formatInlineText(line)}
            </Fragment>
          ))}
        </p>
      );
    }

    return (
      <p
        className="message-paragraph"
        key={`para-${blockIndex}`}
      >
        {formatInlineText(block)}
      </p>
    );
  });
}

function formatInlineText(text: string): ReactNode[] {
  const segments: ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let boldIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }

    segments.push(
      <strong
        key={`bold-${boldIndex}`}
        style={{ fontWeight: 600 }}
      >
        {match[1]}
      </strong>,
    );

    boldIndex += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return segments.length > 0 ? segments : [text];
}

function adjustTextareaHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const maxHeight = 192; // ~6 lines
  const minHeight = 44;
  const newHeight = Math.max(Math.min(el.scrollHeight, maxHeight), minHeight);
  el.style.height = `${newHeight}px`;
}
