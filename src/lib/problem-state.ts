import type {
  CardRelation,
  Locale,
  ProblemStateCard,
  ProblemStateSnapshot,
  ReasoningCard,
  SourceRef,
} from "./rmw-types";

const STORAGE_KEY = "rmw-problem-state";

function sourceRef(card: ProblemStateCard, locale: Locale): SourceRef {
  const label = card.source[locale];
  const normalized = label.toLowerCase();
  const kind = normalized.includes("chat") || label.includes("对话")
    ? "chat_turn"
    : normalized.includes("memo")
      ? "memo_revision"
      : normalized.includes("material") || label.includes("材料")
        ? "material"
        : "user_note";
  return { id: `${card.id}-source`, kind, label, excerpt: card.detail[locale], anchor: `${card.id}-source` };
}

export function toReasoningCards(snapshot: ProblemStateSnapshot, locale: Locale): ReasoningCard[] {
  const mainGoalId = snapshot.cards.find((card) => card.goalLevel === "main")?.id;
  return snapshot.cards.map((card) => ({
    id: card.id,
    cardType: card.kind,
    goalLevel: card.goalLevel,
    parentGoalId: card.goalLevel && card.goalLevel !== "main" ? mainGoalId : undefined,
    content: card.content,
    detail: card.detail,
    confidence: card.confidence,
    status: card.status,
    priority: card.priority,
    riskTags: [
      ...(card.status === "uncertain" || card.confidence < 50 ? ["needs_verify" as const] : []),
      ...(card.confidence < 70 ? ["inferred" as const] : []),
    ],
    sourceRefs: [sourceRef(card, locale)],
    revision: 1,
    generatedBy: "llm",
    reviewedByResearcher: false,
  }));
}

export function toCardRelations(snapshot: ProblemStateSnapshot): CardRelation[] {
  return snapshot.relations.map((relation) => ({
    id: relation.id,
    sourceCardId: relation.sourceCardId,
    targetCardId: relation.targetCardId,
    relationType: relation.relationType,
  }));
}

export function problemStateToContinuousSummary(cards: ProblemStateCard[], locale: Locale) {
  return cards
    .map((card) => `${card.content[locale]}。${card.detail[locale]}`)
    .join("\n\n");
}

export function readProblemStateSnapshot(): ProblemStateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as ProblemStateSnapshot | null;
  } catch {
    return null;
  }
}

export function saveProblemStateSnapshot(snapshot: ProblemStateSnapshot | null) {
  if (typeof window === "undefined") return;
  if (snapshot) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  else sessionStorage.removeItem(STORAGE_KEY);
}
