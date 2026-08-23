# 任务后问卷（Post-task Survey）设计说明与参考文献

对应代码：`src/lib/recovery-assessment.ts`（题目定义）、`src/components/rmw-app.tsx` 的
`RecoveryPostSurveyPage`（参与者界面）、`src/app/api/results/route.ts` 的 `postSurvey`
校验、`src/components/admin-dashboard.tsx` 的 `RecoveryAssessmentPanel`（研究者后台展示）。

## 为什么要改

平台原来的恢复后问卷（5 题）里有 2 题直接问"恢复支持帮不帮"（`continuity`、
`supportSufficiency`）。单一流程设计（single-protocol characterization study）里中断后
不再展示任何摘要 / 卡片 / 知识网络，参与者没有"恢复支持"可评价，这两题在当前设计下
没有意义。其余三题（`mentalDemand`、`confidence`、`agency`）虽然没有直接提"恢复支持"，
但整份问卷在论文的 Measures、Analysis Plan、Results 三处都没有被提及或使用，说明它是
三条件对比设计（rmw / rmw_no_summary / summary_only 比较哪种恢复支持更好）时期遗留下来
的量表，不对应当前论文实际测量的构念。

论文 Procedure 部分仍保留了 "Post-task Survey" 这一步骤，所以保留这个页面本身，但把题目
内容换成能在论文里落地使用的构念——具体来说，选的是论文中**已经引用但正文没真正用起来**
或**已经预告要讨论、但还没有对应数据**的两类线索：

1. 参考文献列表里已经引了 NASA-TLX（[10] Hart & Staveland, 1988），但正文从未真正使用；
2. Discussion 草稿里写着要与 Tankelevitch et al. (2024) 的 metacognitive demands
   框架对话（"Dialogue with Tankelevitch et al. (2024) on metacognitive demands"），
   以及 Final 版 Discussion 里提到要连接 overreliance 文献，但目前都没有自评数据支撑。

## 五组题目及其来源

### A. 任务负荷（Task load）—— 改编自已有效度量表

**来源**：Hart, S. G., & Staveland, L. E. (1988). Development of NASA-TLX (Task Load
Index): Results of empirical and theoretical research. In *Human Mental Workload*
(pp. 139–183). North-Holland.（论文参考文献 [10]，已在文献列表中，只是正文未使用）

**改编说明（需要在 Measures 里明确标注，且需要预测试）**：
- 原始 NASA-TLX 是 21 点双极量表（0–100，每个维度用 Low–High 两端描述），且通常包含
  "Physical Demand"（体力需求）维度。本平台任务是纯认知/阅读写作任务，因此**去掉了
  Physical Demand**，只保留 Mental Demand、Temporal Demand、Effort、Frustration、
  Performance 五个维度。
- 为了和平台其余问卷（AILS-CCS、研究任务自我效能等）保持一致的作答体验，**把原始的
  双极评分方式改成了 1–7 的"完全不同意–完全同意"陈述句式**，不是原始的 NASA-TLX administration
  格式。这一点必须在论文里明确写成"adapted"而非"NASA-TLX"，并像 AILS-CCS 一样注明
  "改编版本，正式实验前需预测试"。
- `performanceSatisfaction` 一题的方向和其余四题相反（分数越高代表体验越好，其余四题
  分数越高代表负荷/负面体验越强），分析时不要把五题直接加总成一个"总负荷分"，应分别报告，
  或对 `performanceSatisfaction` 做反向计分后再决定是否合成。

### B. 主观推理位置损失（Perceived reasoning-position loss）—— 研究者自编

**没有对应的已发表量表**，是围绕论文自己的核心构念（六维推理位置：goal / judgment /
constraint / rejected path / uncertainty / next action）新写的题目，目的是给客观测量的
T1→T2 损失分数提供一个主观印证（subjective corroboration）。

**理论落脚点**：Borst, J. P., Taatgen, N. A., & van Rijn, H. (2015). What makes
interruptions disruptive? … problem state bottleneck … (论文参考文献 [5])。

写论文时应明确写成"researcher-developed items"，不要暗示这是某个已验证量表的改编，
避免过度声称效度。

### C. 元认知信心（Metacognitive confidence）—— 研究者自编，受某框架启发

**没有对应的已发表量表**（Tankelevitch et al. 2024 是一篇概念性/框架性论文，不是一份
心理测量量表），这两题是受其框架启发后自行编写的。

**理论落脚点**：Tankelevitch, L., Kewenig, V., Simkute, A., Scott, A. E., Sarkar, A.,
Sellen, A., & Rintel, S. (2024). The metacognitive demands and opportunities of
generative AI. *Proceedings of CHI 2024*.（论文参考文献 [25]）

