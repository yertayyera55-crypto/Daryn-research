import { Detection, GeneralFinding, PersonalErrorProfile, PredictedRisk, RiskRanking, TaskAnalysis } from "@/lib/domain";

export type TaskAnalysisRequest = { taskPrompt: string };
export type RiskPredictionRequest = {
  task: TaskAnalysis;
  profile: PersonalErrorProfile;
};
export type ValidationRequest = {
  writing: string;
  task: TaskAnalysis;
  risks: PredictedRisk[];
  profile: PersonalErrorProfile;
  scope?: "recent" | "fullEssay";
  checkAllProfilePatterns?: boolean;
};

export type MoreHelpRequest = {
  detection: Detection;
  task: TaskAnalysis;
  profile: PersonalErrorProfile;
  writing: string;
};

export type MoreHelp = {
  explanation: string;
  correction: string;
};

export type FinalAuditRequest = {
  writing: string;
  task: TaskAnalysis;
  risks: PredictedRisk[];
  profile: PersonalErrorProfile;
};

export type FinalAudit = {
  personalDetections: Detection[];
  otherFindings: GeneralFinding[];
};

/** Level-2 help after the server has compared the suggested edit with the student's source sentence. */
export type VerifiedMoreHelp = {
  explanation: string;
  correction: string | null;
  verification: "confirmed" | "unconfirmed";
};

export interface AIProvider {
  analyzeTask(request: TaskAnalysisRequest): Promise<TaskAnalysis>;
  rankRisks(request: RiskPredictionRequest): Promise<RiskRanking>;
  validateWriting(request: ValidationRequest): Promise<Detection[]>;
  getMoreHelp(request: MoreHelpRequest): Promise<MoreHelp>;
  finalAudit(request: FinalAuditRequest): Promise<FinalAudit>;
}
