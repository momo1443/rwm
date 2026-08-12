import { NextResponse } from "next/server";
import { z } from "zod";
import { getResearchTask, researchTaskIds } from "@/lib/research-task";

const requestSchema = z.object({
  taskId: z.enum(researchTaskIds),
  locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
  memo: z.string().max(20000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(8000),
  })).max(60),
  actions: z.array(z.object({
    type: z.string().max(100),
    stage: z.string().max(100),
    targetType: z.string().max(100).optional(),
    targetId: z.string().max(200).optional(),
    sequenceNumber: z.number().int().nonnegative(),
    payload: z.record(z.string(), z.unknown()),
    at: z.string().max(100),
  })).max(80).default([]),
});

const cardSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["goal", "hypothesis", "evidence", "constraint", "path", "next_action"]),
  goalLevel: z.enum(["main", "subgoal", "suspended"]).optional(),
  content: z.string().min(1).max(1000),
  detail: z.string().min(1).max(2000),
  status: z.enum(["active", "uncertain", "expired"]),
  priority: z.enum(["normal", "pinned"]),
  confidence: z.number().min(0).max(100),
  source: z.string().min(1).max(1000),
  why: z.string().min(1).max(1000),
});

const relationSchema = z.object({
  id: z.string().min(1).max(80),
  sourceCardId: z.string().min(1).max(80),
  targetCardId: z.string().min(1).max(80),
  relationType: z.enum(["supports", "challenges", "constrains", "rejects", "leads_to"]),
  confidence: z.number().min(0).max(100),
});

const extractionSchema = z.object({
  cards: z.array(cardSchema).min(2).max(12),
  relations: z.array(relationSchema).max(20),
}).superRefine((value, context) => {
  const cardIds = new Set(value.cards.map((card) => card.id));
  value.relations.forEach((relation, index) => {
    if (!cardIds.has(relation.sourceCardId) || !cardIds.has(relation.targetCardId)) {
      context.addIssue({
        code: "custom",
        path: ["relations", index],
        message: "Relation references a missing card",
      });
    }
  });
});

type Extraction = z.infer<typeof extractionSchema>;
type ParticipantMessage = { role: "user" | "assistant"; text: string };

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
});

type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };

function parseJsonObject(content: string): unknown {
  const unfenced = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object");
  return JSON.parse(unfenced.slice(start, end + 1));
}

function validateExtraction(content: string | null) {
  if (!content) return { success: false as const, issues: ["empty_content"] };
  try {
    const result = extractionSchema.safeParse(parseJsonObject(content));
    if (result.success) return { success: true as const, data: result.data };
    return {
      success: false as const,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.join(".") || "root";
        if (path === "cards" && issue.code === "too_big") return "cards must contain no more than 12 items";
        if (path === "cards" && issue.code === "too_small") return "cards must contain at least 2 items";
        if (path === "relations" && issue.code === "too_big") return "relations must contain no more than 20 items";
        return `${path}:${issue.code}`;
      }).slice(0, 12),
    };
  } catch {
    return { success: false as const, issues: ["invalid_json"] };
  }
}

