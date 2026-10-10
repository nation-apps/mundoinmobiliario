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
    <main className="relative flex min-h-svh items-center justify-center bg-pit px-5 py-12">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="t-display flex size-14 items-center justify-center rounded-2xl bg-accent text-[26px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(43,80,236,0.7)]"
          >
            <span className="-skew-x-[9deg]">MM</span>
          </span>
          <span className="t-titulo mt-5 block text-[34px] text-white">
            Mundo <span className="t-script text-[#93a6ff]">Motos</span>
          </span>
          <span className="t-mono mt-2 block text-[10.5px] uppercase tracking-[0.2em] text-white/45">
            Panel de ventas · TVS Motor Cancún
          </span>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
