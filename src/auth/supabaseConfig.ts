// La anon key es segura de dejar como constante: está diseñada para ser
// pública, la protección real la da Row Level Security del lado de
// Supabase. La service_role key NUNCA debe aparecer acá.
export const SUPABASE_URL = 'https://mbrxjeureeerpyqqhylt.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icnhqZXVyZWVlcnB5cXFoeWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDkyMjYsImV4cCI6MjEwMjM4NTIyNn0.YFtuH_KfpPqmyEnDUMIynsTepmI4pufVFmH3A5Ngo3Y';

// Tiene que coincidir exactamente con "publisher.name" de package.json —
// VS Code enruta la URI de vuelta a la extensión en base a eso.
export const AUTH_REDIRECT_URL = 'vscode://ScorpkDev.scorpk-agent/auth-callback';

// El login pasa por acá: la extensión abre el navegador a
// `${SCORPK_WEB_URL}/login?from=vscode` y el sitio hace el resto.
export const SCORPK_WEB_URL = 'https://scorpk.tech';
