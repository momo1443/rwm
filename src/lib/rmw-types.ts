// Single-protocol characterization study: every participant runs the same
// condition. The literal-union (rather than a plain string) lets the
// compiler flag any leftover branch that still checks for a retired
// condition value.
export type Condition = "rmw";
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