function sanitizeExtraction(extraction: Extraction, messages: ParticipantMessage[]): Extraction | null {
  const assistantTurns = new Set(messages.flatMap((message, index) => message.role === "assistant" ? [index + 1] : []));
  const participantSource = /memo|user|participant|用户|参与者|action|操作/i;
  const kindPriority = { goal: 6, next_action: 5, hypothesis: 4, evidence: 3, constraint: 2, path: 1 } as const;
  const cardsByContent = new Map<string, Extraction["cards"][number]>();

  extraction.cards.forEach((original) => {
    const sourceTurns = Array.from(original.source.matchAll(/(?:chat\s*turn|对话(?:轮次)?)\s*(\d+)/gi), (match) => Number(match[1]));
    const assistantOnly = sourceTurns.some((turn) => assistantTurns.has(turn)) && !participantSource.test(original.source);
    const taskContextOnly = /task\s*question|任务问题|研究问题题干/i.test(original.source)
      && !(original.kind === "goal" && original.goalLevel === "main");
    if (assistantOnly || taskContextOnly) return;

    const card = original.kind === "goal" ? original : { ...original, goalLevel: undefined };
    const key = card.content.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const existing = cardsByContent.get(key);
    if (!existing || kindPriority[card.kind] > kindPriority[existing.kind]) cardsByContent.set(key, card);
  });

  const cards = Array.from(cardsByContent.values());
  if (cards.length < 2 || cards.filter((card) => card.kind === "goal" && card.goalLevel === "main").length !== 1) return null;
  const cardIds = new Set(cards.map((card) => card.id));
  const relations = extraction.relations.filter((relation) =>
    cardIds.has(relation.sourceCardId) && cardIds.has(relation.targetCardId));
  return { cards, relations };
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid extraction request" }, { status: 400 });

  const { taskId, locale, memo, messages, actions } = parsed.data;
  const task = getResearchTask(taskId);
  const hasParticipantMemo = memo.trim() !== task.starterMemo[locale].trim();
  const hasParticipantMessage = messages.some((message) => message.role === "user" && message.text.trim().length > 0);
  if (!hasParticipantMemo && !hasParticipantMessage) {
    return NextResponse.json({
      mode: "insufficient",
      message: "No participant-authored memo or chat content was available for extraction.",
    });
  }
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      mode: "unavailable",
      message: "No server-side DeepSeek key; no problem state was generated.",
    });
  }

  const transcript = messages.map((message, index) => `${index + 1}. ${message.role}: ${message.text}`).join("\n");
  const actionTrace = actions.map((action) => {
    const target = [action.targetType, action.targetId].filter(Boolean).join(":");
    const payload = Object.keys(action.payload).length ? ` ${JSON.stringify(action.payload)}` : "";
    return `${action.sequenceNumber}. ${action.type}${target ? ` (${target})` : ""}${payload}`;
  }).join("\n");
  const outputLanguage = locale === "zh-CN" ? "简体中文" : "English";
  const systemPrompt = `You extract a participant's prospective reasoning state immediately before an interruption.

Return JSON only, with this shape:
{"cards":[{"id":"...","kind":"goal|hypothesis|evidence|constraint|path|next_action","goalLevel":"main|subgoal|suspended","content":"...","detail":"...","status":"active|uncertain|expired","priority":"normal|pinned","confidence":0,"source":"...","why":"..."}],"relations":[{"id":"...","sourceCardId":"...","targetCardId":"...","relationType":"supports|challenges|constrains|rejects|leads_to","confidence":0}]}

Rules:
- Write all card text in ${outputLanguage}.
- Treat the participant-authored memo and user chat turns as the only evidence of reasoning content.
- Assistant turns provide conversational context only. Do not convert an assistant suggestion into participant state unless a later user turn or memo explicitly adopts it.
- A participant not rejecting an assistant suggestion does not count as adopting it.
- Use the action trace only to infer attention, progress, sequence, and the last active step. Opening a material or checking a criterion never means the participant agrees with a claim.
- The task question provides context for the main goal only. Do not add evidence, constraints, hypotheses, or conclusions that appear only in the task materials.
- Never use or infer a hidden answer key. Do not label any framing as the strongest or correct one.
- Include exactly one main goal. Add only the subgoals, hypotheses, evidence, constraints, suspended goals, rejected paths, and next action that the participant trace supports.
- Return 4 to 10 cards when the participant trace supports them, and never return more than 12 cards. Prefer fewer, non-duplicative cards over splitting one idea into several cards.
- Never create placeholder cards such as "not reliably identified" merely to fill a category. Omit unsupported categories instead.
- Use goalLevel only for kind "goal"; omit goalLevel from all other card kinds.
- Every card must include id, kind, content, detail, status, priority, confidence, source, and why. Every relation must include confidence.
- A rejected path may be status "expired" only when the participant explicitly rejected it. A next action may be inferred from the last active step only when marked "uncertain" with confidence at most 40.
- Use short, specific cards. Cite sources such as "memo: 已排除的方向", "chat turn 4", "action 12: material_opened", or "材料 A4". Do not fabricate source locations.
- All candidates require participant calibration. Set the main goal and next action priority to "pinned"; others default to "normal".
- Build the knowledge network only from the extracted cards. Do not create extra nodes.
- Add relations only when the participant trace supports them. Use confidence at most 40 for inferred relations.
- The network should show only relations supported by the participant trace; an empty relation list is valid.
- Keep content concise: card content no more than 32 Chinese characters or 18 English words; detail no more than 70 Chinese characters or 45 English words.`;

  const userPrompt = `Task question:
${task.question[locale]}

Participant memo:
${memo || "(empty)"}

Conversation:
${transcript || "(empty)"}

Research action trace (progress signals only, not evidence of belief):
${actionTrace || "(empty)"}`;

  const baseUrl = process.env.DEEPSEEK_BASE_URL || process.env.LLM_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL || "deepseek-v4-flash";

  try {
    const requestCompletion = async (providerMessages: ProviderMessage[]) => {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          messages: providerMessages,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: 0,
          max_tokens: 3200,
        }),
      });
      if (!response.ok) throw new Error(`provider_status_${response.status}`);
      const completion = completionSchema.safeParse(await response.json());
      if (!completion.success) return { content: null, finishReason: "invalid_envelope" };
      return {
        content: completion.data.choices[0].message.content,
        finishReason: completion.data.choices[0].finish_reason || "unknown",
      };
    };

    const baseMessages: ProviderMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    const first = await requestCompletion(baseMessages);
    let acceptedContent = first.content;
    let extraction = validateExtraction(first.content);

    if (!extraction.success) {
      console.warn("Problem State extraction retry", { finishReason: first.finishReason, issues: extraction.issues });
      const repairPrompt = `The previous JSON output did not satisfy the required shape. Validation issues: ${extraction.issues.join(", ")}.
Return one corrected JSON object only. The cards array must contain 2 to 12 cards; aim for 4 to 10 concise, non-duplicative cards. The relations array must contain at most 20 relations and may be empty. Preserve only participant-supported content. Do not add placeholder cards.`;
      const repairMessages: ProviderMessage[] = first.content
        ? [...baseMessages, { role: "assistant", content: first.content }, { role: "user", content: repairPrompt }]
        : [...baseMessages, { role: "user", content: repairPrompt }];
      const repaired = await requestCompletion(repairMessages);
      acceptedContent = repaired.content;
      extraction = validateExtraction(repaired.content);
      if (!extraction.success) {
        console.warn("Problem State extraction invalid after retry", { finishReason: repaired.finishReason, issues: extraction.issues });
        return NextResponse.json({ error: "Invalid extraction output after retry" }, { status: 502 });
      }
    }

    let participantState = sanitizeExtraction(extraction.data, messages);
    if (!participantState) {
      const semanticRepair = await requestCompletion([
        ...baseMessages,
        { role: "assistant", content: acceptedContent || "{}" },
        { role: "user", content: "Return corrected JSON with 2 to 12 cards; aim for 4 to 10 concise, non-duplicative cards. Remove assistant-only suggestions and duplicate cards. Include exactly one participant-supported main goal and at least one additional participant-supported card." },
      ]);
      const repairedState = validateExtraction(semanticRepair.content);
      participantState = repairedState.success ? sanitizeExtraction(repairedState.data, messages) : null;
      if (!participantState) return NextResponse.json({ error: "No valid participant-grounded extraction" }, { status: 502 });
    }

    return NextResponse.json({
      mode: "live",
      provider: "deepseek",
      model,
      promptVersion: "rmw_state_and_network_extraction_v6_bounded_cards",
      cards: participantState.cards,
      relations: participantState.relations,
    });
  } catch {
    return NextResponse.json({ error: "DeepSeek extraction failed" }, { status: 502 });
  }
}
