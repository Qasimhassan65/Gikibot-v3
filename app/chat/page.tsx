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
type FeedbackStatus = 'positive' | 'negative';

interface Citation {
  title: string;
  snippet: string;
}

interface ChatMessage {
  id: number;
  role: Role;
  content: string;
  citations?: Citation[];
  timestamp: string;
  feedback?: MessageFeedback;
}

interface MessageFeedback {
  status: FeedbackStatus;
  comment?: string;
  submittedAt: string;
}

interface FeedbackUIState {
  comment: string;
  isCommentOpen: boolean;
  loading: boolean;
  error?: string;
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
  const friendlyTypeName =
    routeType === 'undergrad'
      ? 'Undergraduate Admissions'
      : 'Graduate Admissions';

  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionIdRef = useRef<string>(
    `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 1,
      role: 'assistant',
      content:
        routeType === 'undergrad'
          ? 'You are now chatting with the GIKI Undergraduate Admissions assistant. Ask me anything about eligibility, test, deadlines, fees, etc.'
          : 'You are now chatting with the GIKI Graduate Admissions assistant. Ask me anything about MS/PhD requirements, tests, policies, etc.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackUI, setFeedbackUI] = useState<Record<number, FeedbackUIState>>(
    {},
  );

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
      timestamp: new Date().toISOString(),
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
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      const assistantMessage: ChatMessage = {
        id: Date.now() + 2,
        role: 'assistant',
        content:
          'Sorry, there was an error talking to the admissions assistant. Please try again.',
        timestamp: new Date().toISOString(),
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

  const openNegativeFeedback = (messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.feedback) {
      return;
    }

    setFeedbackUI((prev) => {
      const existing = prev[messageId] || {
        comment: '',
        isCommentOpen: false,
        loading: false,
      };

      return {
        ...prev,
        [messageId]: {
          ...existing,
          isCommentOpen: true,
          error: undefined,
        },
      };
    });
  };

  const handleCommentChange = (messageId: number, value: string) => {
    setFeedbackUI((prev) => {
      const existing = prev[messageId] || {
        comment: '',
        isCommentOpen: true,
        loading: false,
      };

      return {
        ...prev,
        [messageId]: {
          ...existing,
          comment: value,
          error: undefined,
        },
      };
    });
  };

  const submitNegativeFeedback = (messageId: number) => {
    const existing = feedbackUI[messageId];
    const comment = (existing?.comment || '').trim();

    if (!comment) {
      setFeedbackUI((prev) => {
        const state = prev[messageId] || {
          comment: '',
          isCommentOpen: true,
          loading: false,
        };

        return {
          ...prev,
          [messageId]: {
            ...state,
            error: 'Please share how we can improve this response.',
          },
        };
      });
      return;
    }

    void sendFeedback(messageId, 'negative', comment);
  };

  const handlePositiveFeedback = (messageId: number) => {
    void sendFeedback(messageId, 'positive');
  };

  const sendFeedback = async (
    messageId: number,
    feedbackType: FeedbackStatus,
    comment?: string,
  ) => {
    const targetMessage = messages.find((m) => m.id === messageId);
    if (!targetMessage || targetMessage.feedback) {
      return;
    }

    setFeedbackUI((prev) => {
      const existing = prev[messageId] || {
        comment: '',
        isCommentOpen: feedbackType === 'negative',
        loading: false,
      };

      return {
        ...prev,
        [messageId]: {
          ...existing,
          comment:
            feedbackType === 'negative'
              ? comment ?? existing.comment ?? ''
              : existing.comment ?? '',
          isCommentOpen: feedbackType === 'negative',
          loading: true,
          error: undefined,
        },
      };
    });

    const targetIndex = messages.findIndex((m) => m.id === messageId);
    const lastUserMessage =
      targetIndex > -1
        ? [...messages.slice(0, targetIndex)]
            .reverse()
            .find((m) => m.role === 'user')
        : undefined;

    const conversationPayload = messages.map((m) => ({
      role: m.role === 'assistant' ? 'bot' : 'user',
      message: m.content,
      timestamp: m.timestamp,
    }));

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          feedbackType,
          userComment: comment || '',
          lastQuestion: lastUserMessage?.content || '',
          lastResponse: targetMessage.content,
          fullConversation: conversationPayload,
          sessionId: sessionIdRef.current,
          type: friendlyTypeName,
          admissionsType: routeType,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to submit feedback.');
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                feedback: {
                  status: feedbackType,
                  comment: comment || '',
                  submittedAt: new Date().toISOString(),
                },
              }
            : m,
        ),
      );

      setFeedbackUI((prev) => ({
        ...prev,
        [messageId]: {
          comment: '',
          isCommentOpen: false,
          loading: false,
          error: undefined,
        },
      }));
    } catch (err: any) {
      console.error('Feedback error:', err);
      setFeedbackUI((prev) => {
        const existing = prev[messageId] || {
          comment: comment || '',
          isCommentOpen: feedbackType === 'negative',
          loading: false,
        };

        return {
          ...prev,
          [messageId]: {
            ...existing,
            comment: comment || existing.comment,
            isCommentOpen: feedbackType === 'negative',
            loading: false,
            error:
              err?.message ||
              'Unable to send feedback right now. Please try again.',
          },
        };
      });
    }
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

              {m.role === 'assistant' && (
                <div className="feedback-section">
                  {m.feedback ? (
                    <div className="feedback-status">
                      {m.feedback.status === 'positive'
                        ? 'Thanks for letting us know this was helpful!'
                        : 'Thanks for your feedback—we will use it to improve.'}
                    </div>
                  ) : (
                    <>
                      <div className="feedback-row">
                        <span className="feedback-label">Was this helpful?</span>
                        <button
                          type="button"
                          className="feedback-button"
                          onClick={() => handlePositiveFeedback(m.id)}
                          disabled={
                            feedbackUI[m.id]?.loading || Boolean(m.feedback)
                          }
                        >
                          {feedbackUI[m.id]?.loading &&
                          !feedbackUI[m.id]?.isCommentOpen
                            ? 'Sending...'
                            : '👍 Yes'}
                        </button>
                        <button
                          type="button"
                          className="feedback-button"
                          onClick={() => openNegativeFeedback(m.id)}
                          disabled={
                            feedbackUI[m.id]?.loading || Boolean(m.feedback)
                          }
                        >
                          👎 No
                        </button>
                      </div>

                      {feedbackUI[m.id]?.isCommentOpen && (
                        <div className="feedback-comment">
                          <label htmlFor={`feedback-${m.id}`}>
                            How can we improve this response?
                          </label>
                          <textarea
                            id={`feedback-${m.id}`}
                            value={feedbackUI[m.id]?.comment || ''}
                            onChange={(event) =>
                              handleCommentChange(m.id, event.target.value)
                            }
                            placeholder="Share what was missing, unclear, or incorrect..."
                            disabled={feedbackUI[m.id]?.loading}
                          />
                          <button
                            type="button"
                            className="feedback-submit"
                            onClick={() => submitNegativeFeedback(m.id)}
                            disabled={feedbackUI[m.id]?.loading}
                          >
                            {feedbackUI[m.id]?.loading
                              ? 'Sending...'
                              : 'Send feedback'}
                          </button>
                        </div>
                      )}

                      {feedbackUI[m.id]?.error && (
                        <div className="feedback-error">
                          {feedbackUI[m.id]?.error}
                        </div>
                      )}
                    </>
                  )}
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
