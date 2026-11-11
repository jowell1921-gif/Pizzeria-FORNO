import type { AssistantClient, AssistantReply } from "./assistant-client";

/**
 * Respuestas de DEMOSTRACIÓN. No hay ninguna IA detrás: se elige un texto fijo según palabras clave
 * y se lleva al cliente a la página que tiene la información real. No contienen precios, horarios
 * ni condiciones del negocio. Se sustituirán al conectar un modelo real (etapa 2).
 */
const ACCENTS = new RegExp("[\u0300-\u036f]", "g");
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(ACCENTS, "");

interface Rule {
  keywords: string[];
  reply: Omit<AssistantReply, "provisional">;
}

const RULES: Rule[] = [
  {
    keywords: ["promo", "oferta", "cupon", "descuento", "combo"],
    reply: {
      text: "Las promociones y los cupones disponibles están siempre actualizados en su página, con sus fechas y condiciones.",
      links: [{ label: "Ver promociones", href: "/promociones" }],
    },
  },
  {
    keywords: ["recomiend", "popular", "favorit", "mejor", "que pido", "sugier"],
    reply: {
      text: "Para decidirte, mira los productos populares de la carta: son los que más piden nuestros clientes.",
      links: [{ label: "Ver la carta", href: "/carta" }],
    },
  },
  {
    keywords: ["reparto", "domicilio", "envio", "entrega", "recoger", "recogida"],
    reply: {
      text: "Puedes pedir para recoger o a domicilio. El reparto depende de tu código postal: se comprueba, junto con el coste y el tiempo estimado, al preparar el pedido.",
      links: [{ label: "Empezar un pedido", href: "/carta" }],
    },
  },
  {
    keywords: ["punto", "club", "premio", "recompensa"],
    reply: {
      text: "Con FORNO CLUB acumulas puntos con tus pedidos y los canjeas por recompensas.",
      links: [{ label: "Conocer FORNO CLUB", href: "/forno-club" }],
    },
  },
  {
    keywords: ["pizza", "carta", "menu", "tenei", "teneis", "entrante", "bebida", "postre"],
    reply: {
      text: "Nuestra carta tiene pizzas, entrantes, bebidas y postres, con ingredientes y alérgenos en cada producto.",
      links: [{ label: "Ver la carta", href: "/carta" }],
    },
  },
];

const FALLBACK: Omit<AssistantReply, "provisional"> = {
  text: "Todavía soy una versión de demostración y no puedo responder a eso. Puedes preguntarme por las pizzas, las promociones, el reparto o FORNO CLUB.",
};

export function demoReply(text: string): AssistantReply {
  const query = normalize(text);
  const rule = RULES.find((candidate) =>
    candidate.keywords.some((keyword) => query.includes(keyword)),
  );
  return { ...(rule?.reply ?? FALLBACK), provisional: true };
}

/** Cliente de demostración: responde tras una breve pausa para que se aprecie el «escribiendo…». */
export function createDemoAssistant(delayMs = 900): AssistantClient {
  return {
    send(_history, text, signal) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(demoReply(text)), delayMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  };
}
