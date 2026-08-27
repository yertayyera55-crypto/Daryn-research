import { Detection, PersonalErrorProfile, PredictedRisk, RiskRanking, TaskAnalysis } from "@/lib/domain";

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
};

export type MoreHelpRequest = {
  detection: Detection;
  task: TaskAnalysis;
  profile: PersonalErrorProfile;
};

export interface AIProvider {
  analyzeTask(request: TaskAnalysisRequest): Promise<TaskAnalysis>;
  rankRisks(request: RiskPredictionRequest): Promise<RiskRanking>;
  validateWriting(request: ValidationRequest): Promise<Detection[]>;
  getMoreHelp(request: MoreHelpRequest): Promise<string>;
}
