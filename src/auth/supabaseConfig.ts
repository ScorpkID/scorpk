// La anon key es segura de dejar como constante: está diseñada para ser
// pública, la protección real la da Row Level Security del lado de
// Supabase. La service_role key NUNCA debe aparecer acá.
export const SUPABASE_URL = 'https://mbrxjeureeerpyqqhylt.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icnhqZXVyZWVlcnB5cXFoeWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDkyMjYsImV4cCI6MjEwMjM4NTIyNn0.YFtuH_KfpPqmyEnDUMIynsTepmI4pufVFmH3A5Ngo3Y';

export const AUTH_REDIRECT_URL = 'vscode://scorpk.scorpk/auth-callback';