这组题目还能反过来支撑 Limitations 里那句"T1 is a participant-endorsed reference state
rather than direct access to latent cognition"——如果测出参与者自己对回答准确性的信心
普遍不高，正好是这条 limitation 的实证依据，可以在 Discussion 里呼应。

### D. AI 依赖（AI reliance）—— 研究者自编

**没有对应的已发表量表**，理论落脚点：

- Buçinca, Z., Malaya, M. B., & Gajos, K. Z. (2021). To trust or to think: Cognitive
  forcing functions can reduce overreliance on AI in AI-assisted decision-making.
  *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1).（论文参考文献 [7]，
  已在文献列表中）

**⚠️ 需要你确认的缺口**：Final 版 Discussion 草稿里提到 "Liu et al. (CHI 2026) [40]
identified behavioral indicators of overreliance"，但我核对了两版论文的 References
列表，条目只编到 [38]（He, Y., et al. 2024, Multi-IF），**[39]（Vishwarupe et al.,
Collaboration Gap）和 [40]（Liu et al.）在正文里被引用，但没有对应的完整文献条目**。
这两题的引用需要你补全 Liu et al. 那篇的完整信息（作者全名、年份、会议全称、DOI）后
才能正式写进 Measures。

### E. 掌控感（Agency）—— 研究者自编

**没有对应的已发表量表**，理论落脚点可以松散地挂靠：

- Amershi, S. et al. (2019). Guidelines for human-AI interaction. *Proceedings of
  CHI 2019*.（论文参考文献 [3]，其中关于让用户保持控制感/可修正性的指南）
- Buçinca et al. (2021)（同上，[7]）

## 题目全文（中英对照）

| 组别 | key | 中文 | English |
|---|---|---|---|
| 任务负荷 | mentalDemand | 完成这项任务需要很高的脑力和思考投入。 | The task required a great deal of mental and thinking activity. |
| 任务负荷 | temporalDemand | 任务过程中我感觉时间压力很大。 | I felt a strong sense of time pressure during the task. |
| 任务负荷 | effort | 为了完成任务，我需要付出很大努力。 | I had to work hard to accomplish my level of performance. |
| 任务负荷 | frustration | 完成任务过程中我感到有压力、烦躁或不耐烦。 | I felt stressed, irritated, or annoyed while completing the task. |
| 任务负荷 | performanceSatisfaction | 我对自己完成这项任务的表现感到满意。 | I am satisfied with my performance on this task. |
| 主观推理位置损失 | judgmentUncertain | 中断后，我对中断前的判断变得不确定。 | After the interruption, I became uncertain about my pre-interruption judgment. |
| 主观推理位置损失 | rejectedPathBlurred | 中断后，我需要重新想清楚哪些方向此前已经排除。 | After the interruption, I had to work out again which directions I had already ruled out. |
| 主观推理位置损失 | nextActionForgotten | 中断后，我不确定自己原本计划的下一步是什么。 | After the interruption, I was unsure what I had originally planned to do next. |
| 元认知信心 | distinguishCertainty | 我能清楚区分哪些是我确定的、哪些只是猜测。 | I could clearly distinguish what I was certain about from what I was merely guessing. |
| 元认知信心 | confidentInAnswer | 我对自己刚才提交的回答的准确性有信心。 | I am confident in the accuracy of the answers I just submitted. |
| AI 依赖 | reliedOnAI | 我在很大程度上依赖 AI 的建议来形成判断。 | I relied heavily on the AI's suggestions to form my judgment. |
| AI 依赖 | mightMissAIErrors | 如果 AI 的判断有误，我可能不会立刻发现。 | If the AI's judgment had been wrong, I might not have noticed right away. |
| 掌控感 | memoOwnership | 我感觉最终备忘录的内容是由我自己主导决定的。 | I felt that I was the one driving the content of my final memo. |
| 掌控感 | overallControl | 在完成整个任务的过程中，我感觉判断始终由自己掌控。 | Throughout the task, I felt in control of my own judgment. |

全部采用 1–7 分"完全不同意–完全同意"作答，与平台其余问卷保持一致。

## 写进论文 Measures 时的建议结构

1. 一句话说明目的："After the task, participants completed a 14-item post-task
   survey covering task load, perceived reasoning-position loss, metacognitive
   confidence, AI reliance, and agency (1–7 agreement scale)."
2. 明确区分"改编的已有量表"（只有任务负荷这一组）和"研究者自编题目"（其余四组），
   不要把五组都写成"adapted from"。
3. 任务负荷组要加一句预测试/改编说明，跟 AILS-CCS 那句"工作译本，正式实验前需要
   预测试"是同一个规范动作。
4. AI 依赖组的 Liu et al. 引用，等你补全文献条目后再放进正文。
