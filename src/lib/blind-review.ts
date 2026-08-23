export const blindReviewRubric = [
  { key: "goal_continuity", label: "目标连续性", description: "最终 memo 是否延续并推进了中断前的核心研究目标。" },
  { key: "reasoning_position", label: "推理位置恢复", description: "是否准确接续已有进展，而非重复、偏题或跳步。" },
  { key: "evidence_integration", label: "证据整合", description: "是否把材料或 AI 证据用于形成可检验的论证。" },
  { key: "uncertainty_preservation", label: "不确定性保留", description: "是否保留待核实、冲突和限制，而非把它们误写成结论。" },
  { key: "actionable_next_step", label: "下一步可执行性", description: "是否形成具体、可执行且与当前目标一致的下一步。" },
] as const;

export type BlindReviewKey = typeof blindReviewRubric[number]["key"];
export type BlindReviewScores = Record<BlindReviewKey, number>;
export type BlindReviewScoreSet = {
  before: BlindReviewScores;
  after: BlindReviewScores;
  // Same rubric, scored against the T1 (pre-interruption) vs T2 (unsupported
  // post-interruption) reasoning probes. Optional: older reviews
  // predate this second pass.
  recallBefore?: BlindReviewScores;
  recallAfter?: BlindReviewScores;
};

export const emptyBlindReviewScores: BlindReviewScores = {
  goal_continuity: 0,
  reasoning_position: 0,
  evidence_integration: 0,
  uncertainty_preservation: 0,
  actionable_next_step: 0,
};

export const blindReviewAnchors = [
  "0 · 无法判断或完全缺失",
  "1 · 明显较差",
  "2 · 部分达到",
  "3 · 基本达到",
  "4 · 明确且充分达到",
] as const;
