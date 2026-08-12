export type SurveyAnswer = Record<string, number>;

export type SurveyItemMeta = {
  id: string;
  label: string;
  group: "AI 使用经验" | "AILS-CCS" | "研究基线";
  subscale?: string;
  anchors?: string[];
};

const agreement = ["非常不同意", "不同意", "一般", "同意", "非常同意"];
const confidence = ["完全没信心", "较没信心", "一般", "较有信心", "非常有信心"];
const familiarity = ["完全不符合", "较不符合", "一般", "较符合", "非常符合"];

export const surveyItems: SurveyItemMeta[] = [
  { id: "ai_use_frequency", group: "AI 使用经验", label: "近 3 个月生成式 AI 使用频率", anchors: ["从未", "少于每周 1 次", "每周 1–2 次", "每周 3–4 次", "每周 5 天及以上"] },
  { id: "ai_use_duration", group: "AI 使用经验", label: "持续使用生成式 AI 的时长", anchors: ["从未使用", "不足 3 个月", "3–6 个月", "7–12 个月", "超过 1 年"] },
  { id: "ai_task_breadth", group: "AI 使用经验", label: "使用 AI 的学习或科研任务类型数", anchors: ["0 类", "1 类", "2 类", "3 类", "4 类及以上"] },
  { id: "ai_research_frequency", group: "AI 使用经验", label: "研究写作中的 AI 使用频率", anchors: ["从未", "很少", "有时", "经常", "几乎每次任务"] },
  { id: "ails_awareness_1", group: "AILS-CCS", subscale: "认知", label: "理解人工智能的定义", anchors: agreement },
  { id: "ails_awareness_2", group: "AILS-CCS", subscale: "认知", label: "熟悉人工智能基本原理", anchors: agreement },
  { id: "ails_awareness_3", group: "AILS-CCS", subscale: "认知", label: "理解人工智能如何感知并执行任务", anchors: agreement },
  { id: "ails_awareness_4", group: "AILS-CCS", subscale: "认知", label: "能比较人工智能相关概念", anchors: agreement },
  { id: "ails_usage_1", group: "AILS-CCS", subscale: "使用", label: "能熟练使用人工智能产品", anchors: agreement },
  { id: "ails_usage_2", group: "AILS-CCS", subscale: "使用", label: "能用人工智能解决日常问题", anchors: agreement },
  { id: "ails_usage_3", group: "AILS-CCS", subscale: "使用", label: "能用人工智能辅助学习", anchors: agreement },
  { id: "ails_evaluation_1", group: "AILS-CCS", subscale: "评价", label: "能从 AI 方案中选择适当方案", anchors: agreement },
  { id: "ails_evaluation_2", group: "AILS-CCS", subscale: "评价", label: "能评价人工智能产品的局限", anchors: agreement },
  { id: "ails_evaluation_3", group: "AILS-CCS", subscale: "评价", label: "能识别人工智能生成内容中的偏见", anchors: agreement },
  { id: "ails_evaluation_4", group: "AILS-CCS", subscale: "评价", label: "对人工智能生成内容保持谨慎", anchors: agreement },
  { id: "ails_ethics_1", group: "AILS-CCS", subscale: "伦理", label: "使用人工智能时遵守伦理原则", anchors: agreement },
  { id: "ails_ethics_2", group: "AILS-CCS", subscale: "伦理", label: "关注隐私与信息安全", anchors: agreement },
  { id: "ails_ethics_3", group: "AILS-CCS", subscale: "伦理", label: "能反思人工智能的个人与社会影响", anchors: agreement },
  { id: "ails_ethics_4", group: "AILS-CCS", subscale: "伦理", label: "警惕人工智能技术被滥用", anchors: agreement },
  { id: "research_self_efficacy_1", group: "研究基线", subscale: "研究任务自我效能", label: "界定可研究问题的信心", anchors: confidence },
  { id: "research_self_efficacy_2", group: "研究基线", subscale: "研究任务自我效能", label: "比较不同问题框架的信心", anchors: confidence },
  { id: "research_self_efficacy_3", group: "研究基线", subscale: "研究任务自我效能", label: "提出假设并指出不确定性的信心", anchors: confidence },
  { id: "research_self_efficacy_4", group: "研究基线", subscale: "研究任务自我效能", label: "设计可行验证方案的信心", anchors: confidence },
  { id: "topic_familiarity_1", group: "研究基线", subscale: "议题先验熟悉度", label: "熟悉所分配研究任务的议题", anchors: familiarity },
  { id: "topic_familiarity_2", group: "研究基线", subscale: "议题先验熟悉度", label: "读过或讨论过相关案例", anchors: familiarity },
  { id: "topic_familiarity_3", group: "研究基线", subscale: "议题先验熟悉度", label: "能解释所分配议题的基本问题", anchors: familiarity },
];

export const scoredSubscales = ["认知", "使用", "评价", "伦理", "研究任务自我效能", "议题先验熟悉度"] as const;

export function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function subscaleScores(answers: SurveyAnswer | null) {
  return Object.fromEntries(scoredSubscales.map((subscale) => [
    subscale,
    mean(surveyItems.filter((item) => item.subscale === subscale).map((item) => answers?.[item.id]).filter((value): value is number => typeof value === "number")),
  ])) as Record<(typeof scoredSubscales)[number], number | null>;
}

export function answerLabel(item: SurveyItemMeta, value: number | undefined) {
  if (!value) return "未作答";
  return item.anchors?.[value - 1] ? `${value} · ${item.anchors[value - 1]}` : String(value);
}
