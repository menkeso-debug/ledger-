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

const MEMBERS = [
  {
    id: 'frugal_planner',
    name: 'The Frugal Planner',
    lens: 'Cash-flow discipline. You care about the gap between income and spend, building an emergency fund, and concrete cuts with dollar amounts. You are skeptical of any plan that does not reduce monthly outflow.',
  },
  {
    id: 'debt_strategist',
    name: 'The Debt Strategist',
    lens: 'Cost of debt. You care about interest and fees, payoff ordering (avalanche vs snowball), utilization, refinancing/consolidation options, and never carrying balances at card APRs. You quantify what debt costs per month.',
  },
  {
    id: 'rewards_optimizer',
    name: 'The Rewards Optimizer',
    lens: 'Points, miles, and status — but honestly weighed against interest costs. You know MQD math, card credits, and when a rewards strategy is actually losing money net of APR.',
  },
  {
    id: 'risk_manager',
    name: 'The Risk Manager',
    lens: 'Downside protection. You care about cash runway, income concentration, what happens if a paycheck stops, insurance gaps, and sequencing decisions to avoid irreversible mistakes.',
  },
];

const memberSystem = (m) =>
  `${ADVISOR_SYSTEM}

You are one member of a financial advisory council: ${m.name}. Your lens: ${m.lens}
Answer the user's question from your lens with concrete numbers from the data. Be direct and take a position — the council synthesizes disagreement, so hedging helps no one. Keep it under 300 words.`;

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

export async function convene(question) {
  const context = await buildBriefingContext();
  const contextBlock = `Data snapshot (deterministic rollups from real transactions):\n\`\`\`json\n${JSON.stringify(context, null, 1)}\n\`\`\``;

  // Stage 1 — independent answers, in parallel
  const answers = await Promise.all(
    MEMBERS.map(async (m) => ({
      member: m,
      answer: await callClaude({
        system: memberSystem(m),
        prompt: `${contextBlock}\n\nQuestion: ${question}`,
      }),
    }))
  );

  // Stage 2 — anonymized peer review: each member ranks all answers
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const anonymized = answers
    .map((a, i) => `### Response ${letters[i]}\n${a.answer}`)
    .join('\n\n');
  const reviews = await Promise.all(
    MEMBERS.map((m) =>
      callClaude({
        system: memberSystem(m),
        prompt: `The council was asked: "${question}"\n\nHere are the anonymized responses (one may be yours):\n\n${anonymized}\n\nRank the responses from best to worst for THIS user's actual situation, with one sentence per response saying what it gets right or wrong. Format: "1. Response X — reason" etc.`,
        maxTokens: 800,
      })
    )
  );

  // Stage 3 — chairman synthesis
  const final = await callClaude({
    system: `${ADVISOR_SYSTEM}

You are the CHAIRMAN of a financial advisory council. Four members answered independently and then peer-reviewed each other's anonymized answers. Synthesize the strongest final recommendation: lead with the decision/answer, incorporate the best points, resolve or explicitly note disagreements ("the council was split on..."), and end with a short ordered action list. Markdown.`,
    prompt: `Question: "${question}"

${contextBlock}

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
      letter: letters[i],
      answer: a.answer,
    })),
    reviews: reviews.map((r, i) => ({ reviewer: MEMBERS[i].name, review: r })),
    final,
  };
}
