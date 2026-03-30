import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Star, Trash2, ExternalLink } from "lucide-react";
import { useHideFooter } from "@/components/layout/DashboardLayout";
import ReactMarkdown from "react-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAuthClientId } from "@/utils/auth";
import {
  GuestConversation,
  GuestMessage,
  getGuestConversations,
  createGuestConversation,
  appendGuestMessages,
  deleteGuestConversation,
} from "@/utils/guestChat";
import ProgramCard, { type ProgramAction } from "@/components/chat/ProgramCard";
import ProfilePrompt, { type ProfilePromptData } from "@/components/chat/ProfilePrompt";
import QuickReplies from "@/components/chat/QuickReplies";
import StepProgress, { type ApplicationProgress } from "@/components/chat/StepProgress";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ApiMessage {
  message_id: number;
  sender_type: "user" | "assistant";
  message_text: string;
  actions_json?: {
    actions?: ProgramAction[];
    profilePrompts?: ProfilePromptData[];
    applicationProgress?: ApplicationProgress[];
  } | null;
}

interface SendMessageResponse {
  userMessage: ApiMessage;
  assistantMessage: ApiMessage | null;
  actions?: ProgramAction[];
  profilePrompts?: ProfilePromptData[];
  applicationProgress?: ApplicationProgress[];
}

interface ApiSession {
  session_id: number;
  message_count: number;
  last_message_text: string | null;
  is_starred: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const mapApiMessage = (message: ApiMessage): Message => ({
  id: String(message.message_id),
  role: message.sender_type,
  content: message.message_text,
});

const guestConvTitle = (conv: GuestConversation) => {
  const first = conv.messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  return first.content.length > 60 ? first.content.slice(0, 60) + "…" : first.content;
};

const ResultsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialMessage = (location.state as { initialMessage?: string })?.initialMessage;
  const hasHandledInitialMessage = useRef(false);

  const clientId = getAuthClientId();
  const isAuthenticated = clientId !== null;

