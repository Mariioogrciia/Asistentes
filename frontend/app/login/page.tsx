"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/api";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Redirect if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/");
    });
  }, [router]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert("¡Registro con éxito! Revisa tu email para confirmar (si está activado) o inicia sesión.");
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
