// Client ID de la OAuth App pública creada en
// https://huggingface.co/settings/applications/new (sin client secret — no
// hace falta, es seguro embeberlo).
export const HUGGINGFACE_CLIENT_ID = '253cc440-5291-45ea-bb2e-279cb1435e18';

// Debe coincidir exactamente con la redirect URI registrada en la OAuth App.
export const HUGGINGFACE_REDIRECT_URL = 'vscode://ScorpkDev.scorpk-agent/hf-callback';

export const HUGGINGFACE_SCOPES = 'openid profile inference-api';
