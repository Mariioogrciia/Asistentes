"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/api";
import styles from "./login.module.css";

export default function LoginPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Solo redirigir si ya hay sesión y estamos en login
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/");
    });
  }, [router]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });
        if (error) {
          if (error.message.includes("rate limit")) {
            throw new Error("Supabase ha bloqueado el registro por seguridad (límite de intentos). Espera 60 segundos o aumenta los límites en el panel de Supabase.");
          }
          throw error;
        }
        setStatusMessage({ 
          type: "success", 
          text: "¡Registro con éxito! Revisa tu email para confirmar o ya puedes iniciar sesión si la confirmación no es requerida." 
        });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.container}>
      <div className={styles.glow} />
      
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>✦</div>
          <h1>{isSignUp ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h1>
          <p>{isSignUp ? "Empieza a crear tus propios asistentes RAG" : "Accede a tu panel personal"}</p>
        </div>

        <form onSubmit={handleAuth} className={styles.form}>
          {isSignUp && (
            <div className={styles.group}>
              <label htmlFor="fullName">Nombre Completo</label>
              <input
                id="fullName"
                type="text"
                placeholder="Juan Pérez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input"
              />
            </div>
          )}

          <div className={styles.group}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {statusMessage && (
            <div className={statusMessage.type === "success" ? styles.success : styles.error}>
              {statusMessage.text}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Cargando..." : isSignUp ? "Registrarse" : "Entrar"}
          </button>
        </form>

        <div className={styles.footer}>
          <span>{isSignUp ? "¿Ya tienes cuenta?" : "¿No tienes cuenta todavía?"}</span>
          <button 
            type="button" 
            onClick={() => setIsSignUp(!isSignUp)}
            className="btn btn-ghost"
            style={{ padding: "4px 8px", fontSize: "0.875rem" }}
          >
            {isSignUp ? "Inicia sesión" : "Regístrate gratis"}
          </button>
        </div>
      </div>
    </main>
  );
}
