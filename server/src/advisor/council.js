import { anthropic, ADVISOR_SYSTEM } from './anthropic.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { buildBriefingContext } from './briefing.js';

// LLM Council (karpathy/llm-council pattern) for big financial decisions:
//   Stage 1 — N council members answer independently (blind to each other)
//   Stage 2 — each member reviews the anonymized set and ranks it
//   Stage 3 — a chairman synthesizes the final recommendation, noting dissent
//
// Members are currently distinct Claude personas (only ANTHROPIC_API_KEY is
// configured). The member list is data, not code — adding a GPT/Gemini member
// later means adding a provider call, nothing structural.

// Each seat has a persona lens AND a provider — a real multi-model council
// when OpenAI/Gemini keys are configured; seats fall back to Claude otherwise.
const MEMBERS = [
  {
    id: 'frugal_planner',
    name: 'The Frugal Planner',
    provider: 'openai',
    lens: 'Cash-flow discipline. You care about the gap between income and spend, building an emergency fund, and concrete cuts with dollar amounts. You are skeptical of any plan that does not reduce monthly outflow.',
  },
  {
    id: 'debt_strategist',
    name: 'The Debt Strategist',
    provider: 'anthropic',
    lens: 'Cost of debt. You care about interest and fees, payoff ordering (avalanche vs snowball), utilization, refinancing/consolidation options, and never carrying balances at card APRs. You quantify what debt costs per month.',
  },
  {
    id: 'rewards_optimizer',
    name: 'The Rewards Optimizer',
    provider: 'gemini',
    lens: 'Points, miles, and status — but honestly weighed against interest costs. You know MQD math, card credits, and when a rewards strategy is actually losing money net of APR.',
  },
  {
    id: 'risk_manager',
    name: 'The Risk Manager',
    provider: 'anthropic',
    lens: 'Downside protection. You care about cash runway, income concentration, what happens if a paycheck stops, insurance gaps, and sequencing decisions to avoid irreversible mistakes.',
  },
];

const memberPersona = (m) =>
  `You are one member of a financial advisory council: ${m.name}. Your lens: ${m.lens}
Answer the user's question from your lens with concrete numbers from the data. Be direct and take a position — the council synthesizes disagreement, so hedging helps no one. Keep it under 300 words.`;

// `system` is [sharedBlock, roleBlock]: the shared block (advisor framing +
// data snapshot) is identical across every call of a convene() and carries
// cache_control, so Claude caches it once and the other ~8 calls read it.
// OpenAI/Gemini cache identical prefixes automatically for the same reason.
async function callClaude({ system, prompt, maxTokens = 1500 }) {
  const stream = anthropic().messages.stream({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const message = await stream.finalMessage();
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const systemAsText = (system) =>
  Array.isArray(system) ? system.map((b) => b.text).join('\n\n') : system;

async function callOpenAI({ system, prompt, maxTokens = 1500 }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify({
      model: config.openai.model,
      max_completion_tokens: maxTokens * 4, // reasoning models spend tokens thinking
      messages: [
        { role: 'system', content: systemAsText(system) },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai returned empty content');
  return text;
}

async function callGemini({ system, prompt, maxTokens = 1500 }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.gemini.apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemAsText(system) }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens * 4 },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('gemini returned empty content');
  return text;
}

const PROVIDERS = {
  anthropic: { call: callClaude, label: () => `Claude (${config.anthropic.model})`, available: () => !!config.anthropic.apiKey },
  openai: { call: callOpenAI, label: () => `ChatGPT (${config.openai.model})`, available: () => !!config.openai.apiKey },
  gemini: { call: callGemini, label: () => `Gemini (${config.gemini.model})`, available: () => !!config.gemini.apiKey },
};

// Call the member's provider; fall back to Claude if unavailable or erroring —
// a broken seat must never sink the whole deliberation.
async function callMember(member, args) {
  const provider = PROVIDERS[member.provider];
  if (provider?.available() && member.provider !== 'anthropic') {
    try {
      const text = await provider.call(args);
      return { text, providerLabel: provider.label() };
    } catch (err) {
      log.warn(`council seat ${member.id} (${member.provider}) failed, falling back to Claude`, err);
    }
  }
  return { text: await callClaude(args), providerLabel: PROVIDERS.anthropic.label() };
}

export async function convene(question) {
  const context = await buildBriefingContext();
  const contextBlock = `Data snapshot (deterministic rollups from real transactions):\n\`\`\`json\n${JSON.stringify(context, null, 1)}\n\`\`\``;
  // Shared prefix for every call in this convene — cached once, read ~8 times.
  const sharedBlock = {
    type: 'text',
    text: `${ADVISOR_SYSTEM}\n\n${contextBlock}`,
    cache_control: { type: 'ephemeral' },
  };
  const memberSystem = (m) => [sharedBlock, { type: 'text', text: memberPersona(m) }];

  // Stage 1 — independent answers, in parallel, each on its own provider
  const answers = await Promise.all(
    MEMBERS.map(async (m) => {
      const r = await callMember(m, {
        system: memberSystem(m),
        prompt: `Question: ${question}`,
      });
      return { member: m, answer: r.text, providerLabel: r.providerLabel };
    })
  );

  // Stage 2 — anonymized peer review: each member ranks all answers
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const anonymized = answers
    .map((a, i) => `### Response ${letters[i]}\n${a.answer}`)
    .join('\n\n');
  const reviews = await Promise.all(
    MEMBERS.map((m) =>
      callMember(m, {
        system: memberSystem(m),
        prompt: `The council was asked: "${question}"\n\nHere are the anonymized responses (one may be yours):\n\n${anonymized}\n\nRank the responses from best to worst for THIS user's actual situation, with one sentence per response saying what it gets right or wrong. Format: "1. Response X — reason" etc.`,
        maxTokens: 800,
      }).then((r) => r.text)
    )
  );

  // Stage 3 — chairman synthesis
  const final = await callClaude({
    system: [sharedBlock, {
      type: 'text',
      text: `You are the CHAIRMAN of a financial advisory council. Four members answered independently and then peer-reviewed each other's anonymized answers. Synthesize the strongest final recommendation: lead with the decision/answer, incorporate the best points, resolve or explicitly note disagreements ("the council was split on..."), and end with a short ordered action list. Markdown.`,
    }],
    prompt: `Question: "${question}"

Member answers:
${answers.map((a, i) => `### ${a.member.name} (Response ${letters[i]})\n${a.answer}`).join('\n\n')}

Peer reviews:
${reviews.map((r, i) => `### Review by ${MEMBERS[i].name}\n${r}`).join('\n\n')}`,
    maxTokens: 2500,
  });

  log.info('council convened', { question: question.slice(0, 80) });
  return {
    question,
    members: answers.map((a, i) => ({
      id: a.member.id,
      name: a.member.name,
      provider: a.providerLabel,
      letter: letters[i],
      answer: a.answer,
    })),
    reviews: reviews.map((r, i) => ({ reviewer: MEMBERS[i].name, review: r })),
    final,
  };
}
