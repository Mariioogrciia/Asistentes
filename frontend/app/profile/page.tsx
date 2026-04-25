"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase, type Assistant } from "@/lib/api";
import styles from "./profile.module.css";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GalaxyBackground } from "@/components/GalaxyBackground";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit states
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login");
          return;
        }

        const [me, assts] = await Promise.all([
          api.users.me(),
          api.assistants.list()
        ]);
  
        setUser(session.user);
        const p = { ...me, ...me.profile };
        setProfile(p);
        setFullName(p.full_name || "");
        setAvatarUrl(p.avatar_url || "");
        setAssistants(assts);
        
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.users.updateProfile({ 
        full_name: fullName,
        avatar_url: avatarUrl 
      });
      setProfile((prev: any) => ({ ...prev, ...updated }));
      localStorage.setItem("user_profile", JSON.stringify({ ...profile, ...updated }));
      setMessage({ type: "success", text: "Perfil actualizado correctamente" });
    } catch (err) {
      setMessage({ type: "error", text: "Error al actualizar perfil" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loading}>Cargando perfil...</div>;

  return (
    <main className={styles.main}>
      <GalaxyBackground />
      
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo} onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
            <span className={styles.logoMark}>✦</span>
            RAG Assistants
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <ThemeToggle />
            <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")}>
              Volver
            </button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <h1 className={styles.title}>Mi Perfil</h1>
        
        <div className={styles.grid}>
          {/* Settings Section */}
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Ajustes de Cuenta</h2>
            <form onSubmit={handleUpdateProfile} className={styles.form}>
              <div className={styles.avatarPreview}>
                <div className={styles.avatarLarge}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" />
                  ) : (
                    (fullName || user?.email || "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div className={styles.avatarInfo}>
                  <p className={styles.emailText}>{user?.email}</p>
                  <p className={styles.roleBadge}>{profile?.role?.toUpperCase()}</p>
                </div>
              </div>

              <div className="field">
                <label htmlFor="fullName">Nombre Completo</label>
                <input 
                  id="fullName" 
                  className="input" 
                  value={fullName} 
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>

              <div className="field">
                <label htmlFor="avatarUrl">URL de la Foto de Perfil</label>
                <input 
                  id="avatarUrl" 
                  className="input" 
                  value={avatarUrl} 
                  onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://ejemplo.com/foto.jpg"
                />
              </div>

              {message && (
                <div className={message.type === "success" ? styles.success : styles.error}>
                  {message.text}
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </form>
          </section>

          {/* Assistants Section */}
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Mis Asistentes</h2>
              <span className={styles.countBadge}>{assistants.length}</span>
            </div>
            
            <div className={styles.assistantList}>
              {assistants.length === 0 ? (
                <p className={styles.emptyText}>No tienes asistentes creados.</p>
              ) : (
                assistants.map(a => (
                  <div key={a.id} className={styles.assistantItem} onClick={() => router.push(`/assistants/${a.id}`)}>
                    <div className={styles.asstInfo}>
                      <span className={styles.asstIcon}>🤖</span>
                      <div>
                        <div className={styles.asstName}>{a.name}</div>
                        <div className={styles.asstDate}>Creado el {new Date(a.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <span className={styles.arrow}>→</span>
                  </div>
                ))
              )}
            </div>
            
            <button className="btn btn-ghost w-full mt-4" onClick={() => router.push("/")}>
              + Crear nuevo asistente
            </button>
          </section>
        </div>

      </div>
    </main>
  );
}
