import type { Locale } from "./rmw-types";

export const researchTaskIds = ["city_policy"] as const;
export type ResearchTaskId = (typeof researchTaskIds)[number];
export type LocalizedText = Record<Locale, string>;

export type PhaseOneGoal = {
  id: string;
  title: LocalizedText;
  criteria: LocalizedText[];
};

export type ResearchMaterial = {
  id: string;
  n: number;
  code: string;
  meta: LocalizedText;
  title: LocalizedText;
  excerpt: LocalizedText;
  recoveryOnly?: boolean;
};

export type ResearchTask = {
  id: ResearchTaskId;
  code: "D" | "E" | "P";
  label: LocalizedText;
  eyebrow: LocalizedText;
  question: LocalizedText;
  description: LocalizedText;
  overview: LocalizedText;
  starterMemo: LocalizedText;
  assistantIntro: LocalizedText;
  familiarity: LocalizedText;
  phaseOneGoals: PhaseOneGoal[];
  materials: ResearchMaterial[];
  recoveryMaterial: ResearchMaterial;
};

// The study stimuli are authored and piloted in Chinese. English UI mode keeps
// the stimulus body in Chinese so translation does not become a hidden factor.
const stimulus = (text: string): LocalizedText => ({ "zh-CN": text, en: text });

function makeMaterial(code: ResearchTask["code"], n: number, title: string, text: string, recoveryOnly = false): ResearchMaterial {
  return {
    id: `${code.toLowerCase()}${n}`,
    n,
    code: `${code}${n}`,
    recoveryOnly,
    meta: {
      "zh-CN": recoveryOnly ? `恢复阶段新增材料 · ${code}${n}` : `实验任务材料 · ${code}${n}`,
      en: recoveryOnly ? `New recovery evidence · ${code}${n}` : `Validated Chinese stimulus · ${code}${n}`,
    },
    title: { "zh-CN": title, en: `${code}${n} · ${title}` },
    excerpt: stimulus(text),
  };
}

const decisionTaskGoals: PhaseOneGoal[] = [
  {
    id: "criteria-options",
    title: { "zh-CN": "目标一：建立标准并比较方案", en: "Goal 1: Establish criteria and compare options" },
    criteria: [
      { "zh-CN": "比较 A、B、C 三个方案", en: "Compare options A, B, and C" },
      { "zh-CN": "覆盖成本、公平、执行、环境和接受度", en: "Cover cost, equity, implementation, environment, and acceptance" },
      { "zh-CN": "说明各标准的权衡而非简单求和", en: "Explain trade-offs rather than simply adding criteria" },
    ],
  },
  {
    id: "tentative-choice",
    title: { "zh-CN": "目标二：形成暂定选择", en: "Goal 2: Form a tentative choice" },
    criteria: [
      { "zh-CN": "选出当前优先方案并说明证据", en: "Select the current preferred option and cite evidence" },
      { "zh-CN": "排除至少一个方案并说明理由", en: "Reject at least one option and explain why" },
      { "zh-CN": "保留与首选方案冲突的证据", en: "Retain evidence that conflicts with the preferred option" },
    ],
  },
  {
    id: "uncertainty",
    title: { "zh-CN": "目标三：界定不确定性与下一步", en: "Goal 3: Define uncertainty and the next step" },
    criteria: [
      { "zh-CN": "明确最可能改变选择的不确定点", en: "Identify the uncertainty most likely to change the choice" },
      { "zh-CN": "说明需要补充的数据", en: "Specify the additional data needed" },
      { "zh-CN": "提出一个现实可行的验证步骤", en: "Propose one feasible validation step" },
    ],
  },
];

