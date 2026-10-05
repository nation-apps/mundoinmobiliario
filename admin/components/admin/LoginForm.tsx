"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * `next` es la ruta a la que se vuelve tras entrar (p. ej. `/admin/chats?c=<id>` cuando la
 * sesión venció dentro de la app instalada). Llega YA validada por
 * `app/admin/login/page.tsx` (solo rutas internas de `/admin`).
 */
export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError("Correo o contraseña incorrectos.");
        setEnviando(false);
        return;
      }
      router.push(next ?? "/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-card p-7">
      <div className="flex flex-col gap-5">
        <div>
          <label className="admin-label" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="admin-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="admin-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent-deep"
          >
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando} className="admin-btn w-full">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </form>
  );
}
