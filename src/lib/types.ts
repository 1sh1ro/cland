export type EnergyLevel = "low" | "medium" | "high";

export type PreferredTimeWindow = {
  days: string[];
  start: string;
  end: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  completedMinutes?: number;
  deadline?: string;
  earliestStart?: string;
  priority: number;
  energyLevel?: EnergyLevel;
  interruptible: boolean;
  minBlockMinutes: number;
  maxBlockMinutes?: number;
  dependencies?: string[];
  preferredTimeWindows?: PreferredTimeWindow[];
  assumptions?: string[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  busy: boolean;
};

export type PlannedBlock = {
  id: string;
  taskId: string;
  start: string;
  end: string;
  confidence: number;
  reasonCodes: string[];
  locked?: boolean;
};

export type PlanWarning = {
  code: string;
  message: string;
  taskId?: string;
};

export type PlanResult = {
  blocks: PlannedBlock[];
  warnings: PlanWarning[];
  assumptions: string[];
  generatedAt: string;
};

export type Settings = {
  timezone: string;
  planningHorizonDays: number;
  workDayStart: string;
  workDayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  maxDailyMinutes: number;
};

export type ApiSettings = {
  provider: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  taskPromptNotes: string;
  taskSystemPrompt?: string;
};

export type UiSettings = {
  stickyMode: boolean;
  alwaysOnTop: boolean;
  tipsEnabled: boolean;
};

export type CalendarViewMode = "week" | "focus";

export type KnowledgeCategory = {
  id: string;
  name: string;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  createdAt: string;
};
