import { ToolDef } from '../types';

export const ASK_USER_TOOL_NAME = 'ask_user';

export const askUserTool: ToolDef = {
  name: ASK_USER_TOOL_NAME,
  description:
    'Hacele una pregunta de opción múltiple al usuario cuando necesites que elija entre alternativas concretas ' +
    'antes de continuar (en vez de preguntar en texto plano). El usuario va a poder tocar una de las opciones o ' +
    'escribir su propia respuesta. Usala con moderación, solo cuando la decisión realmente no te corresponde a vos.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'La pregunta a mostrarle al usuario' },
      options: {
        type: 'array',
        description: 'Entre 2 y 5 opciones cortas para elegir. El usuario siempre puede responder algo distinto.',
        items: { type: 'string' },
      },
    },
    required: ['question', 'options'],
  },
  requiresApproval: false,
};
