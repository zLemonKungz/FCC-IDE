// models.ts — list the models the FCC gateway can route, for the chat
// settings model picker. The gateway exposes an Anthropic-compatible
// GET /v1/models (the same endpoint the CLI's gateway discovery hits); the
// renderer filters this to the claude-related entries it wants to show.
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';

export interface GatewayModel {
  id: string;
  display_name?: string;
}

export async function listModels(): Promise<GatewayModel[] | null> {
  try {
    const res = await fetch(`${FCC_BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${FCC_AUTH_TOKEN}` }
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: unknown };
    const data = Array.isArray(j?.data) ? j.data : [];
    return data
      .map((m) => m as { id?: unknown; display_name?: unknown })
      .filter((m) => typeof m.id === 'string')
      .map((m) => ({
        id: m.id as string,
        display_name: typeof m.display_name === 'string' ? m.display_name : undefined
      }));
  } catch {
    return null; // gateway offline / not Anthropic-compatible — renderer falls back
  }
}
