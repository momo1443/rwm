// Current three-arm recovery study. Historical condition names remain in the
// database only and are not valid for new participant sessions.
export type Condition = "rmw" | "rmw_no_summary" | "summary_only";
export type Locale = "zh-CN" | "en";
export type CardType = "goal" | "hypothesis" | "evidence" | "constraint" | "path" | "next_action";
export type GoalLevel = "main" | "subgoal" | "suspended";
export type EpistemicStatus = "draft" | "active" | "uncertain" | "expired";
export type RiskTag = "needs_verify" | "inferred" | "source_conflict" | "stale" | "high_impact";
export type RelationType = "supports" | "challenges" | "constrains" | "rejects" | "leads_to";

export interface SourceRef { id: string; kind: "material" | "chat_turn" | "memo_revision" | "user_note"; label: string; excerpt?: string; anchor: string }
export interface ReasoningCard {
  id: string; cardType: CardType; content: Record<Locale, string>; detail: Record<Locale, string>;
  goalLevel?: GoalLevel; parentGoalId?: string; nextAction?: Record<Locale, string>; confidence?: number;
  status: EpistemicStatus; priority: "normal" | "pinned"; riskTags: RiskTag[]; sourceRefs: SourceRef[];
  revision: number; generatedBy: "llm" | "researcher" | "participant"; reviewedByResearcher: boolean;
}
export interface CardRelation { id: string; sourceCardId: string; targetCardId: string; relationType: RelationType; }

export interface ProblemStateCard {
  id: string;
  kind: CardType;
  goalLevel?: GoalLevel;
  content: Record<Locale, string>;
  detail: Record<Locale, string>;
  status: EpistemicStatus;
  priority: "normal" | "pinned";
  confidence: number;
  source: Record<Locale, string>;
  why: Record<Locale, string>;
}

export interface ProblemStateRelation extends CardRelation { confidence?: number; }

export interface ProblemStateSnapshot {
  cards: ProblemStateCard[];
  relations: ProblemStateRelation[];
  capturedAt: string;
}
