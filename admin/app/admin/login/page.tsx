import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "Acceso al panel",
  robots: { index: false, follow: false },
};

/**
 * Valida el `?next=` del login para que no sirva de redirección abierta:
 * solo se acepta una ruta interna del panel (`/admin…`). Cualquier otra cosa
 * (URL absoluta, `//host`, `javascript:`, valores repetidos) se descarta y el
 * login cae a `/admin`.
 */
function destinoSeguro(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (v.startsWith("//")) return undefined;
  if (!/^\/admin(\/|$|\?)/.test(v)) return undefined;
  // Volver al propio login dejaría al staff otra vez frente al formulario.
  if (/^\/admin\/login(\/|$|\?)/.test(v)) return undefined;
  // Barras invertidas y caracteres de control: los navegadores los
  // reinterpretan al resolver la URL; una ruta legítima nunca los trae.
  for (let i = 0; i < v.length; i++) {
    const codigo = v.charCodeAt(i);
    if (codigo < 0x20 || codigo === 0x7f || codigo === 0x5c) return undefined;
  }
  return v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = destinoSeguro((await searchParams).next);

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-bg px-5">
      <div className="relative w-full max-w-sm">
        <div className="mb-9 text-center">
          <span className="t-display block text-4xl">
            Mundo <span className="t-script text-accent">Motos</span>
          </span>
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">
            Panel interno
          </span>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
