"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Assistant } from "@/lib/api";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.assistants.list()
      .then(setAssistants)
      .catch((err) => setError("Error al conectar con el servidor (¿Está el backend encendido?)"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>✦</span>
            <span>RAG Assistants</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Nuevo asistente
          </button>
        </div>
      </header>

      {/* Content */}
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1>Tus asistentes IA</h1>
          <p>Crea asistentes con sus propios documentos y chatea con ellos.</p>
        </div>

        {loading ? (
          <div className={styles.loadingGrid}>
            {[1,2,3].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : error ? (
          <div className="empty">
            <div className="empty-icon" style={{ opacity: 1 }}>⚠️</div>
            <h3>{error}</h3>
            <p>Abre la consola para más detalles o inicia el servidor de FastAPI.</p>
          </div>
        ) : assistants.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🤖</div>
            <h3>Sin asistentes todavía</h3>
            <p>Crea tu primer asistente para empezar a chatear con tus documentos.</p>
            <button className="btn btn-primary btn-lg" style={{marginTop: "1rem"}} onClick={() => setShowModal(true)}>
              Crear primer asistente
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {assistants.map((a, i) => (
              <AssistantCard
                key={a.id}
                assistant={a}
                style={{ animationDelay: `${i * 50}ms` }}
                onDelete={() => setAssistants(prev => prev.filter(x => x.id !== a.id))}
                onClick={() => router.push(`/assistants/${a.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <CreateAssistantModal
          onClose={() => setShowModal(false)}
          onCreated={(a) => {
            setAssistants(prev => [a, ...prev]);
            setShowModal(false);
            router.push(`/assistants/${a.id}`);
          }}
        />
      )}
    </main>
  );
}

// ── AssistantCard ──────────────────────────────────────────────────────────────

function AssistantCard({
  assistant,
  style,
  onClick,
  onDelete,
}: {
  assistant: Assistant;
  style?: React.CSSProperties;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${assistant.name}" y todos sus datos?`)) return;
    setDeleting(true);
    await api.assistants.delete(assistant.id);
    onDelete();
  }

  return (
    <div
      className={`card ${styles.assistantCard}`}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <div className={styles.cardTop}>
        <div className={styles.avatar}>
          {assistant.name.charAt(0).toUpperCase()}
        </div>
        <button
          className={`btn btn-icon btn-danger btn-sm ${styles.deleteBtn}`}
          onClick={handleDelete}
          disabled={deleting}
          title="Eliminar asistente"
        >
          {deleting ? <span className="spinner" style={{width:14,height:14}} /> : "✕"}
        </button>
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{assistant.name}</h3>
        {assistant.description && (
          <p className={`text-sm text-secondary truncate ${styles.cardDesc}`}>{assistant.description}</p>
        )}
      </div>
      <div className={styles.cardFooter}>
        <span className="text-xs text-muted">
          {new Date(assistant.created_at).toLocaleDateString("es-ES")}
        </span>
        <span className={styles.chatBtn}>Chat →</span>
      </div>
    </div>
  );
}

// ── CreateAssistantModal ───────────────────────────────────────────────────────

function CreateAssistantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (a: Assistant) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(
    "Eres un asistente útil y preciso. Responde siempre basándote en los documentos proporcionados. Si no encuentras la información en los documentos, indícalo claramente."
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) return;
    setLoading(true);
    setError("");
    try {
      const a = await api.assistants.create({ name, description: description || undefined, instructions });
      onCreated(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nuevo asistente</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="field">
            <label htmlFor="name">Nombre *</label>
            <input id="name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Asistente Legal" required />
          </div>
          <div className="field">
            <label htmlFor="desc">Descripción</label>
            <input id="desc" className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional — para qué sirve este asistente" />
          </div>
          <div className="field">
            <label htmlFor="instr">Instrucciones (system prompt) *</label>
            <textarea id="instr" className="textarea" value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} required />
          </div>
          {error && <p className="text-sm" style={{color: "var(--error)"}}>{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? <><span className="spinner" />Creando...</> : "Crear asistente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
