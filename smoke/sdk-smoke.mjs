import { query } from '@anthropic-ai/claude-agent-sdk';

const base = process.env.FCC_BASE_URL ?? 'http://127.0.0.1:8082';
const token = process.env.FCC_AUTH_TOKEN ?? 'freecc';
const prompt = process.argv[2] ?? 'Reply with exactly: OK';

const gen = await query({
  prompt,
  options: {
    model: 'claude-haiku-4-5-20251001',
    maxTurns: 5,
    cwd: process.cwd(),
    settingSources: ['local'],
    permissionMode: 'acceptEdits',
    env: {
      ANTHROPIC_BASE_URL: base,
      ANTHROPIC_AUTH_TOKEN: token,
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '256000'
    }
  }
});

let text = '';
for await (const m of gen) {
  if (m.type === 'assistant') {
    text += m.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
}
if (!text.trim()) {
  console.error('SMOKE FAIL: empty reply');
  process.exit(1);
}
console.log('SMOKE OK:', JSON.stringify(text.slice(0, 200)));
