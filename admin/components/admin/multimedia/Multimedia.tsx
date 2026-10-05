"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Biblioteca de archivos que el bot puede mandar por WhatsApp (la imagen del
 * temario, video del seminario…). Cada archivo lleva una NOTA: «cuándo debe
 * enviarla el bot». El bot lee esa nota en cada conversación, así que un
 * cambio aquí vale al instante, sin republicar nada.
 *
 * Todo corre con la sesión del staff: las políticas de Supabase (RLS)
 * deciden quién puede subir, editar o borrar.
 */

export type ItemMultimedia = {
  id: string;
  nombre: string;
  tipo: "image" | "video" | "audio" | "document";
  storage_path: string;
  descripcion_uso: string;
  caption: string | null;
  activo: boolean;
};

const TIPO_LABEL: Record<ItemMultimedia["tipo"], string> = {
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Documento",
};

/** Límites de WhatsApp para enviar por enlace (con margen). */
const LIMITES: { mime: string; tipo: ItemMultimedia["tipo"]; maxMB: number; ext: string }[] = [
  { mime: "image/jpeg", tipo: "image", maxMB: 5, ext: "jpg" },
  { mime: "image/png", tipo: "image", maxMB: 5, ext: "png" },
  { mime: "video/mp4", tipo: "video", maxMB: 16, ext: "mp4" },
  { mime: "application/pdf", tipo: "document", maxMB: 16, ext: "pdf" },
];

const EJEMPLO_TEMARIO = {
  nombre: "Temario del programa",
  nota:
    "Cuando el cliente pide más información de un programa, mándalo y pregúntale qué quiere lograr. " +
    "No prometas resultados ni precios que no estén en el documento.",
  caption: "Temario · Mundo Inmobiliario",
};

