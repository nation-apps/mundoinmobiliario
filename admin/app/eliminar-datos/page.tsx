import type { Metadata } from "next";
import { CORREO_PRIVACIDAD, NEGOCIO_LEGAL, PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Eliminación de datos" };

export default function EliminarDatos() {
  const asunto = encodeURIComponent("Solicitud de eliminación de datos");
  return (
    <PaginaLegal titulo="Eliminación de tus datos">
      <p>
        Si hablaste con {NEGOCIO_LEGAL} por WhatsApp, Messenger o Instagram, o llenaste un formulario de un anuncio nuestro, y quieres que borremos tu información, puedes
        pedirlo de cualquiera de estas dos formas:
      </p>

      <h2>Por el mismo chat</h2>
      <p>Escribe «quiero eliminar mis datos» en la conversación. Un asesor te confirmará la solicitud.</p>

      <h2>Por correo</h2>
      <p>
        Escribe a{" "}
        <a className="underline" href={`mailto:${CORREO_PRIVACIDAD}?subject=${asunto}`}>{CORREO_PRIVACIDAD}</a> con el asunto
        «Solicitud de eliminación de datos» e indica el número de WhatsApp o el nombre de perfil con el que nos escribiste.
      </p>

      <h2>Qué eliminamos</h2>
      <ul>
        <li>Tu ficha de contacto (nombre, teléfono o identificador, correo y la moto que buscabas).</li>
        <li>El historial de mensajes y los archivos que enviaste.</li>
      </ul>
      <p>
        Procesamos la solicitud en un máximo de 30 días y te avisamos cuando esté completa. Más información en la{" "}
        <a className="underline" href="/privacidad">política de privacidad</a>.
      </p>
    </PaginaLegal>
  );
}
