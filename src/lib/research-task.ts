import type { Locale } from "./rmw-types";

export const researchTaskIds = ["city_policy", "ai_course_policy", "night_transit"] as const;
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

const commonGoals = (kind: "decision" | "argument" | "design"): PhaseOneGoal[] => {
  if (kind === "argument") return [
    {
      id: "thesis",
      title: { "zh-CN": "目标一：形成暂定论点", en: "Goal 1: Form a tentative thesis" },
      criteria: [
        { "zh-CN": "提出清晰、可修正的暂定论点", en: "State a clear, revisable tentative thesis" },
        { "zh-CN": "界定论点适用的课程或情境范围", en: "Define the courses or contexts to which it applies" },
        { "zh-CN": "区分规范判断与材料中的经验主张", en: "Distinguish normative judgments from empirical claims" },
      ],
    },
    {
      id: "evidence-synthesis",
      title: { "zh-CN": "目标二：综合支持与冲突证据", en: "Goal 2: Synthesize supporting and conflicting evidence" },
      criteria: [
        { "zh-CN": "使用至少三份材料支持或限定论点", en: "Use at least three sources to support or qualify the thesis" },
        { "zh-CN": "处理至少一项相互冲突的证据", en: "Address at least one piece of conflicting evidence" },
        { "zh-CN": "排除一个解释并说明材料依据", en: "Reject one interpretation and explain the evidence basis" },
      ],
    },
    {
      id: "unresolved-question",
      title: { "zh-CN": "目标三：保留可验证的不确定性", en: "Goal 3: Preserve a testable uncertainty" },
      criteria: [
        { "zh-CN": "明确当前最关键的未解决问题", en: "Identify the most important unresolved question" },
        { "zh-CN": "说明什么新证据会改变当前立场", en: "State what new evidence would change the position" },
        { "zh-CN": "给出下一步核查方式", en: "Specify the next verification step" },
      ],
    },
  ];
  if (kind === "design") return [
    {
      id: "requirements",
      title: { "zh-CN": "目标一：界定目标与约束", en: "Goal 1: Define goals and constraints" },
      criteria: [
        { "zh-CN": "明确服务目标与优先用户", en: "Define the service goal and priority users" },
        { "zh-CN": "列出预算、安全、无障碍等关键约束", en: "List key budget, safety, and accessibility constraints" },
        { "zh-CN": "说明约束之间的主要冲突", en: "Explain the main conflicts among constraints" },
      ],
    },
    {
      id: "architecture",
      title: { "zh-CN": "目标二：比较并形成当前方案", en: "Goal 2: Compare and form a current design" },
      criteria: [
        { "zh-CN": "比较至少两个服务架构", en: "Compare at least two service architectures" },
        { "zh-CN": "形成一个包含运营时段与人员安排的当前方案", en: "Form a current design with hours and staffing" },
        { "zh-CN": "排除至少一个方案并说明理由", en: "Reject at least one design and explain why" },
      ],
    },
    {
      id: "stress-test",
      title: { "zh-CN": "目标三：识别风险并规划修改", en: "Goal 3: Identify risks and plan a revision" },
      criteria: [
        { "zh-CN": "明确当前方案尚未解决的问题", en: "Identify an unresolved issue in the current design" },
        { "zh-CN": "说明用什么指标检验方案", en: "Specify metrics for testing the design" },
        { "zh-CN": "提出一个最小的下一步修改", en: "Propose one minimum next modification" },
      ],
    },
  ];
  return [
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
};

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
      "zh-CN": "决策问题：和安市应选择哪一种治理方案？\n\n评价标准及权重：\n\n方案 A：社区增员督导\n\n方案 B：智能投放与按量激励\n\n方案 C：集中式机械分选\n\n当前首选及理由：\n\n已排除方案及理由：\n\n当前不确定点：",
      en: "Decision: Which option should He'an choose?\n\nCriteria and weights:\n\nOption A: community staffing\n\nOption B: smart collection and incentives\n\nOption C: centralized mechanical sorting\n\nCurrent preference and rationale:\n\nRejected option and rationale:\n\nCurrent uncertainty:",
    },
    assistantIntro: { "zh-CN": "我会帮助你比较 A、B、C 三个方案，但不会替你做最终选择。请先告诉我你最看重哪些标准，以及为什么。", en: "I will help compare options A, B, and C without making the final choice for you. Start with the criteria you consider most important and why." },
    phaseOneGoals: commonGoals("decision"),
    materials: [
      makeMaterial("D", 1, "三个候选方案与财政边界", "市政府可在三年内投入不超过 1.8 亿元。方案 A 在 180 个社区增配督导与流动回收车，预计三年成本 1.32 亿元；方案 B 建设智能投放点并按正确投放积分激励，预计 1.65 亿元；方案 C 新建两座集中机械分选中心，预计 1.76 亿元。三项估算均含建设和三年运营，但尚未计入第四年后的设备更新。"),
      makeMaterial("D", 2, "公平性与覆盖差异", "方案 A 能优先覆盖老旧小区并提供面对面帮助，但郊区社区因人员招聘困难，预计只能覆盖 62%。方案 B 覆盖率可达 91%，但需要智能手机绑定，试点中 65 岁以上居民独立完成注册的比例只有 54%。方案 C 不改变居民投放方式，区域覆盖最均衡，但无法改善前端公共空间脏乱问题。"),
      makeMaterial("D", 3, "执行难度与居民接受度", "六个月试点显示：A 的居民满意度为 78%，但督导员年流失率达 31%；B 的满意度为 69%，系统故障使 8% 的投放记录未正确计分；C 的满意度为 74%，但分选中心选址周边居民反对率达 46%，两个候选区均要求追加环境影响评估。不同试点社区的人口结构并不完全可比。"),
      makeMaterial("D", 4, "环境收益模型", "市环科院模型估计，若达到设计处理量，A、B、C 可分别使填埋量下降 18%、29% 和 34%。但 C 的运输里程增加会抵消约 7 个百分点的减排收益；B 的效果高度依赖居民持续使用积分系统；A 的改善较小但模型参数最接近本市既有数据。"),
      makeMaterial("D", 5, "长期运行与部门意见", "城管部门倾向 B，认为数据可用于精细调度；财政部门指出 B 的传感器、平台维护费在第四年后缺乏可靠报价。街道办倾向 A，认为它最容易处理现场争议。生态部门倾向 C，但承认建设审批可能使项目延后 12–18 个月。当前没有一个方案在五项标准上同时占优。"),
    ],
    recoveryMaterial: makeMaterial("D", 6, "新增证据：方案 B 的长期成本", "中断期间收到供应商重新报价：方案 B 的核心传感器质保期由五年缩短为三年，第四至第六年的年度维护费预计为原估算的 2.4 倍。若保持全部点位运行，六年总成本将超过方案 C 约 22%；若削减维护点位，郊区覆盖率预计从 91% 降至 68%。该报价尚未经过独立审计。", true),
  },
  ai_course_policy: {
    id: "ai_course_policy",
    code: "E",
    label: { "zh-CN": "伦理任务", en: "Ethics task" },
    eyebrow: { "zh-CN": "证据综合与论证构建", en: "Evidence synthesis and argument construction" },
    question: { "zh-CN": "大学是否应该限制生成式 AI 在课程学习与考核中的使用？请综合证据形成有条件、可反驳的立场。", en: "Should universities restrict generative AI in coursework and assessment? Synthesize the evidence into a conditional, falsifiable position." },
    description: { "zh-CN": "综合学习、诚信、可及性、自主性、评价效度和教师负担方面的证据。", en: "Synthesize evidence on learning, integrity, accessibility, agency, assessment validity, and faculty workload." },
    overview: { "zh-CN": "你将阅读 6 份立场和方法各异的材料。中断后会增加一份可能反驳当前论点的新研究。", en: "You will read six sources with differing positions and methods. A potentially disconfirming study appears after interruption." },
    familiarity: { "zh-CN": "生成式 AI 在大学教学与考核中的使用", en: "the use of generative AI in university teaching and assessment" },
    starterMemo: {
      "zh-CN": "论证问题：大学是否应该限制生成式 AI？\n\n暂定论点：\n\n支持证据：\n\n冲突证据：\n\n适用范围：\n\n已排除解释：\n\n当前不确定点：",
      en: "Argument question: Should universities restrict generative AI?\n\nTentative thesis:\n\nSupporting evidence:\n\nConflicting evidence:\n\nScope:\n\nRejected interpretation:\n\nCurrent uncertainty:",
    },
    assistantIntro: { "zh-CN": "我会帮助你综合相互冲突的证据，但不会替你写最终论证。你可以先提出一个暂定立场，并说明它适用于哪些课程或考核。", en: "I will help synthesize conflicting evidence without writing the final argument. Start with a tentative position and the courses or assessments to which it applies." },
    phaseOneGoals: commonGoals("argument"),
    materials: [
      makeMaterial("E", 1, "学习收益：有指导的 AI 使用", "一项覆盖 12 门本科课程的准实验比较发现，允许学生在提交 AI 对话记录和反思说明的条件下使用生成式 AI，期末概念迁移题平均提高 6 个百分点。但收益主要出现在已有中等先验知识的学生中；基础较弱学生更常直接接受模型答案。课程并非随机分配，教师指导强度也不同。"),
      makeMaterial("E", 2, "学术诚信与代写风险", "校级抽样显示，开放 AI 使用后，被教师标记为疑似未披露代写的作业从 3.1% 升至 8.7%。不过现有 AI 文本检测器在非英语母语学生文本上的误报率更高，不能作为单独处分依据。访谈中，学生对“润色”“生成提纲”和“生成完整答案”的边界理解不一致。"),
      makeMaterial("E", 3, "无障碍与学习机会", "残障学生服务中心报告，生成式 AI 的即时改写、结构提示和语音转写可降低部分阅读障碍与执行功能障碍学生的学习门槛。全面禁用可能使这些学生重新依赖申请周期较长的人工支持。但中心也指出，AI 对专业术语的错误简化可能制造新的理解风险。"),
      makeMaterial("E", 4, "学生自主性与依赖", "对 842 名学生的调查中，64% 表示 AI 帮助其更快尝试不同思路，38% 表示在时间压力下会停止自行核查。高频用户的自我效能更高，但该相关关系不能说明 AI 导致了自我效能提升。焦点小组中，部分学生认为逐次申报用途会破坏学习自主性。"),
      makeMaterial("E", 5, "考核效度", "教育测量小组认为，若课程目标是独立写作，允许 AI 生成论证会使作业分数难以代表学生能力；若目标是批判性使用工具，完全禁用又会降低真实性。该组建议将闭卷口试、过程稿和允许 AI 的综合任务组合使用，但尚无证据证明这一组合在大班课程中可扩展。"),
      makeMaterial("E", 6, "教师工作量与执行一致性", "试点课程中，要求学生附 AI 使用声明后，教师每份作业平均多花 4.6 分钟审核；但因格式和语法问题减少，反馈时间平均下降 2.1 分钟。不同院系对违规的判断一致率仅为 0.57。教师工会主张在新增审核要求前提供工时与培训预算。"),
    ],
    recoveryMaterial: makeMaterial("E", 7, "新增研究：限制政策的反向结果", "一项新公布的随机课堂实验将 24 个讨论班分为“禁止 AI”和“允许 AI 但要求过程说明”两组。八周后，禁止组在无 AI 的现场论证测验上平均低 5 个百分点，且弱势学生退课率更高；研究者推测禁用减少了课外反馈机会。但样本来自一门写作基础课，教师知道分组，结果未必适用于高风险专业考核。", true),
  },
  night_transit: {
    id: "night_transit",
    code: "P",
    label: { "zh-CN": "创造性任务", en: "Creative task" },
    eyebrow: { "zh-CN": "约束条件下的规划设计", en: "Planning under constraints" },
    question: { "zh-CN": "请为和安大学设计一套校园夜间交通服务，在预算、无障碍、安全、人员、运营时段和环境影响之间取得平衡。", en: "Design a campus night-transport service for He'an University, balancing budget, accessibility, safety, staffing, operating hours, and environmental impact." },
    description: { "zh-CN": "比较服务架构，形成当前设计，并说明尚未解决的问题。", en: "Compare service architectures, form a current design, and identify unresolved issues." },
    overview: { "zh-CN": "你将阅读 6 份需求与约束材料。中断后，项目预算将发生变化。", en: "You will read six demand and constraint sources. The project budget changes after interruption." },
    familiarity: { "zh-CN": "校园交通服务或公共服务规划", en: "campus transportation or public-service planning" },
    starterMemo: {
      "zh-CN": "设计目标：\n\n优先用户：\n\n关键约束：\n\n候选架构：\n\n当前方案（线路、时段、车辆、人员）：\n\n已排除设计及理由：\n\n当前不确定点：",
      en: "Design goal:\n\nPriority users:\n\nKey constraints:\n\nCandidate architectures:\n\nCurrent design (routes, hours, vehicles, staffing):\n\nRejected design and rationale:\n\nCurrent uncertainty:",
    },
    assistantIntro: { "zh-CN": "我会帮助你在约束下比较设计方案，但不会替你完成最终方案。请先界定最优先的用户和不可违反的约束。", en: "I will help compare designs under constraints without completing the final plan. Start by defining the priority users and non-negotiable constraints." },
    phaseOneGoals: commonGoals("design"),
    materials: [
      makeMaterial("P", 1, "夜间出行需求", "校园门禁与刷卡数据表明，工作日 21:00–00:30 平均有 1,460 次跨校区出行，其中 22:30 后占 58%。需求集中在图书馆、实验楼、研究生宿舍和地铁站。周五需求高出平日 27%，考试周高出 43%。现有步行距离最长为 2.8 公里。"),
      makeMaterial("P", 2, "预算与车辆选择", "学校批准首年最高预算 420 万元，含车辆、司机、调度与维护。柴油小巴每辆年综合成本约 68 万元，可载 22 人；电动小巴约 82 万元，可载 18 人；按需七座车约 46 万元。充电站最多同时支持 4 辆车，新增充电位不在本年度预算内。"),
      makeMaterial("P", 3, "无障碍需求", "登记有夜间通行需求的行动不便学生为 96 人。固定线路候选站点中只有 7 个具备无台阶通道，另有 5 个站点需绕行 120–260 米。无障碍车辆一次只能固定两台轮椅。学生代表要求平均候车时间不高于 15 分钟，且不得以预约作为唯一乘车方式。"),
      makeMaterial("P", 4, "安全与运营时段", "过去两年夜间安全求助事件有 37% 发生在 00:00–02:00，但这一时段总出行量仅占 14%。保卫处建议服务到 02:00，并在末班车提供实时位置共享。校方风险部门要求每辆车均配备司机，禁止单人同时承担驾驶与远程调度。"),
      makeMaterial("P", 5, "人员与排班", "现有校车部门最多可为夜间项目提供 6 名具备资质的司机，每人每周夜班不超过 3 次；新增招聘至少需要四个月。固定线路每班至少需要 3 辆车才能把峰值等待控制在 20 分钟以内。按需服务还需每晚 1 名独立调度员。"),
      makeMaterial("P", 6, "环境影响与学生偏好", "学生调查中，52% 偏好固定线路的可预测性，34% 偏好按需直达，14% 无偏好。若按预计里程运行，4 辆电动小巴的年度运营排放约为柴油方案的 38%；但按需七座车在低拼车率下，人均排放可能高于满载柴油小巴。调查回复率为 21%。"),
    ],
    recoveryMaterial: makeMaterial("P", 7, "新增约束：预算削减 15%", "校财务委员会通知，夜间交通项目首年可用预算由 420 万元削减 15%，调整为 357 万元。安全与无障碍要求不变，且不得通过向学生收费弥补缺口。方案可以缩减车辆、线路或运营时段，但必须说明对候车时间、覆盖人群和排放的影响。", true),
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
  const adminLabel: Record<ResearchTaskId, string> = {
    city_policy: "决策任务（城市治理多标准复杂决策）",
    ai_course_policy: "伦理任务（大学课程生成式 AI 使用伦理）",
    night_transit: "创造性任务（约束下设计校园夜间交通服务）",
  };
  return {
    label: adminLabel[taskId],
    initialMaterialCount: task.materials.length,
    firstMaterialId: task.materials[0].id,
    recoveryMaterialId: task.recoveryMaterial.id,
  };
}
