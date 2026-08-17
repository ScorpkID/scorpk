import { ToolDef } from '../types';

const MAX_CHARS = 40000;

export const fetchUrlTool: ToolDef = {
  name: 'fetch_url',
  description:
    'Trae el contenido de texto de una URL pública (documentación de una librería, un issue de GitHub, etc.) y ' +
    'lo devuelve legible, sin HTML. Útil cuando el pedido se basa en algo de afuera del workspace. Solo GET.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'URL completa (con http:// o https://)' } },
    required: ['url'],
  },
  requiresApproval: true,
};

export async function fetchUrlHandler(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '');
  if (!/^https?:\/\//i.test(url)) {
    return 'Error: la URL tiene que empezar con http:// o https://';
  }

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET' });
  } catch (err: any) {
    return `Error al traer la URL: ${err?.message ?? String(err)}`;
  }
  if (!response.ok) {
    return `Error: la URL respondió con estado ${response.status}.`;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  const text = contentType.includes('html') ? htmlToText(raw) : raw;

  if (text.length > MAX_CHARS) {
    return text.slice(0, MAX_CHARS) + `\n\n(Recortado a ${MAX_CHARS} caracteres.)`;
  }
  return text;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
