"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { COLUMNAS_AGENDA, alertaDe, contarAlertas, hitoDe, type EventoAgenda } from "@/lib/admin/agenda";

const CLAVE_AVISADOS = "mm-agenda-avisados";
const CADA_MS = 5 * 60_000;
/** Con más avisos nuevos que esto a la vez, se junta todo en un solo mensaje. */
const MAX_AVISOS_SEPARADOS = 2;

function leerAvisados(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_AVISADOS) ?? "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

function guardarAvisados(valor: Record<string, true>): void {
  try {
    // Solo se recuerdan los de los últimos tiempos: la lista no crece sin fin.
    const entradas = Object.keys(valor).slice(-400);
    localStorage.setItem(CLAVE_AVISADOS, JSON.stringify(Object.fromEntries(entradas.map((k) => [k, true]))));
  } catch {
    // Sin almacenamiento solo se repite el aviso al recargar.
  }
}

/**
 * Las alertas de la agenda: cuántos eventos piden atención (vencidos, de hoy, de mañana o de los próximos 3 días) y un aviso
 * emergente una sola vez por punto (3 días antes, 1 día antes, hoy, vencido). La administración ve los de todos; el resto, los
 * suyos y los que no tienen dueño. Devuelve cuántos hay para la insignia del menú.
 */
export function useAlertasAgenda(usuarioId: string, rol: string): number {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      // Lo vencido y lo que viene en los próximos 4 días (el aviso de 3 días antes cae dentro).
      const hasta = new Date(Date.now() + 4 * 86_400_000).toISOString();
      let consulta = supabase.from("agenda").select(COLUMNAS_AGENDA).eq("estado", "pendiente").lte("fecha_hora", hasta).limit(100);
      if (rol !== "admin") consulta = consulta.or(`asignada_a.eq.${usuarioId},asignada_a.is.null`);
      const { data, error } = await consulta;
      if (!vivo || error) return; // sin la tabla (migración 0011 sin correr) no hay alertas, y no pasa nada
      setEventos((data ?? []) as EventoAgenda[]);
      setAhora(Date.now());
    }
    const primera = setTimeout(() => void cargar(), 0);
    const cada = setInterval(() => void cargar(), CADA_MS);
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canal = supabase
      .channel(`agenda-alertas-${sufijo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda" }, () => void cargar())
      .subscribe();
    return () => {
      vivo = false;
      clearTimeout(primera);
      clearInterval(cada);
      void supabase.removeChannel(canal);
    };
  }, [supabase, usuarioId, rol]);

  // Avisos emergentes: uno por evento y punto, y se recuerdan para no repetirlos al recargar.
  useEffect(() => {
    if (eventos.length === 0) return;
    const avisados = leerAvisados();
    const nuevos = eventos.flatMap((e) => {
      const hito = hitoDe(e, ahora);
      return hito && !avisados[`${e.id}:${hito}`] ? [{ evento: e, clave: `${e.id}:${hito}` }] : [];
    });
    if (nuevos.length === 0) return;
    for (const n of nuevos) avisados[n.clave] = true;
    guardarAvisados(avisados);

    const ir = { label: "Ver agenda", onClick: () => routerRef.current.push("/admin/calendario") };
    if (nuevos.length > MAX_AVISOS_SEPARADOS) {
      toast(`Tienes ${nuevos.length} pendientes en la agenda`, { action: ir, duration: 12_000 });
      return;
    }
    for (const { evento } of nuevos) {
      const texto = alertaDe(evento, ahora).texto;
      toast(`${texto}: ${evento.titulo}`, { action: ir, duration: 12_000 });
    }
  }, [eventos, ahora]);

  return contarAlertas(eventos, ahora);
}