  // ─── Shared UI state ───────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isBootstrappingThread, setIsBootstrappingThread] = useState(!!initialMessage);
  const [error, setError] = useState("");
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingDisplayLength, setTypingDisplayLength] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Auth mode state ────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(isAuthenticated);
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const [pendingSessionAction, setPendingSessionAction] = useState<{
    sessionId: number;
    type: "star" | "delete";
  } | null>(null);
  const [sessionPendingDelete, setSessionPendingDelete] = useState<ApiSession | null>(null);

  // ─── Guest mode state ───────────────────────────────────────────────
  const [guestConversations, setGuestConversations] = useState<GuestConversation[]>([]);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [guestPendingDelete, setGuestPendingDelete] = useState<GuestConversation | null>(null);

  // ─── Structured response state ────────────────────────────────────
  const [messageActions, setMessageActions] = useState<Record<string, ProgramAction[]>>({});
  const [messagePrompts, setMessagePrompts] = useState<Record<string, ProfilePromptData[]>>({});
  const [messageProgress, setMessageProgress] = useState<Record<string, ApplicationProgress[]>>({});

  // Derived
  const selectedSession = sessions.find((s) => s.session_id === selectedSessionId) ?? null;
  const starredSessions = sessions.filter((s) => s.is_starred);
  const unstarredSessions = sessions.filter((s) => !s.is_starred);
  const isInChatView = isAuthenticated
    ? selectedSessionId !== null || isBootstrappingThread
    : selectedGuestId !== null || isBootstrappingThread;

  // Hide footer when inside an active chat
  const setHideFooter = useHideFooter();
  useEffect(() => {
    setHideFooter(isInChatView);
    return () => setHideFooter(false);
  }, [isInChatView, setHideFooter]);

  // ─── Auth helpers ────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!isAuthenticated || clientId === null) {
      setSessions([]);
      setIsLoadingSessions(false);
      return;
    }
    setIsLoadingSessions(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/sessions`);
      if (!response.ok) throw new Error("Unable to load conversations.");
      setSessions((await response.json()) as ApiSession[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversations.");
    } finally {
      setIsLoadingSessions(false);
    }
  }, [clientId, isAuthenticated]);

  const loadMessages = useCallback(async (sessionId: number): Promise<Message[]> => {
    setIsLoadingMessages(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages`);
      if (!response.ok) throw new Error("Unable to load chat history.");
      const data = (await response.json()) as ApiMessage[];
      const mapped = data.map(mapApiMessage);
      setMessages(mapped);

      // Restore structured action cards from saved actions_json
      const newActions: Record<string, ProgramAction[]> = {};
      const newPrompts: Record<string, ProfilePromptData[]> = {};
      const newProgress: Record<string, ApplicationProgress[]> = {};
      for (const msg of data) {
        if (msg.sender_type === "assistant" && msg.actions_json) {
          const id = String(msg.message_id);
          if (msg.actions_json.actions?.length) newActions[id] = msg.actions_json.actions;
          if (msg.actions_json.profilePrompts?.length) newPrompts[id] = msg.actions_json.profilePrompts;
          if (msg.actions_json.applicationProgress?.length) newProgress[id] = msg.actions_json.applicationProgress;
        }
      }
      setMessageActions(newActions);
      setMessagePrompts(newPrompts);
      setMessageProgress(newProgress);

      return mapped;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load chat history.");
      return [];
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const createSession = async () => {
    const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error("Unable to create conversation.");
    return (await response.json()) as ApiSession;
  };

  const updateSessionStar = async (sessionId: number, isStarred: boolean) => {
    const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred }),
    });
    if (!response.ok) throw new Error("Unable to update conversation.");
    return (await response.json()) as ApiSession;
  };

  const deleteSession = async (sessionId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Unable to delete conversation.");
  };

  // ─── Guest helpers ───────────────────────────────────────────────────
  const refreshGuestConversations = () => {
    setGuestConversations(getGuestConversations());
  };

  // ─── Shared reset ───────────────────────────────────────────────────
  const resetConversationView = () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setSelectedSessionId(null);
    setSelectedGuestId(null);
    setMessages([]);
    setInput("");
    setError("");
  };

  const isSessionActionPending = (sessionId: number, type?: "star" | "delete") => {
    if (!pendingSessionAction || pendingSessionAction.sessionId !== sessionId) return false;
    if (!type) return true;
    return pendingSessionAction.type === type;
  };

  // ─── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    } else {
      setGuestConversations(getGuestConversations());
      setIsLoadingSessions(false);
    }
  }, [isAuthenticated, loadSessions]);

  // Chat scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingDisplayLength, typingMessageId, isThinking]);

  // Typing animation
  useEffect(() => {
    if (!typingMessageId) return;
    const fullMessage = messages.find((m) => m.id === typingMessageId);
    if (!fullMessage) { setTypingMessageId(null); return; }
    if (typingDisplayLength >= fullMessage.content.length) { setTypingMessageId(null); return; }
    const timer = setTimeout(() => {
      setTypingDisplayLength((prev) => Math.min(prev + 8, fullMessage.content.length));
    }, 15);
    return () => clearTimeout(timer);
  }, [typingMessageId, typingDisplayLength, messages]);

  // Bootstrap initial message from home-page search
  useEffect(() => {
    const bootstrap = async () => {
      if (!initialMessage || hasHandledInitialMessage.current) return;
      hasHandledInitialMessage.current = true;
      setIsBootstrappingThread(true);
      setError("");

      try {
        if (isAuthenticated) {
          // ── Auth bootstrap ──────────────────────────────────────────
          const newSession = await createSession();
          setSelectedSessionId(newSession.session_id);
          const response = await fetch(`${API_BASE_URL}/api/sessions/${newSession.session_id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageText: initialMessage.trim(), senderType: "user" }),
          });
          if (!response.ok) throw new Error("Unable to save first message.");
          const respData = (await response.json()) as SendMessageResponse;
          await loadSessions();
          const loaded = await loadMessages(newSession.session_id);
          const lastAssistant = [...loaded].reverse().find((m) => m.role === "assistant");
          if (lastAssistant) {
            setTypingDisplayLength(0);
            setTypingMessageId(lastAssistant.id);
            if (respData.actions && respData.actions.length > 0) {
              setMessageActions((prev) => ({ ...prev, [lastAssistant.id]: respData.actions! }));
            }
            if (respData.profilePrompts && respData.profilePrompts.length > 0) {
              setMessagePrompts((prev) => ({ ...prev, [lastAssistant.id]: respData.profilePrompts! }));
            }
            if (respData.applicationProgress && respData.applicationProgress.length > 0) {
              setMessageProgress((prev) => ({ ...prev, [lastAssistant.id]: respData.applicationProgress! }));
            }
          }
        } else {
          // ── Guest bootstrap ─────────────────────────────────────────
          const conv = createGuestConversation();
          setSelectedGuestId(conv.id);
          const userMsg: GuestMessage = { id: `g-${Date.now()}`, role: "user", content: initialMessage.trim() };
          setMessages([{ ...userMsg }]);
          appendGuestMessages(conv.id, [userMsg]);
          refreshGuestConversations();

          const res = await fetch(`${API_BASE_URL}/api/chat/guest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageText: initialMessage.trim(), conversationHistory: [] }),
          });
          if (!res.ok) throw new Error("Unable to get AI response.");
          const data = await res.json() as { assistantMessage: string; actions?: ProgramAction[]; profilePrompts?: ProfilePromptData[] };
          const aiMsg: GuestMessage = { id: `g-${Date.now()}-ai`, role: "assistant", content: data.assistantMessage };
          setMessages((prev) => [...prev, { ...aiMsg }]);
          setTypingDisplayLength(0);
          setTypingMessageId(aiMsg.id);
          if (data.actions && data.actions.length > 0) {
            setMessageActions((prev) => ({ ...prev, [aiMsg.id]: data.actions! }));
          }
          if (data.profilePrompts && data.profilePrompts.length > 0) {
            setMessagePrompts((prev) => ({ ...prev, [aiMsg.id]: data.profilePrompts! }));
          }
          appendGuestMessages(conv.id, [aiMsg]);
          refreshGuestConversations();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to start conversation.");
      } finally {
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        setIsBootstrappingThread(false);
      }
    };
    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  // ─── Send message ────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setError("");

    if (isAuthenticated) {
      // ── Auth send ─────────────────────────────────────────────────

      // Optimistically show the user's message immediately
      const optimisticUserMsg: Message = { id: `optimistic-${Date.now()}`, role: "user", content: text.trim() };
      setMessages((prev) => [...prev, optimisticUserMsg]);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setIsThinking(true);

      try {
        let sessionId = selectedSessionId;
        if (!sessionId) {
          const newSession = await createSession();
          sessionId = newSession.session_id;
          setSelectedSessionId(sessionId);
        }
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageText: text.trim(), senderType: "user" }),
        });
        if (!response.ok) throw new Error("Unable to save message.");
        const data = (await response.json()) as SendMessageResponse;

        // Replace optimistic message with real one, then add assistant message
        const realUserMsg = mapApiMessage(data.userMessage);
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optimisticUserMsg.id);
          const next = [...without, realUserMsg];
          if (data.assistantMessage) next.push(mapApiMessage(data.assistantMessage));
          return next;
        });

        if (data.assistantMessage) {
          const mapped = mapApiMessage(data.assistantMessage);
          setTypingDisplayLength(0);
          setTypingMessageId(mapped.id);
          if (data.actions && data.actions.length > 0) {
            setMessageActions((prev) => ({ ...prev, [mapped.id]: data.actions! }));
          }
          if (data.profilePrompts && data.profilePrompts.length > 0) {
            setMessagePrompts((prev) => ({ ...prev, [mapped.id]: data.profilePrompts! }));
          }
          if (data.applicationProgress && data.applicationProgress.length > 0) {
            setMessageProgress((prev) => ({ ...prev, [mapped.id]: data.applicationProgress! }));
          }
        }

        await loadSessions();
      } catch (err) {
        // Remove the optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
        setInput(text);
        setError(err instanceof Error ? err.message : "Unable to save message.");
      } finally {
        setIsThinking(false);
        setIsSending(false);
      }
    } else {
      // ── Guest send ────────────────────────────────────────────────
      let guestId = selectedGuestId;
      const userMsg: GuestMessage = { id: `g-${Date.now()}`, role: "user", content: text.trim() };

      try {
        if (!guestId) {
          const conv = createGuestConversation();
          guestId = conv.id;
          setSelectedGuestId(guestId);
        }
        setMessages((prev) => [...prev, { ...userMsg }]);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setIsThinking(true);
        appendGuestMessages(guestId, [userMsg]);
        refreshGuestConversations();

        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch(`${API_BASE_URL}/api/chat/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageText: text.trim(), conversationHistory: history }),
        });
        if (!res.ok) throw new Error("Unable to get AI response.");
        const data = await res.json() as { assistantMessage: string; actions?: ProgramAction[]; profilePrompts?: ProfilePromptData[] };
        const aiMsg: GuestMessage = { id: `g-${Date.now()}-ai`, role: "assistant", content: data.assistantMessage };
        setMessages((prev) => [...prev, { ...aiMsg }]);
        setTypingDisplayLength(0);
        setTypingMessageId(aiMsg.id);
        if (data.actions && data.actions.length > 0) {
          setMessageActions((prev) => ({ ...prev, [aiMsg.id]: data.actions! }));
        }
        if (data.profilePrompts && data.profilePrompts.length > 0) {
          setMessagePrompts((prev) => ({ ...prev, [aiMsg.id]: data.profilePrompts! }));
        }
        appendGuestMessages(guestId, [aiMsg]);
        refreshGuestConversations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to get AI response.");
      } finally {
        setIsThinking(false);
        setIsSending(false);
      }
    }
  };

  // ─── Input handlers ──────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSend = () => {
    sendMessage(input);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // ─── Session/conversation navigation ────────────────────────────────
  const handleSessionSelect = async (sessionId: number) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setSelectedSessionId(sessionId);
    setMessages([]);
    await loadMessages(sessionId);
  };

  const handleGuestSelect = (conv: GuestConversation) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setSelectedGuestId(conv.id);
    setMessages(conv.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
  };

  const handleToggleStar = async (session: ApiSession) => {
    setPendingSessionAction({ sessionId: session.session_id, type: "star" });
    setError("");
    try {
      await updateSessionStar(session.session_id, !session.is_starred);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update conversation.");
    } finally {
      setPendingSessionAction(null);
    }
  };

  const handleDeleteConversation = async () => {
    if (!sessionPendingDelete) return;
    setPendingSessionAction({ sessionId: sessionPendingDelete.session_id, type: "delete" });
    setError("");
    try {
      await deleteSession(sessionPendingDelete.session_id);
      if (selectedSessionId === sessionPendingDelete.session_id) resetConversationView();
      await loadSessions();
      setSessionPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete conversation.");
    } finally {
      setPendingSessionAction(null);
    }
  };

  const handleDeleteGuestConversation = () => {
    if (!guestPendingDelete) return;
    deleteGuestConversation(guestPendingDelete.id);
    if (selectedGuestId === guestPendingDelete.id) resetConversationView();
    refreshGuestConversations();
    setGuestPendingDelete(null);
  };

  // ─── Quick reply derivation ────────────────────────────────────────
  const deriveQuickReplies = (): string[] => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return [];
    const actions = messageActions[last.id];
    const prompts = messagePrompts[last.id];
    if (prompts && prompts.length > 0) return [];
    if (actions && actions.length > 0) {
      return ["Tell me more", "What else am I eligible for?", "Show my applications"];
    }
    return ["What programs am I eligible for?", "Help me with housing", "Tell me more"];
  };

  // ─── Shared chat message renderer ───────────────────────────────────
  const renderMessages = () => (
    <>
      {(isLoadingMessages || isBootstrappingThread) && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-on-surface-variant">
            {isBootstrappingThread ? "Starting conversation..." : "Loading conversation..."}
          </p>
        </div>
      )}

      {!isLoadingMessages && !isBootstrappingThread && messages.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary-container mb-5">
            <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              smart_toy
            </span>
          </div>
          <p className="text-lg font-bold font-headline text-on-surface mb-1">Hi, I'm NavigAid</p>
          <p className="text-sm text-on-surface-variant max-w-sm mx-auto mb-6">
            {isAuthenticated
              ? "I know your profile and can recommend programs you may qualify for. Describe your situation or try one of these:"
              : "I can help you explore government aid programs. Describe your situation or try one of these:"}
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
            {[
              "What programs am I eligible for?",
              "I need help with housing",
              "I lost my job recently",
              "Help me with food assistance",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-primary/20 text-primary bg-[var(--surface-container-lowest)] hover:bg-primary/5 transition-all active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg, msgIdx) => {
        const isTyping = msg.id === typingMessageId;
        const displayContent = isTyping ? msg.content.substring(0, typingDisplayLength) : msg.content;
        const isLastAssistant = msg.role === "assistant" && msgIdx === messages.length - 1;
        const actions = messageActions[msg.id];
        const prompts = messagePrompts[msg.id];
        const progress = messageProgress[msg.id];

        return (
          <div key={msg.id}>
            <div className={`flex gap-3 max-w-[80%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center shrink-0 mt-1">
                  <span className="material-symbols-outlined text-primary text-lg">smart_toy</span>
                </div>
              )}
              {msg.role === "user" && (
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="material-symbols-outlined text-primary text-lg">person</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-[var(--on-primary)] rounded-br-md whitespace-pre-wrap"
                    : "bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]/20 rounded-bl-md shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  displayContent
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      h3: ({ children }) => <h3 className="text-base font-bold font-headline text-on-surface mt-3 mb-1">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-sm font-bold font-headline text-on-surface mt-2 mb-1">{children}</h4>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                          {children}<ExternalLink className="w-3 h-3 inline" />
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-3 border-primary/30 bg-primary-container/10 rounded-r-lg pl-3 pr-2 py-2 my-2 text-xs italic">
                          {children}
                        </blockquote>
                      ),
                      hr: () => <hr className="my-3 border-[var(--outline-variant)]/20" />,
                      code: ({ children }) => (
                        <code className="text-xs bg-[var(--surface-container)] rounded px-1.5 py-0.5 font-mono">{children}</code>
                      ),
                    }}
                  >
                    {displayContent}
                  </ReactMarkdown>
                )}
              </div>
            </div>

            {msg.role === "assistant" && !isTyping && (
              <div className="ml-12">
                {actions?.map((action, i) => (
                  <ProgramCard key={i} action={action} onLearnMore={(text) => sendMessage(text)} />
                ))}
                {progress?.map((prog, i) => (
                  <StepProgress key={i} progress={prog} />
                ))}
                {isLastAssistant && prompts?.map((p, i) => (
                  <ProfilePrompt key={i} prompt={p} onAnswered={(text) => sendMessage(text)} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && !typingMessageId && !isThinking && (
        <QuickReplies
          replies={deriveQuickReplies()}
          onSelect={(text) => sendMessage(text)}
          disabled={isSending}
        />
      )}

      {isThinking && (
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center shrink-0 mt-1">
            <span className="material-symbols-outlined text-primary text-lg">smart_toy</span>
          </div>
          <div className="rounded-2xl rounded-bl-md px-5 py-3.5 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]/20 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-[pulse_1.4s_ease-in-out_infinite]" />
            <span className="w-2 h-2 rounded-full bg-primary animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="w-2 h-2 rounded-full bg-primary animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </>
  );

  // ─── Shared chat input ───────────────────────────────────────────────
  const renderInput = () => (
    <div className="shrink-0 px-2 pb-4 pt-2">
      <div className="max-w-3xl mx-auto editorial-shadow p-2 bg-[var(--surface-container-lowest)] rounded-full flex items-center group transition-all duration-300 focus-within:ring-4 focus-within:ring-primary-container/20">
        <div className="pl-4 text-primary flex items-center shrink-0">
          <span className="material-symbols-outlined text-xl">chat</span>
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a follow-up question..."
          className="flex-1 resize-none border-0 bg-transparent text-on-surface placeholder:text-[var(--outline-variant)] focus:outline-none focus:ring-0 min-h-[44px] max-h-[120px] py-3 px-4 font-body text-sm overflow-y-auto"
          rows={1}
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending || isLoadingMessages || isBootstrappingThread}
          className="bg-primary hover:bg-primary-dim text-[var(--on-primary)] px-5 py-3 rounded-full font-headline font-bold text-sm transition-all duration-300 active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap mr-0.5"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {input.length > 1800 && (
        <p className="text-xs text-on-surface-variant/60 text-right mt-1 pr-4 max-w-3xl mx-auto">
          {input.length}/2000
        </p>
      )}
    </div>
  );

  // ─── Chat View ────────────────────────────────────────────────────────
  if (isInChatView) {
    const chatTitle = isAuthenticated
      ? `Conversation #${selectedSessionId}`
      : selectedGuestId
        ? guestConvTitle(guestConversations.find((c) => c.id === selectedGuestId) ?? { id: "", messages: [], createdAt: 0 })
        : "New Chat";

    return (
      <div className="-mt-8 md:-mt-12 -mb-8 md:-mb-12 flex h-[calc(100vh-5rem)] overflow-hidden">
        {/* Left sidebar panel */}
        <div className="hidden md:flex flex-col items-center gap-3 w-12 shrink-0 pt-3 border-r border-[var(--outline-variant)]/15">
          <button
            onClick={resetConversationView}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--surface-container)] transition-colors"
            aria-label="Back to conversations"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {isAuthenticated && selectedSession && (
            <>
              <button
                type="button"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  selectedSession.is_starred ? "text-amber-500 hover:bg-amber-50" : "text-slate-400 hover:bg-slate-100"
                }`}
                disabled={isSessionActionPending(selectedSession.session_id)}
                onClick={() => void handleToggleStar(selectedSession)}
                aria-label={selectedSession.is_starred ? "Unstar" : "Star"}
                title={selectedSession.is_starred ? "Unstar" : "Star"}
              >
                <Star className={`h-4 w-4 ${selectedSession.is_starred ? "fill-current" : ""}`} />
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                disabled={isSessionActionPending(selectedSession.session_id)}
                onClick={() => setSessionPendingDelete(selectedSession)}
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Chat area — full height, no top header */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile-only compact header (no room for sidebar on small screens) */}
          <div className="md:hidden shrink-0 flex items-center gap-2 py-2 px-1 border-b border-[var(--outline-variant)]/15">
            <button
              onClick={resetConversationView}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--surface-container)] transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold font-headline text-on-surface truncate flex-1">{chatTitle}</h3>
            {isAuthenticated && selectedSession && (
              <>
                <button
                  type="button"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    selectedSession.is_starred ? "text-amber-500" : "text-slate-400"
                  }`}
                  disabled={isSessionActionPending(selectedSession.session_id)}
                  onClick={() => void handleToggleStar(selectedSession)}
                >
                  <Star className={`h-4 w-4 ${selectedSession.is_starred ? "fill-current" : ""}`} />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                  disabled={isSessionActionPending(selectedSession.session_id)}
                  onClick={() => setSessionPendingDelete(selectedSession)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Guest save banner */}
          {!isAuthenticated && (
            <div className="shrink-0 flex items-center justify-between gap-3 bg-secondary-container/50 border border-primary/10 rounded-xl px-3 py-2 mx-2 mt-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm shrink-0">info</span>
                <p className="text-xs text-on-surface font-medium">Create an account to save conversations.</p>
              </div>
              <button
                onClick={() => navigate("/signup")}
                className="shrink-0 px-3 py-1 rounded-full bg-primary text-[var(--on-primary)] font-bold text-xs hover:bg-primary-dim transition-all"
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 px-3 pt-3 pb-1">
            {error && <p className="text-sm text-error font-medium">{error}</p>}
            {renderMessages()}
          </div>

          {renderInput()}
        </div>

        {/* Auth delete dialog */}
        <AlertDialog
          open={sessionPendingDelete !== null}
          onOpenChange={(isOpen) => { if (!isOpen && !pendingSessionAction) setSessionPendingDelete(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                Conversation #{sessionPendingDelete?.session_id} will be removed permanently.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendingSessionAction?.type === "delete"}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-error text-[var(--on-error)] hover:bg-error/90"
                disabled={pendingSessionAction?.type === "delete"}
                onClick={(e) => { e.preventDefault(); void handleDeleteConversation(); }}
              >
                Delete Conversation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── Session / Conversation List View ────────────────────────────────
  const visibleSessions = filter === "starred"
    ? starredSessions
    : [...starredSessions, ...unstarredSessions];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-headline tracking-tight text-on-surface mb-4">
          Chat
        </h2>
        <p className="text-on-surface-variant text-lg max-w-2xl font-body">
          Ask NavigAid AI anything about aid programs, eligibility, or how to apply.
        </p>
      </div>

      {/* Logged-out banner */}
      {!isAuthenticated && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-secondary-container/50 border border-primary/10 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">info</span>
            <p className="text-sm text-on-surface font-medium">
              Create a free account to save your conversations and track aid applications.
            </p>
          </div>
          <button
            onClick={() => navigate("/signup")}
            className="shrink-0 px-5 py-2 rounded-full bg-primary text-[var(--on-primary)] font-bold text-sm hover:bg-primary-dim transition-all"
          >
            Sign Up Free
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {isAuthenticated && (
          <div className="flex gap-2 bg-[var(--surface-container-low)] p-1.5 rounded-2xl w-fit">
            {(["all", "starred"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-2 rounded-xl font-bold transition-all capitalize ${
                  filter === f
                    ? "bg-[var(--surface-container-lowest)] shadow-sm text-primary"
                    : "text-on-surface-variant font-medium hover:bg-[var(--surface-container-high)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={async () => {
            if (isAuthenticated) {
              try {
                setError("");
                const newSession = await createSession();
                await loadSessions();
                await handleSessionSelect(newSession.session_id);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to create conversation.");
              }
            } else {
              // Guest: create new local conv and go straight to chat view
              const conv = createGuestConversation();
              refreshGuestConversations();
              setSelectedGuestId(conv.id);
              setMessages([]);
              window.scrollTo({ top: 0, behavior: "instant" });
            }
          }}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-[var(--on-primary)] font-bold hover:bg-primary-dim transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-lg">add_comment</span>
          New Chat
        </button>
      </div>

      {error && <p className="text-sm text-error font-medium">{error}</p>}

      {/* Auth: session loading spinner */}
      {isLoadingSessions && isAuthenticated && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-on-surface-variant">Loading conversations...</p>
        </div>
      )}

      {/* Auth: session cards */}
      {isAuthenticated && !isLoadingSessions && (
        <>
          {visibleSessions.length === 0 ? (
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)]/20 p-12 text-center">
              <span className="material-symbols-outlined text-5xl mb-4 block text-primary/30" style={{ fontVariationSettings: "'FILL' 1" }}>
                {filter === "starred" ? "star" : "forum"}
              </span>
              <p className="text-lg font-bold font-headline text-on-surface mb-1">
                {filter === "starred" ? "No starred conversations" : "No conversations yet"}
              </p>
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto">
                {filter === "starred"
                  ? "Star any conversation to save it here for quick access."
                  : "Start a new chat to get personalized help finding aid programs."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleSessions.map((session) => {
                const isDeleting = isSessionActionPending(session.session_id, "delete");
                const isStarring = isSessionActionPending(session.session_id, "star");
                return (
                  <div
                    key={session.session_id}
                    className="group bg-[var(--surface-container-lowest)] rounded-2xl p-4 sm:p-6 transition-all hover:shadow-editorial-hover border border-transparent hover:border-primary/10"
                  >
                    <button
                      type="button"
                      onClick={() => handleSessionSelect(session.session_id)}
                      className="flex items-start sm:items-center gap-3 sm:gap-6 w-full text-left focus:outline-none"
                    >
                      <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 ${
                        session.is_starred ? "bg-amber-100 text-amber-600" : "bg-secondary-container text-primary"
                      }`}>
                        <span className="material-symbols-outlined text-xl sm:text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {session.is_starred ? "star" : "chat_bubble"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                          <h3 className="text-base sm:text-xl font-bold font-headline text-on-surface line-clamp-2">
                            {session.last_message_text
                              ? session.last_message_text.replace(/\[.*?\]/g, "").trim().substring(0, 120) +
                                (session.last_message_text.length > 120 ? "…" : "")
                              : `Conversation #${session.session_id}`}
                          </h3>
                          {session.is_starred && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                              Starred
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1">{session.message_count} messages</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 sm:gap-3 mt-3 sm:mt-0 justify-end">
                      <button
                        type="button"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
                          session.is_starred ? "text-amber-500 hover:bg-amber-50" : "text-slate-400 hover:bg-slate-100"
                        }`}
                        disabled={isDeleting || isStarring}
                        onClick={(e) => { e.stopPropagation(); void handleToggleStar(session); }}
                        aria-label={session.is_starred ? "Unstar" : "Star"}
                      >
                        <Star className={`h-4 w-4 sm:h-5 sm:w-5 ${session.is_starred ? "fill-current" : ""}`} />
                      </button>
                      <button
                        type="button"
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        disabled={isDeleting || isStarring}
                        onClick={(e) => { e.stopPropagation(); setSessionPendingDelete(session); }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSessionSelect(session.session_id)}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-[var(--surface-container)] hover:bg-primary hover:text-[var(--on-primary)] transition-all active:scale-90"
                        aria-label="Open conversation"
                      >
                        <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Guest: local conversation cards */}
      {!isAuthenticated && (
        <>
          {guestConversations.length === 0 ? (
            <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)]/20 p-12 text-center">
              <span className="material-symbols-outlined text-5xl mb-4 block text-primary/30" style={{ fontVariationSettings: "'FILL' 1" }}>
                chat_bubble
              </span>
              <p className="text-lg font-bold font-headline text-on-surface mb-1">No chats yet</p>
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto">
                Start a new chat to get personalized help finding aid programs.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {guestConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="group bg-[var(--surface-container-lowest)] rounded-2xl p-4 sm:p-6 transition-all hover:shadow-editorial-hover border border-transparent hover:border-primary/10"
                >
                  <button
                    type="button"
                    onClick={() => handleGuestSelect(conv)}
                    className="flex items-start sm:items-center gap-3 sm:gap-6 w-full text-left focus:outline-none"
                  >
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 bg-secondary-container text-primary">
                      <span className="material-symbols-outlined text-xl sm:text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        chat_bubble
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-xl font-bold font-headline text-on-surface truncate">
                        {guestConvTitle(conv)}
                      </h3>
                      <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
                        {conv.messages.length} messages · Guest session
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 justify-end mt-3 sm:mt-0">
                    <button
                      type="button"
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setGuestPendingDelete(conv); }}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGuestSelect(conv)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-[var(--surface-container)] hover:bg-primary hover:text-[var(--on-primary)] transition-all active:scale-90"
                      aria-label="Open conversation"
                    >
                      <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Auth delete dialog */}
      <AlertDialog
        open={sessionPendingDelete !== null}
        onOpenChange={(isOpen) => { if (!isOpen && !pendingSessionAction) setSessionPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Conversation #{sessionPendingDelete?.session_id} will be removed permanently along with its saved messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingSessionAction?.type === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-[var(--on-error)] hover:bg-error/90"
              disabled={pendingSessionAction?.type === "delete"}
              onClick={(e) => { e.preventDefault(); void handleDeleteConversation(); }}
            >
              Delete Conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guest delete dialog */}
      <AlertDialog
        open={guestPendingDelete !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setGuestPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This guest conversation will be removed from your browser. It was never saved to an account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-[var(--on-error)] hover:bg-error/90"
              onClick={(e) => { e.preventDefault(); handleDeleteGuestConversation(); }}
            >
              Delete Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ResultsPage;
