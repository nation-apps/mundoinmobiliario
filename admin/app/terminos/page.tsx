import type { Metadata } from "next";
import { CORREO_PRIVACIDAD, NEGOCIO_LEGAL, PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Condiciones del servicio" };

export default function Terminos() {
  return (
    <PaginaLegal titulo="Condiciones del servicio">
      <p>
        Al escribirnos por WhatsApp, Messenger o Instagram aceptas estas condiciones. El canal de mensajes de {NEGOCIO_LEGAL}
        sirve para informarte sobre nuestras motos, el crédito, las refacciones y el taller.
      </p>

      <h2>Qué es y qué no es este servicio</h2>
      <ul>
        <li>Es un canal informativo y de atención. Parte de las respuestas las genera un asistente de inteligencia artificial.</li>
        <li>Los precios, existencias, promociones y condiciones de crédito los confirma una persona del equipo antes de cualquier pago.</li>
        <li>La aprobación de un crédito depende de la financiera; lo que se diga por chat no es una aprobación.</li>
      </ul>

      <h2>Uso adecuado</h2>
      <p>
        Te pedimos no enviar contenido ilegal, ofensivo o que suplante a otras personas, y no compartir contraseñas ni datos de
        tarjetas por el chat. Podemos dejar de atender conversaciones que incumplan estas reglas.
      </p>

      <h2>Tus datos</h2>
      <p>
        El tratamiento de tus datos se explica en nuestra <a className="underline" href="/privacidad">política de privacidad</a>.
      </p>

      <h2>Cambios y contacto</h2>
      <p>
        Podemos actualizar estas condiciones y publicaremos la versión vigente en esta página. Para cualquier duda escríbenos a{" "}
        <a className="underline" href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>.
      </p>
    </PaginaLegal>
  );
}
