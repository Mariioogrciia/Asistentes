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
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
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

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Error al conectar con Google");
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

        <div className={styles.divider}>o continúa con</div>

        <button 
          type="button" 
          onClick={handleGoogleLogin} 
          disabled={loading} 
          className={styles.googleBtn}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
            />
          </svg>
          Google
        </button>

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
