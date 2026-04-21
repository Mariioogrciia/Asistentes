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
  const [assistantToDelete, setAssistantToDelete] = useState<Assistant | null>(null);

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
        {/* Landing Hero */}
        <section className={styles.landingHero}>
          <div className={styles.landingBadge}>V2.0 Ya Disponible ✨</div>
          <h1 className={styles.landingTitle}>
            Dale superpoderes a tus <span>documentos</span>
          </h1>
          <p className={styles.landingSubtitle}>
            Crea asistentes de Inteligencia Artificial personalizados. Sube tus PDFs, Word o TXT y chatea con ellos al instante usando tecnología RAG avanzada.
          </p>
          <div className={styles.heroActions}>
            <button 
              className="btn btn-primary btn-lg" 
              onClick={() => {
                if (assistants.length === 0) setShowModal(true);
                else document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Comenzar ahora
            </button>
            <a href="https://github.com/Mariioogrciia/Asistentes" target="_blank" rel="noreferrer" className="btn btn-ghost btn-lg">
              Ver GitHub
            </a>
          </div>
        </section>

        {/* Features */}
        <section className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📁</div>
            <h3 className={styles.featureTitle}>Sube tus Archivos</h3>
            <p className={styles.featureDesc}>PDFs, Docs, PPTX o Markdown. Tu conocimiento centralizado.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚡</div>
            <h3 className={styles.featureTitle}>Búsqueda Vectorial</h3>
            <p className={styles.featureDesc}>Motor RAG ultra-rápido para encontrar respuestas precisas en milisegundos.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>💬</div>
            <h3 className={styles.featureTitle}>Chat en Tiempo Real</h3>
            <p className={styles.featureDesc}>Conversa fluidamente con modelos de IA viendo cómo se genera el texto palabra a palabra.</p>
          </div>
        </section>

        {/* Dashboard Section */}
        <section id="dashboard" className={styles.dashboardSection}>
          <div className={styles.dashboardHeader}>
            <h2>Tus asistentes IA</h2>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + Nuevo asistente
            </button>
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
                onClick={() => router.push(`/assistants/${a.id}`)}
                onDeleteRequest={() => setAssistantToDelete(a)}
              />
            ))}
          </div>
        )}
        </section>
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
      {/* Delete Confirmation Modal */}
      {assistantToDelete && (
        <DeleteAssistantModal
          assistant={assistantToDelete}
          onClose={() => setAssistantToDelete(null)}
          onConfirm={async () => {
            const id = assistantToDelete.id;
            setAssistantToDelete(null);
            try {
              await api.assistants.delete(id);
              setAssistants(prev => prev.filter(x => x.id !== id));
            } catch (err) {
              alert("Error al eliminar el asistente.");
            }
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
  onDeleteRequest,
}: {
  assistant: Assistant;
  style?: React.CSSProperties;
  onClick: () => void;
  onDeleteRequest: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDeleteRequest();
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

// ── DeleteAssistantModal ───────────────────────────────────────────────────────

function DeleteAssistantModal({
  assistant, onClose, onConfirm,
}: {
  assistant: Assistant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false); // Only reached if error, otherwise unmounted
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)" }}>¿Eliminar asistente?</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={isDeleting}>✕</button>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar a <strong>{assistant.name}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
            Esta acción es irreversible. Se borrarán definitivamente todos sus <strong>documentos del Storage, las conversaciones y toda su configuración</strong> de la base de datos.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={isDeleting}>Cancelar</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? <><span className="spinner" /> Eliminando...</> : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