export default function Multimedia({ items, urlBase }: { items: ItemMultimedia[]; urlBase: string }) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [caption, setCaption] = useState("");
  const [activo, setActivo] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  function usarEjemploTemario() {
    setNombre(EJEMPLO_TEMARIO.nombre);
    setNota(EJEMPLO_TEMARIO.nota);
    setCaption(EJEMPLO_TEMARIO.caption);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return toast.error("Elige el archivo (imagen JPG o PNG, video MP4 o PDF).");
    const regla = LIMITES.find((l) => l.mime === archivo.type);
    if (!regla) return toast.error("Ese tipo de archivo no sirve para WhatsApp. Usa JPG, PNG, MP4 o PDF.");
    if (archivo.size > regla.maxMB * 1024 * 1024) return toast.error(`Pesa demasiado: el máximo para este tipo es ${regla.maxMB} MB.`);
    if (nombre.trim().length < 2) return toast.error("Ponle un nombre.");
    if (nota.trim().length < 10) return toast.error("Escribe cuándo debe enviarlo el bot (al menos una frase).");

    setSubiendo(true);
    const supabase = createBrowserSupabase();
    const ruta = `${crypto.randomUUID()}.${regla.ext}`;
    try {
      const { error: errSubida } = await supabase.storage.from("plantillas-media").upload(ruta, archivo, {
        contentType: archivo.type,
        upsert: false,
      });
      if (errSubida) throw errSubida;

      const { error: errFila } = await supabase.from("plantillas_media").insert({
        nombre: nombre.trim(),
        tipo: regla.tipo,
        storage_path: ruta,
        descripcion_uso: nota.trim(),
        caption: caption.trim() || null,
        activo,
      });
      if (errFila) {
        // Sin fila el archivo quedaría huérfano en el almacenamiento.
        await supabase.storage.from("plantillas-media").remove([ruta]);
        throw errFila;
      }

      toast.success(activo ? "Listo: el bot ya puede enviarlo." : "Guardado (apagado: el bot todavía no lo usa).");
      setArchivo(null);
      setNombre("");
      setNota("");
      setCaption("");
      if (archivoRef.current) archivoRef.current.value = "";
      router.refresh();
    } catch (err) {
      console.error("[multimedia] no se pudo guardar:", err);
      toast.error("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section aria-labelledby="titulo-nuevo">
        <form onSubmit={guardar} className="admin-card flex flex-col gap-4 p-5">
          <div>
            <h2 id="titulo-nuevo" className="t-display text-xl">
              Agregar un archivo
            </h2>
            <p className="mt-1 text-sm text-muted">
              El bot lo manda por WhatsApp cuando la nota de abajo dice que toca. Sirve para un temario, un video del seminario o un PDF.
            </p>
          </div>

          <button type="button" onClick={usarEjemploTemario} className="admin-btn ghost self-start">
            Usar el ejemplo del temario
          </button>

          <label className="flex flex-col gap-1.5">
            <span className="admin-label">Archivo (JPG, PNG, MP4 o PDF)</span>
            <input
              ref={archivoRef}
              type="file"
              accept="image/jpeg,image/png,video/mp4,application/pdf"
              onChange={(ev) => setArchivo(ev.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="admin-label">Nombre</span>
            <input value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={80} placeholder="Temario del programa" className="admin-input" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="admin-label">Nota para el bot: ¿cuándo debe enviarlo?</span>
            <textarea
              value={nota}
              onChange={(ev) => setNota(ev.target.value)}
              rows={5}
              maxLength={600}
              placeholder="Cuando el cliente pida más información del programa, mándalo y pregúntale qué quiere lograr…"
              className="admin-input"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="admin-label">Texto que acompaña al archivo (opcional)</span>
            <input value={caption} onChange={(ev) => setCaption(ev.target.value)} maxLength={200} className="admin-input" />
          </label>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={activo} onChange={(ev) => setActivo(ev.target.checked)} className="size-4 accent-[#1d1315]" />
            Activo (el bot ya puede usarlo)
          </label>

          <button type="submit" disabled={subiendo} className="admin-btn">
            {subiendo ? "Subiendo…" : "Guardar"}
          </button>
        </form>
      </section>

      <section aria-labelledby="titulo-lista">
        <h2 id="titulo-lista" className="t-display mb-4 text-xl">
          Lo que el bot puede enviar
        </h2>
        {items.length === 0 ? (
          <p className="admin-card px-6 py-12 text-center text-sm text-muted">
            Todavía no hay nada. Empieza con el temario de tus programas: toca «Usar el ejemplo del temario», sube el archivo y guarda.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((it) => (
              <Fila key={it.id} item={it} urlBase={urlBase} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fila({ item, urlBase }: { item: ItemMultimedia; urlBase: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [nota, setNota] = useState(item.descripcion_uso);
  const [caption, setCaption] = useState(item.caption ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [seguro, setSeguro] = useState(false);

  async function actualizar(cambios: Partial<Pick<ItemMultimedia, "nombre" | "descripcion_uso" | "caption" | "activo">>, ok: string) {
    setOcupado(true);
    const { data, error } = await createBrowserSupabase().from("plantillas_media").update(cambios).eq("id", item.id).select("id");
    setOcupado(false);
    // Una escritura bloqueada por RLS no da error: simplemente no toca ninguna fila.
    if (error || !data?.length) {
      toast.error("No se guardó el cambio. Inténtalo de nuevo.");
      return false;
    }
    toast.success(ok);
    router.refresh();
    return true;
  }

  async function eliminar() {
    setOcupado(true);
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from("plantillas_media").delete().eq("id", item.id).select("id");
    if (error || !data?.length) {
      setOcupado(false);
      toast.error("No se pudo eliminar.");
      return;
    }
    await supabase.storage.from("plantillas-media").remove([item.storage_path]);
    setOcupado(false);
    toast.success("Eliminado.");
    router.refresh();
  }

  const url = `${urlBase}${item.storage_path}`;

  return (
    <li className={`admin-card flex gap-4 p-4 ${item.activo ? "" : "opacity-60"}`}>
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Abrir ${item.nombre}`}>
        {item.tipo === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.nombre} className="size-24 border border-line object-cover" />
        ) : (
          <span className="flex size-24 items-center justify-center border border-dashed border-line text-[10px] uppercase tracking-[0.12em] text-muted">
            {TIPO_LABEL[item.tipo]}
          </span>
        )}
      </a>

      <div className="min-w-0 flex-1">
        {editando ? (
          <div className="flex flex-col gap-2.5">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className="admin-input" aria-label="Nombre" />
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} maxLength={600} className="admin-input" aria-label="Nota para el bot" />
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Texto que acompaña (opcional)" className="admin-input" />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={ocupado || nombre.trim().length < 2 || nota.trim().length < 10}
                onClick={async () => {
                  if (await actualizar({ nombre: nombre.trim(), descripcion_uso: nota.trim(), caption: caption.trim() || null }, "Cambios guardados.")) setEditando(false);
                }}
                className="admin-btn"
              >
                Guardar
              </button>
              <button type="button" onClick={() => setEditando(false)} className="admin-btn ghost">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-medium text-ink">{item.nombre}</h3>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{TIPO_LABEL[item.tipo]}</span>
              {!item.activo && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a82f2f]">Apagado</span>}
            </div>
            <p className="mt-1.5 text-sm text-ink-soft">
              <span className="admin-label !mb-0">Nota para el bot: </span>
              {item.descripcion_uso}
            </p>
            {item.caption && <p className="mt-1 text-xs text-muted">Acompaña: “{item.caption}”</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => actualizar({ activo: !item.activo }, item.activo ? "Apagado: el bot ya no lo usa." : "Activado: el bot ya puede usarlo.")}
                className="admin-btn ghost"
              >
                {item.activo ? "Apagar" : "Activar"}
              </button>
              <button type="button" onClick={() => setEditando(true)} className="admin-btn ghost">
                Editar
              </button>
              {seguro ? (
                <>
                  <button type="button" disabled={ocupado} onClick={eliminar} className="admin-btn !bg-[#a82f2f] !border-[#a82f2f]">
                    Sí, eliminar
                  </button>
                  <button type="button" onClick={() => setSeguro(false)} className="admin-btn ghost">
                    No
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setSeguro(true)} className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a82f2f]">
                  Eliminar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
