"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
  const [verClave, setVerClave] = useState(false);
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
    <form onSubmit={onSubmit} className="admin-card p-6 sm:p-7">
      <div className="flex flex-col gap-5">
        <div>
          <label className="admin-label" htmlFor="email">
            Correo
          </label>
          <div className="relative">
            <Mail size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="admin-input !pl-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </div>
        </div>
        <div>
          <label className="admin-label" htmlFor="password">
            Contraseña
          </label>
          <div className="relative">
            <LockKeyhole size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="password"
              type={verClave ? "text" : "password"}
              required
              autoComplete="current-password"
              className="admin-input !pl-10 !pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              aria-label={verClave ? "Ocultar la contraseña" : "Mostrar la contraseña"}
              aria-pressed={verClave}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted transition-colors hover:text-ink"
            >
              {verClave ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-redline/25 bg-redline/[0.06] px-3 py-2.5 text-sm text-redline">
            <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando} className="admin-btn h-11 w-full">
          {enviando ? "Entrando…" : "Entrar"}
          {!enviando && <ArrowRight size={16} aria-hidden />}
        </button>
      </div>
    </form>
  );
}
