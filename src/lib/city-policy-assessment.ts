export const cityPolicyOptions = ["A", "B", "C"] as const;
export type CityPolicyOption = typeof cityPolicyOptions[number];

export const cityPolicyCriteria = ["cost", "equity", "implementation", "environment", "acceptance"] as const;
export type CityPolicyCriterion = typeof cityPolicyCriteria[number];
export type CityPolicyProbeStage = "t1" | "t2" | "t3";

export type CityPolicyProbe = {
  optionRanking: CityPolicyOption[];
  criterionRanking: CityPolicyCriterion[];
  topChoiceReason: string;
  decisionChangingUncertainty: string;
  confidence: number;
  submittedAt: string;
};

export type CityPolicyAssessment = {
  version: "city-policy-recovery-v1";
  taskId: "city_policy";
  probes: Partial<Record<CityPolicyProbeStage, CityPolicyProbe>>;
};

export type CityPolicyRecoveryMetrics = {
  t2OptionAgreement: number;
  t2CriterionAgreement: number;
  t2StateAccuracy: number;
  t3OptionAgreement: number | null;
  t3CriterionAgreement: number | null;
  t3StateAccuracy: number | null;
  recoveryGain: number | null;
  t2TopChoiceRecovered: boolean;
  t3TopChoiceRecovered: boolean | null;
};

function pairwiseAgreement<T extends string>(reference: readonly T[], response: readonly T[]) {
  if (reference.length !== response.length || new Set(response).size !== reference.length) return null;
  const referencePosition = new Map(reference.map((item, index) => [item, index]));
  const responsePosition = new Map(response.map((item, index) => [item, index]));
  let agreements = 0;
  let comparisons = 0;
  for (let left = 0; left < reference.length; left += 1) {
    for (let right = left + 1; right < reference.length; right += 1) {
      const first = reference[left];
      const second = reference[right];
      comparisons += 1;
      if ((referencePosition.get(first)! < referencePosition.get(second)!) === (responsePosition.get(first)! < responsePosition.get(second)!)) agreements += 1;
    }
  }
  return comparisons ? Math.round((agreements / comparisons) * 1000) / 10 : null;
}

export function cityPolicyRecoveryMetrics(value: CityPolicyAssessment | null | undefined): CityPolicyRecoveryMetrics | null {
  const t1 = value?.probes?.t1;
  const t2 = value?.probes?.t2;
  const t3 = value?.probes?.t3;
  if (!t1 || !t2) return null;
  const t2OptionAgreement = pairwiseAgreement(t1.optionRanking, t2.optionRanking);
  const t2CriterionAgreement = pairwiseAgreement(t1.criterionRanking, t2.criterionRanking);
  if (t2OptionAgreement == null || t2CriterionAgreement == null) return null;
  const t2StateAccuracy = Math.round(((t2OptionAgreement + t2CriterionAgreement) / 2) * 10) / 10;
  const t3OptionAgreement = t3 ? pairwiseAgreement(t1.optionRanking, t3.optionRanking) : null;
  const t3CriterionAgreement = t3 ? pairwiseAgreement(t1.criterionRanking, t3.criterionRanking) : null;
  const t3StateAccuracy = t3OptionAgreement == null || t3CriterionAgreement == null
    ? null
    : Math.round(((t3OptionAgreement + t3CriterionAgreement) / 2) * 10) / 10;
  return {
    t2OptionAgreement,
    t2CriterionAgreement,
    t2StateAccuracy,
    t3OptionAgreement,
    t3CriterionAgreement,
    t3StateAccuracy,
    recoveryGain: t3StateAccuracy == null ? null : Math.round((t3StateAccuracy - t2StateAccuracy) * 10) / 10,
    t2TopChoiceRecovered: t2.optionRanking[0] === t1.optionRanking[0],
    t3TopChoiceRecovered: t3 ? t3.optionRanking[0] === t1.optionRanking[0] : null,
  };
}
