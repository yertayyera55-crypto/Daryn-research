import { Detection, GeneralFinding, PersonalErrorProfile, PredictedRisk } from "@/lib/domain";
import { textSpanExistsInWriting, verifyGeneralFinding } from "@/lib/correction-verification";

export type FinalReviewOccurrence = Pick<Detection, "textSpan" | "hint">;

export type FinalReviewItem = {
  patternId: string;
  name: string;
  rule: string;
  occurrences: FinalReviewOccurrence[];
};

export type FinalReview = {
  appeared: FinalReviewItem[];
  avoided: FinalReviewItem[];
  unpredicted: FinalReviewItem[];
  reviewNext: FinalReviewItem[];
  generalFindings: GeneralFinding[];
};

export function filterFinalAuditEvidence(writing: string, detections: Detection[], findings: GeneralFinding[]) {
  const personalDetections = detections.filter((detection) => textSpanExistsInWriting(writing, detection.textSpan));
  const seenGeneralFindings = new Set<string>();
  const generalFindings = findings.flatMap((finding) => {
    const verified = verifyGeneralFinding({ writing, finding });
    if (!verified) return [];
    const normalizedSpan = verified.textSpan.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const key = `${verified.category.toLocaleLowerCase()}:${normalizedSpan}`;
    if (seenGeneralFindings.has(key)) return [];
    seenGeneralFindings.add(key);
    return [verified];
  });
  return { personalDetections, generalFindings };
}

function groupDetectedPatterns(profile: PersonalErrorProfile, detections: Detection[]) {
  const groups = new Map<string, FinalReviewItem>();
  for (const detection of detections) {
    const pattern = profile.patterns.find((item) => item.id === detection.patternId);
    if (!pattern) throw new Error("Detected pattern " + detection.patternId + " is not in the profile.");
    const group = groups.get(pattern.id) ?? {
      patternId: pattern.id,
      name: pattern.title,
      rule: pattern.rule,
      occurrences: [],
    };
    group.occurrences.push({ textSpan: detection.textSpan, hint: detection.hint });
    groups.set(pattern.id, group);
  }
  return groups;
}

export function buildFinalReview(
  profile: PersonalErrorProfile,
  risks: PredictedRisk[],
  detections: Detection[],
  generalFindings: GeneralFinding[] = [],
): FinalReview {
  const selectedIds = new Set(risks.map((risk) => risk.patternId));
  const detectedGroups = groupDetectedPatterns(profile, detections);
  const selected = risks.map((risk) => {
    const pattern = profile.patterns.find((item) => item.id === risk.patternId);
    if (!pattern) throw new Error("Selected pattern " + risk.patternId + " is not in the profile.");
    return detectedGroups.get(pattern.id) ?? {
      patternId: pattern.id,
      name: pattern.title,
      rule: pattern.rule,
      occurrences: [],
    };
  });
  const unpredicted = [...detectedGroups.values()].filter((item) => !selectedIds.has(item.patternId));
  const appeared = selected.filter((item) => item.occurrences.length > 0);

  return {
    appeared,
    avoided: selected.filter((item) => item.occurrences.length === 0),
    unpredicted,
    reviewNext: [...appeared, ...unpredicted],
    generalFindings,
  };
}