const tasks: Record<ResearchTaskId, ResearchTask> = {
  city_policy: {
    id: "city_policy",
    code: "D",
    label: { "zh-CN": "决策任务", en: "Decision task" },
    eyebrow: { "zh-CN": "多标准复杂决策", en: "Multi-criteria decision" },
    question: {
      "zh-CN": "和安市应在未来三年选择哪一种城市生活垃圾治理方案？请在成本、公平性、执行难度、环境收益和居民接受度之间作出可辩护的权衡。",
      en: "Which municipal waste-governance option should He'an adopt for the next three years? Make a defensible trade-off across cost, equity, implementation difficulty, environmental benefit, and resident acceptance.",
    },
    description: { "zh-CN": "比较三个互有优劣的治理方案，并形成暂定选择。", en: "Compare three competing policy options and form a tentative choice." },
    overview: { "zh-CN": "你将阅读 5 份相互冲突的材料。中断后会出现一份可能改变当前选择的新证据。", en: "You will read five conflicting sources. After the interruption, new evidence may change your choice." },
    familiarity: { "zh-CN": "城市公共政策与多标准决策", en: "urban public policy and multi-criteria decision making" },
    starterMemo: {
      "zh-CN": "决策问题：和安市应选择哪一种治理方案？\n\n评价标准及权重：\n\n方案 A：社区增员督导\n\n方案 B：智能投放与按量激励\n\n方案 C：集中式机械分选",
      en: "Decision: Which option should He'an choose?\n\nCriteria and weights:\n\nOption A: community staffing\n\nOption B: smart collection and incentives\n\nOption C: centralized mechanical sorting",
    },
    assistantIntro: { "zh-CN": "我会帮助你比较 A、B、C 三个方案，但不会替你做最终选择。请先告诉我你最看重哪些标准，以及为什么。", en: "I will help compare options A, B, and C without making the final choice for you. Start with the criteria you consider most important and why." },
    phaseOneGoals: decisionTaskGoals,
    materials: [
      makeMaterial("D", 1, "三个候选方案与财政边界", "市政府可在三年内投入不超过 1.8 亿元。方案 A 在 180 个社区增配督导与流动回收车，预计三年成本 1.32 亿元；方案 B 建设智能投放点并按正确投放积分激励，预计 1.65 亿元；方案 C 新建两座集中机械分选中心，预计 1.76 亿元。三项估算均含建设和三年运营，但尚未计入第四年后的设备更新。"),
      makeMaterial("D", 2, "公平性与覆盖差异", "方案 A 能优先覆盖老旧小区并提供面对面帮助，但郊区社区因人员招聘困难，预计只能覆盖 62%。方案 B 覆盖率可达 91%，但需要智能手机绑定，试点中 65 岁以上居民独立完成注册的比例只有 54%。方案 C 不改变居民投放方式，区域覆盖最均衡，但无法改善前端公共空间脏乱问题。"),
      makeMaterial("D", 3, "执行难度与居民接受度", "六个月试点显示：A 的居民满意度为 78%，但督导员年流失率达 31%；B 的满意度为 69%，系统故障使 8% 的投放记录未正确计分；C 的满意度为 74%，但分选中心选址周边居民反对率达 46%，两个候选区均要求追加环境影响评估。不同试点社区的人口结构并不完全可比。"),
      makeMaterial("D", 4, "环境收益模型", "市环科院模型估计，若达到设计处理量，A、B、C 可分别使填埋量下降 18%、29% 和 34%。但 C 的运输里程增加会抵消约 7 个百分点的减排收益；B 的效果高度依赖居民持续使用积分系统；A 的改善较小但模型参数最接近本市既有数据。"),
      makeMaterial("D", 5, "长期运行与部门意见", "城管部门倾向 B，认为数据可用于精细调度；财政部门指出 B 的传感器、平台维护费在第四年后缺乏可靠报价。街道办倾向 A，认为它最容易处理现场争议。生态部门倾向 C，但承认建设审批可能使项目延后 12–18 个月。当前没有一个方案在五项标准上同时占优。"),
    ],
    recoveryMaterial: makeMaterial("D", 6, "新增证据：方案 B 的长期成本", "中断期间收到供应商重新报价：方案 B 的核心传感器质保期由五年缩短为三年，第四至第六年的年度维护费预计为原估算的 2.4 倍。若保持全部点位运行，六年总成本将超过方案 C 约 22%；若削减维护点位，郊区覆盖率预计从 91% 降至 68%。该报价尚未经过独立审计。", true),
  },
};

export const researchTasks = researchTaskIds.map((id) => tasks[id]);

export function isResearchTaskId(value: string | null): value is ResearchTaskId {
  return value !== null && researchTaskIds.includes(value as ResearchTaskId);
}

export function getResearchTask(taskId: ResearchTaskId = "city_policy"): ResearchTask {
  return tasks[taskId];
}

export function getTaskMaterials(taskId: ResearchTaskId, phase: "work" | "recovery") {
  const task = getResearchTask(taskId);
  return phase === "recovery" ? [...task.materials, task.recoveryMaterial] : task.materials;
}

export function researchTaskMetadata(taskId: string) {
  if (!isResearchTaskId(taskId)) return {
    label: taskId === "waste" ? "旧版垃圾分类任务" : taskId,
    initialMaterialCount: 5,
    firstMaterialId: "b1",
    recoveryMaterialId: null,
  };
  const task = getResearchTask(taskId);
  return {
    label: "决策任务（城市治理多标准复杂决策）",
    initialMaterialCount: task.materials.length,
    firstMaterialId: task.materials[0].id,
    recoveryMaterialId: task.recoveryMaterial.id,
  };
}
