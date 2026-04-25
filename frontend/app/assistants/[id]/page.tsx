"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { api, type Assistant, type Conversation, type Document, type DocumentChunk, type Message, type Source, supabase } from "@/lib/api";
import styles from "./page.module.css";
import { ThemeToggle } from "@/components/ThemeToggle";

const markdownComponents: Components = {
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          className={styles.markdownCodeBlock}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    }

    return <code className={styles.markdownInlineCode}>{children}</code>;
  },
};

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [avatar, setAvatar] = useState("✦");
  const [drawer, setDrawer] = useState<"none" | "history" | "docs">("none");
  const [profile, setProfile] = useState<any>(null);
  const [viewerDocument, setViewerDocument] = useState<Document | null>(null);
  const [viewerChunks, setViewerChunks] = useState<DocumentChunk[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [viewerFocusChunkId, setViewerFocusChunkId] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsSource, setSuggestionsSource] = useState<"docs" | "general">("general");
  const [pendingSeedQuestion, setPendingSeedQuestion] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [userAssistants, setUserAssistants] = useState<Assistant[]>([]);
  const [switcherLoading, setSwitcherLoading] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    }
    if (showSwitcher) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSwitcher]);

  async function handleOpenSwitcher() {
    setShowSwitcher(prev => !prev);
    if (userAssistants.length === 0) {
      setSwitcherLoading(true);
      try {
        const list = await api.assistants.list();
        setUserAssistants(list);
      } catch {
        setUserAssistants([]);
      } finally {
        setSwitcherLoading(false);
      }
    }
  }

  const refreshSuggestedQuestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const result = await api.assistants.suggestedQuestions(id);
      setSuggestedQuestions(result.questions);
      setSuggestionsSource(result.based_on_documents ? "docs" : "general");
    } catch {
      setSuggestedQuestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id && typeof window !== "undefined") {
      setAvatar(localStorage.getItem(`avatar_${id}`) || "✦");
    }
  }, [id]);

  useEffect(() => {
    // Load cached profile
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("user_profile");
      if (cached) {
        try { setProfile(JSON.parse(cached)); } catch(e) {}
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        router.push("/login");
      } else {
        // Load data
        Promise.all([
          api.assistants.get(id),
          api.conversations.list(id),
          api.documents.list(id),
          api.users.me(),
        ]).then(async ([asst, convs, docs, me]) => {
          setAssistant(asst);
          setConversations(convs);
          setDocuments(docs);
          const p = { ...me, ...me.profile };
          setProfile(p);
          localStorage.setItem("user_profile", JSON.stringify(p));
          if (convs.length > 0) {
            setActiveConv(convs[0]);
            const convMessages = await api.conversations.messages(convs[0].id);
            setMessages(convMessages);
          }
          await refreshSuggestedQuestions();
        }).catch(() => router.push("/"))
          .finally(() => setLoading(false));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        api.users.me().then(me => {
          const p = { ...me, ...me.profile };
          setProfile(p);
          localStorage.setItem("user_profile", JSON.stringify(p));
        });
      } else {
        router.push("/login");
        localStorage.removeItem("user_profile");
      }
    });

    return () => subscription.unsubscribe();
  }, [id, refreshSuggestedQuestions, router]);

  async function handleNewConversation() {
    const conv = await api.conversations.create(id);
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
    setMessages([]);
  }

  async function handleSelectConv(conv: Conversation) {
    setActiveConv(conv);
    const msgs = await api.conversations.messages(conv.id);
    setMessages(msgs);
  }


  async function startConversationWithSuggestion(question: string) {
    if (activeConv) {
      setPendingSeedQuestion(question);
      return;
    }

    const conv = await api.conversations.create(id);
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
    setMessages([]);
    setPendingSeedQuestion(question);
  }

  const openDocumentViewer = useCallback(async (documentId: string, focusChunkId?: string) => {
    const selectedDoc = documents.find((d) => d.id === documentId);
    if (!selectedDoc) return;

    setViewerDocument(selectedDoc);
    setViewerChunks([]);
    setViewerError("");
    setViewerLoading(true);
    setViewerFocusChunkId(focusChunkId ?? null);
    setDrawer("none");

    try {
      const chunks = await api.documents.chunks(id, documentId);
      setViewerChunks(chunks);
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : "No se pudo cargar el contenido del documento.");
    } finally {
      setViewerLoading(false);
    }
  }, [documents, id]);

  const openDocumentOriginal = useCallback(async (documentId: string) => {
    try {
      const result = await api.documents.openUrl(id, documentId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert("No se pudo abrir el archivo original.");
    }
  }, [id]);

  const handleOpenSource = useCallback((source: Source) => {
    openDocumentViewer(source.document_id, source.chunk_id);
  }, [openDocumentViewer]);

  const handleExportMarkdown = useCallback(() => {
    if (messages.length === 0) return alert("No hay mensajes para exportar.");

    let content = `# Conversación con ${assistant?.name}\n\n`;
    content += `> **Asistente:** ${assistant?.name}\n`;
    content += `> **Fecha:** ${new Date().toLocaleString()}\n`;
    content += `> **ID Conversación:** ${activeConv?.id}\n\n`;
    content += `---\n\n`;

    messages.forEach((m) => {
      const role = m.role === "user" ? "### 👤 TÚ" : `### 🤖 ${assistant?.name || "Asistente"}`;
      content += `${role}\n\n${m.content}\n\n`;
      
      if (m.role === "assistant" && m.sources && m.sources.length > 0) {
        content += `#### 📚 Fuentes Consultadas:\n`;
        const uniqueDocs = new Set();
        m.sources.forEach((s) => {
          const docName = s.document_filename || "Documento";
          if (!uniqueDocs.has(docName)) {
            content += `- **${docName}** (Fragmento #${s.chunk_index})\n`;
            uniqueDocs.add(docName);
          }
        });
        content += `\n`;
      }
      content += `---\n\n`;
    });

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (activeConv?.title || "conversacion").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.download = `chat_${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, assistant, activeConv]);

  if (loading) return <PageLoader />;
  if (!assistant) return null;

  return (
    <div className={styles.layout}>
      {/* Dynamic Ambient Background */}
      <div className={styles.ambientBg} />

      {/* Top Floating Navbar (The "Dynamic Island") */}
      <header className={styles.topNav}>
        <div className={styles.navLeft}>
          <button className="btn btn-icon btn-ghost" onClick={() => router.push("/")} title="Volver al Inicio">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div className={styles.navAssistantWrapper} ref={switcherRef}>
            <button
              className={styles.navAssistant}
              onClick={handleOpenSwitcher}
              title="Cambiar de asistente"
            >
              <div className={styles.navAvatar}>{avatar}</div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span className={styles.navName}>{assistant.name}</span>
                <span className={styles.navStatus}>Online</span>
              </div>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ marginLeft: 4, opacity: 0.5, transform: showSwitcher ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showSwitcher && (
              <div className={styles.switcherDropdown}>
                <div className={styles.switcherHeader}>Mis Asistentes</div>
                {switcherLoading ? (
                  <div className={styles.switcherLoading}>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                  </div>
                ) : userAssistants.length <= 1 ? (
                  <div className={styles.switcherEmpty}>
                    <span>No tienes más asistentes</span>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}
                      onClick={() => { setShowSwitcher(false); router.push('/'); }}
                    >
                      Crear uno nuevo
                    </button>
                  </div>
                ) : (
                  <div className={styles.switcherList}>
                    {userAssistants
                      .filter(a => a.id !== id)
                      .map(a => (
                        <button
                          key={a.id}
                          className={styles.switcherItem}
                          onClick={() => { setShowSwitcher(false); router.push(`/assistants/${a.id}`); }}
                        >
                          <div className={styles.switcherItemAvatar}>
                            {localStorage.getItem(`avatar_${a.id}`) || "❆"}
                          </div>
                          <div className={styles.switcherItemInfo}>
                            <span className={styles.switcherItemName}>{a.name}</span>
                            {a.description && (
                              <span className={styles.switcherItemDesc}>{a.description}</span>
                            )}
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className={styles.navRight}>
          <button className={`btn btn-ghost ${drawer === "history" ? styles.navActive : ""}`} onClick={() => setDrawer(d => d === "history" ? "none" : "history")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span className={styles.navText}>Historial</span>
          </button>
          <button className={`btn btn-ghost ${drawer === "docs" ? styles.navActive : ""}`} onClick={() => setDrawer(d => d === "docs" ? "none" : "docs")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span className={styles.navText}>Docs ({documents.length})</span>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={handleExportMarkdown} title="Exportar Chat (Markdown)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={() => setShowSettings(true)} title="Ajustes">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={() => router.push("/profile")} title="Mi Perfil">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          <div style={{ marginLeft: "0.5rem" }}><ThemeToggle /></div>
          <div className={styles.navUser} onClick={() => router.push("/profile")} style={{ cursor: "pointer" }} title="Ver mi perfil">
            <span className={styles.userName}>
              {profile?.full_name || profile?.email || "..."}
            </span>
          </div>
          <div style={{ marginLeft: "0.5rem" }}><ThemeToggle /></div>
        </div>
      </header>

      {/* Floating Drawers overlay */}
      {drawer !== "none" && (
        <div className={styles.drawerOverlay} onClick={() => setDrawer("none")}>
          <div className={`${styles.drawer} ${styles.reveal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h3 className={styles.drawerTitle}>{drawer === "history" ? "Historial de Chat" : "Base de Conocimiento"}</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setDrawer("none")}>✕</button>
            </div>
            {drawer === "history" ? (
              <ConversationList conversations={conversations} active={activeConv} onSelect={(c) => { handleSelectConv(c); setDrawer("none"); }} onNew={() => { handleNewConversation(); setDrawer("none"); }} onDelete={(c) => setConvToDelete(c)} />
            ) : (
              <DocumentsPanel
                assistantId={id}
                documents={documents}
                onChange={setDocuments}
                onDeleteRequest={setDocToDelete}
                onOpenDocument={(documentId) => openDocumentViewer(documentId)}
                onOpenOriginal={openDocumentOriginal}
                onUploadCompleted={refreshSuggestedQuestions}
              />
            )}
          </div>
        </div>
      )}
      {/* Main Chat Canvas */}
      <main className={styles.chatCanvas}>
        {activeConv ? (
          <ChatPanel
            conversation={activeConv}
            messages={messages}
            suggestions={suggestedQuestions}
            suggestionsLoading={suggestionsLoading}
            suggestionsSource={suggestionsSource}
            seedQuestion={pendingSeedQuestion}
            onSeedQuestionConsumed={() => setPendingSeedQuestion(null)}
            onNewMessage={(msg) => setMessages(prev => [...prev, msg])}
            onUpdateLastMessage={(content) => setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m))}
            onReplaceMessages={setMessages}
            onSourceOpen={handleOpenSource}
            onSend={(q) => startConversationWithSuggestion(q)}
            onStreamFinished={async () => {
              const updated = await api.conversations.list(id);
              setConversations(updated);
            }}
          />
        ) : (
          <div className={styles.emptyCanvas}>
            <div className={styles.emptyCanvasIcon}>✨</div>
            <h2>Lienzo en blanco</h2>
            <p className="text-muted">Inicia una nueva exploración con {assistant.name}</p>
            
            {suggestedQuestions.length > 0 && (
              <div className={styles.initialSuggestions}>
                <p className={styles.suggestionsLabel}>Prueba a preguntar:</p>
                <div className={styles.suggestionsGrid}>
                  {suggestedQuestions.map((q, i) => (
                    <button 
                      key={i} 
                      className={styles.suggestionBubble}
                      onClick={async () => {
                        await handleNewConversation();
                        setPendingSeedQuestion(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button className={`${styles.glowingBtn} mt-6`} onClick={handleNewConversation}>Comenzar ahora</button>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <DeleteConfirmModal
          document={docToDelete}
          onClose={() => setDocToDelete(null)}
          onConfirm={async () => {
            const docId = docToDelete.id;
            setDocToDelete(null);
            try {
              await api.documents.delete(id, docId);
              setDocuments(prev => prev.filter(d => d.id !== docId));
            } catch (err) {
              alert("Error al eliminar el documento.");
            }
          }}
        />
      )}

      {/* Conversation Delete Confirmation Modal */}
      {convToDelete && (
        <DeleteConversationModal
          conversation={convToDelete}
          onClose={() => setConvToDelete(null)}
          onConfirm={async () => {
            const cId = convToDelete.id;
            setConvToDelete(null);
            try {
              await api.conversations.delete(cId);
              setConversations(prev => prev.filter(c => c.id !== cId));
              if (activeConv?.id === cId) {
                setActiveConv(null);
                setMessages([]);
              }
            } catch (err) {
              alert("Error al eliminar la conversación.");
            }
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <EditAssistantModal
          assistant={assistant}
          avatar={avatar}
          onClose={() => setShowSettings(false)}
          onUpdated={(updatedAsst, updatedAvatar) => {
            setAssistant(updatedAsst);
            setAvatar(updatedAvatar);
            localStorage.setItem(`avatar_${id}`, updatedAvatar);
            setShowSettings(false);
          }}
        />
      )}

      {viewerDocument && (
        <DocumentViewerModal
          document={viewerDocument}
          chunks={viewerChunks}
          loading={viewerLoading}
          error={viewerError}
          focusChunkId={viewerFocusChunkId}
          onClose={() => {
            setViewerDocument(null);
            setViewerChunks([]);
            setViewerError("");
            setViewerFocusChunkId(null);
          }}
          onOpenOriginal={() => openDocumentOriginal(viewerDocument.id)}
        />
      )}
    </div>
  );
}

// ── ChatPanel ──────────────────────────────────────────────────────────────────
function ChatPanel({
  conversation, messages, suggestions, suggestionsLoading, suggestionsSource, seedQuestion, onSeedQuestionConsumed, onNewMessage, onUpdateLastMessage, onReplaceMessages, onSourceOpen, onSend, onStreamFinished
}: {
  conversation: Conversation;
  messages: Message[];
  suggestions: string[];
  suggestionsLoading: boolean;
  suggestionsSource: "docs" | "general";
  seedQuestion: string | null;
  onSeedQuestionConsumed: () => void;
  onNewMessage: (m: Message) => void;
  onUpdateLastMessage: (content: string) => void;
  onReplaceMessages: (messages: Message[]) => void;
  onSourceOpen: (source: Source) => void;
  onSend: (content: string) => void;
  onStreamFinished?: () => void;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ 
      behavior: streaming ? "auto" : "smooth",
      block: "end"
    });
  }, [messages, streaming]);

  useEffect(() => {
    const tx = textareaRef.current;
    if (!tx) return;
    tx.style.height = "auto";
    tx.style.height = `${tx.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    if (seedQuestion && !streaming) {
      const q = seedQuestion;
      onSeedQuestionConsumed(); // Consume immediately
      sendContent(q);
    }
  }, [seedQuestion, streaming, onSeedQuestionConsumed]);

  async function sendContent(content: string) {
    if (!content || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "user",
      content,
      sources: [],
      created_at: new Date().toISOString(),
    };
    onNewMessage(userMsg);

    const asstMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "assistant",
      content: "",
      sources: [],
      created_at: new Date().toISOString(),
    };
    onNewMessage(asstMsg);
    setStreaming(true);
    window.dispatchEvent(new CustomEvent("ai-stream-start"));

    try {
      const res = await api.conversations.sendMessage(conversation.id, content);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        let shouldStop = false;
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]" || data === "[ERROR]") {
            shouldStop = true;
            break;
          }
          accumulated += data.replace(/\\n/g, "\n");
          onUpdateLastMessage(accumulated);
        }
        if (shouldStop) break;
      }

      const synced = await api.conversations.messages(conversation.id);
      onReplaceMessages(synced);
    } catch {
      onUpdateLastMessage("⚠️ Error al conectar con el asistente.");
    } finally {
      setStreaming(false);
      window.dispatchEvent(new CustomEvent("ai-stream-end"));
      onStreamFinished?.();
    }
  }

  async function handleSend() {
    const content = input.trim();
    if (content) await sendContent(content);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <h3>{conversation.title || "Nueva conversación"}</h3>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className="empty" style={{ marginTop: "2rem" }}>
            <div className="empty-icon" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✨</div>
            <h3>¡Empieza a chatear!</h3>
            <p className="text-muted">Pregunta cualquier cosa sobre los documentos de este asistente.</p>
            
            {suggestions.length > 0 && (
              <div className={styles.chatSuggestions}>
                <p className={styles.chatSuggestionsLabel}>
                  {suggestionsSource === "docs" ? "Basado en tus documentos:" : "Sugerencias para empezar:"}
                </p>
                <div className={styles.suggestionsGrid}>
                  {suggestions.map((q, i) => (
                    <button 
                      key={i} 
                      className={styles.suggestionBubble}
                      onClick={() => sendContent(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastStreaming={streaming && i === messages.length - 1}
            assistantAvatar={localStorage.getItem(`avatar_${conversation.assistant_id}`) || "✦"}
            onOpenSource={onSourceOpen}
            conversationId={conversation.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputContainer}>
          <textarea
            ref={textareaRef}
            className={`input ${styles.chatInput}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={1}
            disabled={streaming}
            style={{ 
              resize: "none", 
              overflowY: "auto", 
              maxHeight: "80px",
              height: "auto",
              minHeight: "24px"
            }}
          />
          <button
            className={`btn ${styles.sendBtn}`}
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            title="Enviar"
          >
            {streaming ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: "currentColor" }} /> : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Node Stream (No classic bubbles) ──────────────────────────────────────────
function MessageBubble({ message, isLastStreaming, assistantAvatar, onOpenSource, conversationId }: { 
  message: Message; 
  isLastStreaming: boolean; 
  assistantAvatar: string; 
  onOpenSource: (source: Source) => void;
  conversationId: string;
}) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  async function handleFeedback(rating: "up" | "down") {
    if (feedbackLoading) return;
    const newRating = feedback === rating ? null : rating; // toggle off if same
    setFeedback(newRating); // optimistic
    setFeedbackLoading(true);
    try {
      if (newRating) {
        await api.conversations.feedback(conversationId, message.id, newRating);
      }
    } catch {
      setFeedback(feedback); // revert on error
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <div className={`${styles.nodeGroup} ${isUser ? styles.nodeUser : styles.nodeAssistant}`}>
      {!isUser && (
        <div className={styles.nodeAvatarCol}>
          <div className={styles.nodeAvatar}>{assistantAvatar}</div>
          <div className={styles.nodeLine} />
        </div>
      )}
      <div className={styles.nodeContentPane}>
        {isUser && <div className={styles.nodeUserLabel}>Tú</div>}
        {isLastStreaming && message.content === "" ? (
          <div className={styles.thinkingBubble}>
            <div className={styles.thinkingDots}>
              <span /><span /><span />
            </div>
            <span className={styles.thinkingLabel}>Pensando…</span>
          </div>
        ) : (
          <div className={styles.nodeContent}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Feedback buttons — only for completed assistant messages */}
        {!isUser && !isLastStreaming && message.content !== "" && (
          <div className={styles.feedbackRow}>
            <button
              className={`${styles.feedbackBtn} ${feedback === "up" ? styles.feedbackBtnUp : ""}`}
              onClick={() => handleFeedback("up")}
              disabled={feedbackLoading}
              title="Respuesta útil"
            >
              👍
            </button>
            <button
              className={`${styles.feedbackBtn} ${feedback === "down" ? styles.feedbackBtnDown : ""}`}
              onClick={() => handleFeedback("down")}
              disabled={feedbackLoading}
              title="Respuesta poco útil"
            >
              👎
            </button>
            {feedback && (
              <span className={styles.feedbackThanks}>
                {feedback === "up" ? "¡Gracias!" : "Lo tendremos en cuenta"}
              </span>
            )}
          </div>
        )}

        {message.sources.length > 0 && (
          <div className={styles.nodeSources}>
            <button
              className={styles.sourceToggle}
              onClick={() => setShowSources(!showSources)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span>Fuentes ({message.sources.length})</span>
              {showSources ? "▲" : "▼"}
            </button>
            {showSources && message.sources.map((s, i) => (
              <button
                key={`${s.chunk_id}-${i}`}
                type="button"
                className={styles.sourceNodeItem}
                onClick={() => onOpenSource(s)}
                title="Abrir este fragmento en el documento"
              >
                <div className={styles.sourceScore}>
                  {s.document_filename || "Documento"}
                  {typeof s.chunk_index === "number" && s.chunk_index >= 0 ? ` · Fragmento ${s.chunk_index + 1}` : ""}
                  {` · Ref: ${Math.round(s.similarity * 100)}%`}
                </div>
                <p className={styles.sourceText}>{s.content.slice(0, 220)}…</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ── DocumentsPanel ─────────────────────────────────────────────────────────────
function DocumentsPanel({
  assistantId, documents, onChange, onDeleteRequest, onOpenDocument, onOpenOriginal, onUploadCompleted,
}: {
  assistantId: string;
  documents: Document[];
  onChange: (docs: Document[]) => void;
  onDeleteRequest: (doc: Document) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenOriginal: (documentId: string) => void;
  onUploadCompleted: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const doc = await api.documents.upload(assistantId, file);
      onChange([doc, ...documents]);
      onUploadCompleted();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(doc: Document) {
    onDeleteRequest(doc);
  }

  return (
    <div className={styles.docsPanel}>
      <input ref={fileRef} type="file" className="sr-only" id="file-upload" accept=".pdf,.docx,.pptx,.txt,.md" onChange={handleUpload} />
      <label
        htmlFor="file-upload"
        className={`${styles.uploadZone} ${uploading ? styles.uploadZoneUploading : ""}`}
      >
        {uploading ? (
          <><span className="spinner" /> Procesando documento…</>
        ) : (
          <>
            <span className={styles.uploadIcon}>⬆️</span>
            <span className={styles.uploadText}>Subir documento</span>
            <span className="text-xs text-muted">PDF, DOCX, PPTX, TXT, MD</span>
          </>
        )}
      </label>
      {uploadError && <p className="text-xs" style={{ color: "var(--error)", padding: "0.25rem 0" }}>{uploadError}</p>}

      <div className={styles.docList}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted" style={{ padding: "0.5rem" }}>Sin documentos todavía</p>
        ) : documents.map(doc => (
          <div key={doc.id} className={styles.docItem}>
            <span className={styles.docIcon}>{fileIcon(doc.file_type)}</span>
            <button type="button" className={styles.docInfoButton} onClick={() => onOpenDocument(doc.id)} title="Abrir visor del documento">
              <div className={styles.docInfo}>
                <span className={`${styles.docName} truncate`} title={doc.filename}>{doc.filename}</span>
                <div className={styles.docMeta}>
                  <span className={`badge badge-${doc.status}`}>
                    {doc.status === "processing" && <span className="spinner" style={{width:10,height:10}} />}
                    {doc.status}
                  </span>
                  {doc.chunk_count > 0 && (
                    <span className="text-xs text-muted">{doc.chunk_count} chunks</span>
                  )}
                </div>
              </div>
            </button>
            <button
              className="btn btn-icon btn-ghost btn-sm"
              onClick={() => onOpenOriginal(doc.id)}
              title="Abrir archivo original"
            >
              ↗
            </button>
            <button className="btn btn-icon btn-danger btn-sm" onClick={() => handleDelete(doc)} title="Eliminar">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentViewerModal({
  document: doc,
  chunks,
  loading,
  error,
  focusChunkId,
  onClose,
  onOpenOriginal,
}: {
  document: Document;
  chunks: DocumentChunk[];
  loading: boolean;
  error: string;
  focusChunkId: string | null;
  onClose: () => void;
  onOpenOriginal: () => void;
}) {
  useEffect(() => {
    if (!focusChunkId) return;
    const target = window.document.getElementById(`chunk-${focusChunkId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusChunkId, chunks]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`${styles.viewerModal} modal`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{doc.filename}</h2>
            <p className="text-xs text-muted">{chunks.length} fragmentos indexados</p>
          </div>
          <div className={styles.viewerActions}>
            <button type="button" className="btn btn-ghost" onClick={onOpenOriginal}>Abrir original</button>
            <button type="button" className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.viewerBody}>
          {loading && (
            <div className={styles.viewerState}><span className="spinner" /> Cargando contenido…</div>
          )}
          {!loading && error && (
            <div className={styles.viewerState} style={{ color: "var(--error)" }}>{error}</div>
          )}
          {!loading && !error && chunks.length === 0 && (
            <div className={styles.viewerState}>No hay fragmentos para este documento.</div>
          )}
          {!loading && !error && chunks.length > 0 && (
            <div className={styles.viewerChunkList}>
              {chunks.map((chunk) => (
                <article
                  id={`chunk-${chunk.id}`}
                  key={chunk.id}
                  className={`${styles.viewerChunk} ${focusChunkId === chunk.id ? styles.viewerChunkFocused : ""}`}
                >
                  <header className={styles.viewerChunkHeader}>Fragmento {chunk.chunk_index + 1}</header>
                  <p className={styles.viewerChunkText}>{chunk.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fileIcon(type: string): string {
  const icons: Record<string, string> = { pdf: "📕", docx: "📘", pptx: "📙", txt: "📄", md: "📝" };
  return icons[type] ?? "📄";
}

function PageLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: "2rem" }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.5rem",
        boxShadow: "0 0 30px var(--accent-glow)",
        animation: "pulse 1.5s ease-in-out infinite"
      }}>✦</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "min(420px, 80vw)" }}>
        {["70%", "90%", "55%"].map((w, i) => (
          <div key={i} style={{
            height: 12, width: w, borderRadius: 99,
            background: "var(--bg-hover)",
            animation: `shimmer 1.6s ease-in-out ${i * 0.2}s infinite`,
            backgroundImage: "linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%)",
            backgroundSize: "200% 100%"
          }} />
        ))}
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  document, onClose, onConfirm,
}: {
  document: Document;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)" }}>¿Eliminar documento?</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar <strong>{document.filename}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
            Esta acción es irreversible y borrará el archivo del Storage y todos sus datos de la base de datos.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConversationModal({
  conversation, onClose, onConfirm,
}: {
  conversation: Conversation;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)" }}>¿Eliminar conversación?</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar <strong>{conversation.title || "esta conversación"}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
            Se borrarán todos los mensajes de forma permanente en la base de datos.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAssistantModal({
  assistant, avatar, onClose, onUpdated
}: {
  assistant: Assistant;
  avatar: string;
  onClose: () => void;
  onUpdated: (asst: Assistant, avatar: string) => void;
}) {
  const [name, setName] = useState(assistant.name);
  const [desc, setDesc] = useState(assistant.description || "");
  const [inst, setInst] = useState(assistant.instructions);
  const [localAvatar, setLocalAvatar] = useState(avatar);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.assistants.update(assistant.id, {
        name,
        description: desc,
        instructions: inst
      });
      onUpdated(updated, localAvatar);
    } catch (err) {
      alert("Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  const PRESET_AVATARS = [
    "✦", "🤖", "🧠", "✨", "🚀", "💡", "🔮", "👽", "🦉", "⚖️", "💼", "📚",
    "⚽", "🏀", "🎾", "🏎️", "🚗", "✈️", "🚢", "🦁", "🐼", "🌿", "🌊",
    "🛠️", "💻", "📱", "🔋", "🎨", "🎭", "🎸", "📷", "🍕", "☕", "🌍", "🔥"
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h2>Ajustes del Asistente</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>Avatar</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {PRESET_AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setLocalAvatar(a)}
                  style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    fontSize: "1.5rem", background: localAvatar === a ? "var(--bg-active)" : "var(--bg-surface)",
                    border: localAvatar === a ? "2px solid var(--accent)" : "1px solid var(--border)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                    color: "var(--avatar-icon)"
                  }}
                >
                  {a}
                </button>
              ))}
            </div>

            <label className="label">Nombre</label>
            <input required className="input" value={name} onChange={e => setName(e.target.value)} />
            
            <label className="label" style={{ marginTop: "1rem" }}>Descripción corta</label>
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)} />

            <label className="label" style={{ marginTop: "1rem" }}>Instrucciones del Sistema</label>
            <textarea required className="input" rows={4} value={inst} onChange={e => setInst(e.target.value)} style={{ resize: "vertical" }} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConversationList({
  conversations, active, onSelect, onNew, onDelete
}: {
  conversations: Conversation[];
  active: Conversation | null;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
  onDelete: (c: Conversation) => void;
}) {
  return (
    <div className={styles.convList}>
      <button className={`${styles.glowingBtn} w-full mb-4`} onClick={onNew}>
        + Nueva conversación
      </button>
      <div className={styles.convItems}>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">No hay conversaciones</p>
        ) : (
          conversations.map(c => (
            <div 
              key={c.id} 
              className={`${styles.convItem} ${active?.id === c.id ? styles.convActive : ""}`}
              onClick={() => onSelect(c)}
            >
              <div className={styles.convInfo}>
                <span className={styles.convTitle} title={c.title || "Nueva conversación"}>
                  {c.title || "Nueva conversación"}
                </span>
                <span className={styles.convDate}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <button 
                className={styles.convDelete} 
                onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                title="Eliminar conversación"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
