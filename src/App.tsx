import { useEffect, useMemo, useRef, useState } from "react";
import { appWindow, LogicalSize } from "@tauri-apps/api/window";
import TaskForm, { TaskDraft } from "./components/TaskForm";
import TaskList from "./components/TaskList";
import CalendarWeek from "./components/CalendarWeek";
import SettingsPanel from "./components/SettingsPanel";
import MemoPanel from "./components/MemoPanel";
import KnowledgeBasePanel from "./components/KnowledgeBasePanel";
import KnowledgeAiPanel from "./components/KnowledgeAiPanel";
import {
  DEFAULT_TASK_SYSTEM_PROMPT,
  parseTasksFromText,
  suggestCategoryForEntry,
  answerKnowledgeQuestion,
  explainPlan,
  generateFocusTip
} from "./lib/api";
import { createTranslator, type Language } from "./lib/i18n";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { formatTimeRange, fromLocalInputValue, startOfDay, toLocalInputValue } from "./lib/time";
import { generatePlan } from "./lib/scheduler";
import type {
  ApiSettings,
  CalendarEvent,
  CalendarViewMode,
  KnowledgeCategory,
  KnowledgeItem,
  PlanResult,
  PlanWarning,
  PlannedBlock,
  Settings,
  Task,
  UiSettings
} from "./lib/types";

const STORAGE_KEYS = {
  tasks: "cland.tasks",
  events: "cland.events",
  settings: "cland.settings",
  plan: "cland.plan",
  apiSettings: "cland.api",
  uiSettings: "cland.ui",
  assumptions: "cland.assumptions",
  language: "cland.language",
  calendarView: "cland.calendarView",
  memo: "cland.memo",
  knowledgeCategories: "cland.knowledgeCategories",
  knowledgeItems: "cland.knowledgeItems"
};

const detectLanguage = (): Language => {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return "en";
};

const coerceLanguage = (value: unknown): Language => {
  if (value === "zh" || value === "en") {
    return value;
  }
  return detectLanguage();
};

const coerceCalendarView = (value: unknown): CalendarViewMode => {
  if (value === "focus") {
    return "focus";
  }
  return "week";
};

const coerceProvider = (value: string | undefined): ApiSettings["provider"] => {
  if (value === "anthropic") {
    return "anthropic";
  }
  return "openai";
};

const defaultSettings: Settings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  planningHorizonDays: 14,
  workDayStart: "09:00",
  workDayEnd: "21:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  maxDailyMinutes: 360
};

const defaultApiSettings: ApiSettings = {
  provider: coerceProvider(import.meta.env.VITE_API_PROVIDER),
  baseUrl: import.meta.env.VITE_API_BASE_URL || "https://api.longcat.chat/openai",
  apiKey: import.meta.env.VITE_API_KEY || "",
  model: import.meta.env.VITE_API_MODEL || "LongCat-Flash-Chat",
  taskPromptNotes: ""
};

const defaultUiSettings: UiSettings = {
  stickyMode: false,
  alwaysOnTop: false,
  tipsEnabled: true
};

const MIN_WINDOW_SIZE = { width: 1200, height: 720 };
const DAY_MS = 24 * 60 * 60 * 1000;

const coerceApiSettings = (value: unknown): ApiSettings => {
  if (!value || typeof value !== "object") {
    return defaultApiSettings;
  }
  const candidate = value as Partial<ApiSettings>;
  const legacyPrompt = candidate.taskSystemPrompt?.trim();
  const legacyNotes = legacyPrompt && legacyPrompt !== DEFAULT_TASK_SYSTEM_PROMPT ? legacyPrompt : "";
  return {
    ...defaultApiSettings,
    ...candidate,
    provider: coerceProvider(typeof candidate.provider === "string" ? candidate.provider : undefined),
    taskPromptNotes:
      typeof candidate.taskPromptNotes === "string" && candidate.taskPromptNotes.trim()
        ? candidate.taskPromptNotes
        : legacyNotes
  };
};

const coerceUiSettings = (value: unknown): UiSettings => {
  if (!value || typeof value !== "object") {
    return defaultUiSettings;
  }
  const candidate = value as Partial<UiSettings>;
  return {
    stickyMode: Boolean(candidate.stickyMode),
    alwaysOnTop: Boolean(candidate.alwaysOnTop),
    tipsEnabled: candidate.tipsEnabled !== undefined ? Boolean(candidate.tipsEnabled) : defaultUiSettings.tipsEnabled
  };
};

const createEmptyDraft = (): TaskDraft => ({
  title: "",
  description: "",
  estimatedMinutes: 120,
  deadline: "",
  earliestStart: "",
  priority: 3,
  interruptible: true,
  minBlockMinutes: 30,
  maxBlockMinutes: 120
});

type KnowledgeDraft = {
  title: string;
  content: string;
  categoryId: string;
};

const draftFromTask = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description ?? "",
  estimatedMinutes: task.estimatedMinutes,
  deadline: task.deadline ? toLocalInputValue(task.deadline) : "",
  earliestStart: task.earliestStart ? toLocalInputValue(task.earliestStart) : "",
  priority: task.priority,
  interruptible: task.interruptible,
  minBlockMinutes: task.minBlockMinutes,
  maxBlockMinutes: task.maxBlockMinutes ?? task.minBlockMinutes
});

const uniqueList = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim())));

const normalizeTask = (task: Task): Task => {
  const minBlockMinutes = Math.max(task.minBlockMinutes, 30);
  const estimatedMinutes = Math.max(task.estimatedMinutes, minBlockMinutes);
  const maxBlockMinutes = task.maxBlockMinutes
    ? Math.max(task.maxBlockMinutes, minBlockMinutes)
    : undefined;
  const completedMinutesRaw = task.completedMinutes ?? 0;
  const completedMinutes = Math.min(Math.max(0, completedMinutesRaw), estimatedMinutes);
  if (
    minBlockMinutes === task.minBlockMinutes &&
    estimatedMinutes === task.estimatedMinutes &&
    maxBlockMinutes === task.maxBlockMinutes &&
    completedMinutes === task.completedMinutes
  ) {
    return task;
  }
  return {
    ...task,
    minBlockMinutes,
    estimatedMinutes,
    maxBlockMinutes,
    completedMinutes
  };
};

const AppLogo = () => (
  <svg className="app-logo" viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="clandLogoGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f05a2b" />
        <stop offset="100%" stopColor="#f29f5c" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#clandLogoGradient)" />
    <path
      d="M31 16 A12 12 0 1 0 31 32"
      fill="none"
      stroke="#fffaf2"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
  </svg>
);

const GithubIcon = () => (
  <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.88-.01-1.72-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.1-1.5-1.1-1.5-.9-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.15-4.56-5.1 0-1.13.39-2.06 1.03-2.79-.1-.27-.45-1.36.1-2.84 0 0 .85-.28 2.78 1.06a9.28 9.28 0 0 1 5.06 0c1.93-1.34 2.78-1.06 2.78-1.06.55 1.48.2 2.57.1 2.84.64.73 1.03 1.66 1.03 2.79 0 3.96-2.34 4.84-4.57 5.1.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .26.18.58.69.48 3.96-1.35 6.83-5.18 6.83-9.7C22 6.58 17.52 2 12 2z"
    />
  </svg>
);

const App = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.tasks, []);
    return Array.isArray(loaded) ? loaded.map(normalizeTask) : [];
  });
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadFromStorage(STORAGE_KEYS.events, []));
  const [settings, setSettings] = useState<Settings>(() => loadFromStorage(STORAGE_KEYS.settings, defaultSettings));
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() =>
    coerceApiSettings(loadFromStorage(STORAGE_KEYS.apiSettings, defaultApiSettings))
  );
  const [uiSettings, setUiSettings] = useState<UiSettings>(() =>
    coerceUiSettings(loadFromStorage(STORAGE_KEYS.uiSettings, defaultUiSettings))
  );
  const [plan, setPlan] = useState<PlanResult | null>(() => loadFromStorage(STORAGE_KEYS.plan, null));
  const [aiAssumptions, setAiAssumptions] = useState<string[]>(() => loadFromStorage(STORAGE_KEYS.assumptions, []));
  const [language, setLanguage] = useState<Language>(() =>
    coerceLanguage(loadFromStorage(STORAGE_KEYS.language, detectLanguage()))
  );
  const [calendarView, setCalendarView] = useState<CalendarViewMode>(() =>
    coerceCalendarView(loadFromStorage(STORAGE_KEYS.calendarView, "week"))
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskCompleted, setTaskCompleted] = useState(0);
  const [memo, setMemo] = useState<string>(() => loadFromStorage(STORAGE_KEYS.memo, ""));
  const [knowledgeCategories, setKnowledgeCategories] = useState<KnowledgeCategory[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.knowledgeCategories, []);
    if (Array.isArray(loaded) && loaded.length > 0) {
      return loaded;
    }
    return [{ id: crypto.randomUUID(), name: "General" }];
  });
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.knowledgeItems, []);
    return Array.isArray(loaded) ? loaded : [];
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(() => ({
    title: "",
    content: "",
    categoryId: knowledgeCategories[0]?.id ?? ""
  }));
  const [knowledgeModal, setKnowledgeModal] = useState<KnowledgeItem | null>(null);
  const [aiMode, setAiMode] = useState<"ask" | "classify">("ask");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<{ category: string; reason: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"memo" | "knowledge" | "ai">("memo");
  const [draft, setDraft] = useState<TaskDraft>(() => createEmptyDraft());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [inputText, setInputText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [taskFormPulseKey, setTaskFormPulseKey] = useState(0);
  const [focusTip, setFocusTip] = useState("");
  const [tipBusy, setTipBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const t = useMemo(() => createTranslator(language), [language]);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
    [language]
  );
  const currentTime = timeFormatter.format(now);
  const contactUrl = "https://github.com/1sh1ro";
  const isTauri =
    typeof window !== "undefined" && Boolean((window as Window & { __TAURI__?: unknown }).__TAURI__);
  const previousWindowState = useRef<null | { size: { width: number; height: number }; resizable: boolean }>(null);
  const tasksRef = useRef(tasks);
  const aiAssumptionsRef = useRef(aiAssumptions);
  const eventsRef = useRef(events);
  const settingsRef = useRef(settings);
  const planRef = useRef<PlanResult | null>(plan);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
    aiAssumptionsRef.current = aiAssumptions;
    eventsRef.current = events;
    settingsRef.current = settings;
    planRef.current = plan;
  }, [tasks, aiAssumptions, events, settings, plan]);

  useEffect(() => {
    if (!isTauri || uiSettings.stickyMode) {
      return;
    }
    appWindow.setMinSize(new LogicalSize(MIN_WINDOW_SIZE.width, MIN_WINDOW_SIZE.height));
  }, [isTauri, uiSettings.stickyMode]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.events, events);
  }, [events]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.apiSettings, apiSettings);
  }, [apiSettings]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.uiSettings, uiSettings);
  }, [uiSettings]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.plan, plan);
  }, [plan]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.assumptions, aiAssumptions);
  }, [aiAssumptions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.language, language);
  }, [language]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.calendarView, calendarView);
  }, [calendarView]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.memo, memo);
  }, [memo]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.knowledgeCategories, knowledgeCategories);
  }, [knowledgeCategories]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.knowledgeItems, knowledgeItems);
  }, [knowledgeItems]);

  const taskMap = useMemo(() => {
    return tasks.reduce<Record<string, string>>((acc, task) => {
      acc[task.id] = task.title;
      return acc;
    }, {});
  }, [tasks]);

  const taskDifficultyMap = useMemo(() => {
    return tasks.reduce<Record<string, string>>((acc, task) => {
      if (task.priority >= 4) {
        acc[task.id] = t("calendar.difficultyHigh");
      } else if (task.priority >= 3) {
        acc[task.id] = t("calendar.difficultyMedium");
      } else {
        acc[task.id] = t("calendar.difficultyLow");
      }
      return acc;
    }, {});
  }, [tasks, t]);

  const currentBlock = useMemo(() => {
    if (!plan) {
      return null;
    }
    return (
      plan.blocks.find((block) => {
        const start = new Date(block.start);
        const end = new Date(block.end);
        return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
      }) ?? null
    );
  }, [now, plan]);

  const currentTask = useMemo(() => {
    if (!currentBlock) {
      return null;
    }
    return tasks.find((task) => task.id === currentBlock.taskId) ?? null;
  }, [currentBlock, tasks]);

  const currentTaskRange = useMemo(() => {
    if (!currentBlock) {
      return "";
    }
    return formatTimeRange(currentBlock.start, currentBlock.end);
  }, [currentBlock]);

  const hasPlanBlocks = (plan?.blocks?.length ?? 0) > 0;
  const hasLockedBlocks = (plan?.blocks?.some((block) => block.locked) ?? false) === true;
  const canGeneratePlan = tasks.length > 0;

  useEffect(() => {
    if (knowledgeCategories.length === 0) {
      const fallback = { id: crypto.randomUUID(), name: "General" };
      setKnowledgeCategories([fallback]);
      setSelectedCategoryId("all");
      setKnowledgeDraft((prev) => ({ ...prev, categoryId: fallback.id }));
      return;
    }
    if (
      selectedCategoryId !== "all" &&
      !knowledgeCategories.some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId("all");
    }
    if (!knowledgeCategories.some((category) => category.id === knowledgeDraft.categoryId)) {
      setKnowledgeDraft((prev) => ({ ...prev, categoryId: knowledgeCategories[0].id }));
    }
  }, [knowledgeCategories, knowledgeDraft.categoryId, selectedCategoryId]);

  const openTaskDetail = (task: Task) => {
    setTaskDetail(task);
    setTaskCompleted(task.completedMinutes ?? 0);
  };

  const handleCalendarBlockSelect = (block: PlannedBlock) => {
    const task = tasks.find((item) => item.id === block.taskId);
    if (task) {
      openTaskDetail(task);
    }
  };

  const handleClearLocks = () => {
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        blocks: prev.blocks.map((block) => (block.locked ? { ...block, locked: false } : block))
      };
    });
  };

  const handleCalendarBlockMove = (blockId: string, start: string, end: string) => {
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        blocks: prev.blocks.map((block) =>
          block.id === blockId ? { ...block, start, end, locked: true } : block
        )
      };
    });
  };

  const closeTaskDetail = () => {
    setTaskDetail(null);
    setTaskCompleted(0);
  };

  const saveTaskProgress = () => {
    if (!taskDetail) {
      return;
    }
    const clampedCompleted = Math.min(Math.max(0, taskCompleted), taskDetail.estimatedMinutes);
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskDetail.id ? { ...task, completedMinutes: clampedCompleted } : task
      )
    );
    closeTaskDetail();
  };

  const handleSaveTask = () => {
    if (!draft.title.trim()) {
      return;
    }
    const normalizedMinBlock = Math.max(draft.minBlockMinutes, 30);
    const normalizedEstimate = Math.max(draft.estimatedMinutes, normalizedMinBlock);
    const normalizedMaxBlock = Math.max(draft.maxBlockMinutes, normalizedMinBlock);
    const existingCompleted = selectedTask?.completedMinutes ?? 0;
    const normalizedCompleted = Math.min(Math.max(0, existingCompleted), normalizedEstimate);
    const taskData: Task = {
      id: selectedTask?.id ?? crypto.randomUUID(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      estimatedMinutes: normalizedEstimate,
      completedMinutes: normalizedCompleted,
      deadline: draft.deadline ? fromLocalInputValue(draft.deadline) : undefined,
      earliestStart: draft.earliestStart ? fromLocalInputValue(draft.earliestStart) : undefined,
      priority: draft.priority,
      interruptible: draft.interruptible,
      minBlockMinutes: normalizedMinBlock,
      maxBlockMinutes: normalizedMaxBlock
    };

    setTasks((prev) => {
      if (selectedTask) {
        return prev.map((task) => (task.id === selectedTask.id ? taskData : task));
      }
      return [...prev, taskData];
    });
    setSelectedTask(null);
    setDraft(createEmptyDraft());
  };

  const handleResetDraft = () => {
    setSelectedTask(null);
    setDraft(createEmptyDraft());
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setDraft(draftFromTask(task));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        blocks: prev.blocks.filter((block) => block.taskId !== taskId),
        warnings: prev.warnings.filter((warning) => warning.taskId !== taskId)
      };
    });
    if (taskDetail?.id === taskId) {
      closeTaskDetail();
    }
    if (selectedTask?.id === taskId) {
      handleResetDraft();
    }
  };

  const handleAddTaskToCalendar = (task: Task) => {
    const baseTasks = tasksRef.current;
    const baseEvents = eventsRef.current;
    const baseSettings = settingsRef.current;
    const basePlan = planRef.current;
    const baseBlocks = basePlan?.blocks ?? [];
    if (baseBlocks.some((block) => block.taskId === task.id)) {
      setStatusMessage(t("status.taskAlreadyScheduled"));
      return;
    }
    const horizonSettings = expandPlanningHorizon([task], baseSettings);
    const planSettings = extendWorkHoursForTasks([task], horizonSettings);
    const nextPlan = generatePlan([task], baseEvents, planSettings, baseBlocks);
    nextPlan.assumptions = mergeAssumptions(nextPlan.assumptions, baseTasks, aiAssumptionsRef.current);
    const addedBlocks = nextPlan.blocks.filter((block) => block.taskId === task.id);
    if (addedBlocks.length === 0) {
      const reason = buildScheduleFailureReason(task, planSettings, nextPlan.warnings);
      setStatusMessage(t("status.taskNotScheduledReason", { reason }));
      return;
    }
    setPlan(nextPlan);
    setStatusMessage(t("status.taskScheduled", { count: addedBlocks.length }));
  };

  const handleAddCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const existing = knowledgeCategories.find(
      (category) => category.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      setSelectedCategoryId(existing.id);
      setKnowledgeDraft((prev) => ({ ...prev, categoryId: existing.id }));
      return;
    }
    const newCategory = { id: crypto.randomUUID(), name: trimmed };
    setKnowledgeCategories((prev) => [...prev, newCategory]);
    setSelectedCategoryId(newCategory.id);
    setKnowledgeDraft((prev) => ({ ...prev, categoryId: newCategory.id }));
  };

  const handleAddKnowledgeItem = () => {
    if (!knowledgeDraft.content.trim()) {
      setStatusMessage(t("knowledge.needContent"));
      return;
    }
    const title = knowledgeDraft.title.trim() || t("knowledge.untitled");
    const newItem: KnowledgeItem = {
      id: crypto.randomUUID(),
      title,
      content: knowledgeDraft.content.trim(),
      categoryId: knowledgeDraft.categoryId,
      createdAt: new Date().toISOString()
    };
    setKnowledgeItems((prev) => [newItem, ...prev]);
    setKnowledgeDraft((prev) => ({ ...prev, title: "", content: "" }));
  };

  const handleViewKnowledgeItem = (item: KnowledgeItem) => {
    setKnowledgeModal(item);
  };

  const handleDeleteKnowledgeItem = (itemId: string) => {
    setKnowledgeItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleAskKnowledge = async () => {
    if (!aiQuestion.trim()) {
      setStatusMessage(t("ai.needQuestion"));
      return;
    }
    if (!apiSettings.apiKey) {
      setStatusMessage(t("status.explainNeedKey"));
      return;
    }
    setAiBusy(true);
    setAiResponse("");
    try {
      const knowledgePayload = knowledgeItems.slice(0, 50).map((item) => ({
        category: knowledgeCategories.find((category) => category.id === item.categoryId)?.name ?? "",
        title: item.title,
        content: item.content
      }));
      const answer = await answerKnowledgeQuestion(aiQuestion, knowledgePayload, apiSettings);
      setAiResponse(answer);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("ai.failed"));
    } finally {
      setAiBusy(false);
    }
  };

  const handleClassifyKnowledge = async () => {
    if (!knowledgeDraft.content.trim() && !knowledgeDraft.title.trim()) {
      setStatusMessage(t("ai.needDraft"));
      return;
    }
    if (!apiSettings.apiKey) {
      setStatusMessage(t("status.explainNeedKey"));
      return;
    }
    setAiBusy(true);
    setAiSuggestion(null);
    try {
      const suggestion = await suggestCategoryForEntry(
        {
          title: knowledgeDraft.title.trim(),
          content: knowledgeDraft.content.trim()
        },
        knowledgeCategories.map((category) => category.name),
        apiSettings
      );
      setAiSuggestion(suggestion);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("ai.failed"));
    } finally {
      setAiBusy(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) {
      return;
    }
    const existing = knowledgeCategories.find(
      (category) => category.name.toLowerCase() === aiSuggestion.category.toLowerCase()
    );
    if (existing) {
      setKnowledgeDraft((prev) => ({ ...prev, categoryId: existing.id }));
      return;
    }
    const newCategory = { id: crypto.randomUUID(), name: aiSuggestion.category };
    setKnowledgeCategories((prev) => [...prev, newCategory]);
    setKnowledgeDraft((prev) => ({ ...prev, categoryId: newCategory.id }));
  };

  const mergeAssumptions = (
    baseAssumptions: string[],
    taskList: Task[] = tasks,
    aiAssumptionList: string[] = aiAssumptions
  ) => {
    const taskAssumptions = taskList.flatMap((task) => task.assumptions ?? []);
    return uniqueList([...baseAssumptions, ...aiAssumptionList, ...taskAssumptions]);
  };

  const expandPlanningHorizon = (taskList: Task[], baseSettings: Settings) => {
    const now = startOfDay(new Date());
    let latestDate: Date | null = null;
    taskList.forEach((task) => {
      [task.earliestStart, task.deadline].forEach((value) => {
        if (!value) {
          return;
        }
        const candidate = new Date(value);
        if (Number.isNaN(candidate.getTime())) {
          return;
        }
        if (!latestDate || candidate.getTime() > latestDate.getTime()) {
          latestDate = candidate;
        }
      });
    });
    if (!latestDate) {
      return baseSettings;
    }
    const latestDay = startOfDay(latestDate);
    const requiredDays = Math.max(1, Math.ceil((latestDay.getTime() - now.getTime()) / DAY_MS) + 1);
    const planningHorizonDays = Math.max(baseSettings.planningHorizonDays, requiredDays);
    if (planningHorizonDays === baseSettings.planningHorizonDays) {
      return baseSettings;
    }
    return { ...baseSettings, planningHorizonDays };
  };

  const timeToMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 0;
    }
    return hours * 60 + minutes;
  };

  const minutesToTime = (totalMinutes: number) => {
    const clamped = Math.min(24 * 60, Math.max(0, Math.round(totalMinutes)));
    const hours = Math.floor(clamped / 60);
    const minutes = clamped % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const overlapMinutes = (startA: number, endA: number, startB: number, endB: number) => {
    const start = Math.max(startA, startB);
    const end = Math.min(endA, endB);
    return Math.max(0, end - start);
  };

  const extendWorkHoursForTasks = (taskList: Task[], baseSettings: Settings) => {
    let updated = false;
    let workDayEndMinutes = timeToMinutes(baseSettings.workDayEnd);

    taskList.forEach((task) => {
      task.preferredTimeWindows?.forEach((window) => {
        const windowEnd = timeToMinutes(window.end);
        if (windowEnd > workDayEndMinutes) {
          workDayEndMinutes = windowEnd;
          updated = true;
        }
      });
      if (task.earliestStart) {
        const earliest = new Date(task.earliestStart);
        if (!Number.isNaN(earliest.getTime())) {
          const minutes = earliest.getHours() * 60 + earliest.getMinutes() + task.minBlockMinutes;
          if (minutes > workDayEndMinutes) {
            workDayEndMinutes = minutes;
            updated = true;
          }
        }
      }
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        if (!Number.isNaN(deadline.getTime())) {
          const minutes = deadline.getHours() * 60 + deadline.getMinutes();
          if (minutes > workDayEndMinutes) {
            workDayEndMinutes = minutes;
            updated = true;
          }
        }
      }
    });

    if (!updated) {
      return baseSettings;
    }

    const adjustedEnd = minutesToTime(workDayEndMinutes);
    if (adjustedEnd === baseSettings.workDayEnd) {
      return baseSettings;
    }
    return { ...baseSettings, workDayEnd: adjustedEnd };
  };

  const buildScheduleFailureReason = (task: Task, planSettings: Settings, warnings: PlanWarning[]) => {
    const completedMinutes = task.completedMinutes ?? 0;
    const remainingMinutes = Math.max(0, task.estimatedMinutes - completedMinutes);
    if (remainingMinutes <= 0) {
      return t("status.reason.completed");
    }
    if (task.deadline) {
      const deadline = new Date(task.deadline);
      if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()) {
        return t("status.reason.deadlinePassed");
      }
    }
    if (task.earliestStart && task.deadline) {
      const earliest = new Date(task.earliestStart);
      const deadline = new Date(task.deadline);
      if (earliest.getTime() > deadline.getTime()) {
        return t("status.reason.deadlineConflict");
      }
    }
    const workStart = timeToMinutes(planSettings.workDayStart);
    const workEnd = timeToMinutes(planSettings.workDayEnd);
    const workMinutes = Math.max(0, workEnd - workStart);
    if (workMinutes <= 0) {
      return t("status.reason.workHours");
    }
    const lunchMinutes = overlapMinutes(
      workStart,
      workEnd,
      timeToMinutes(planSettings.lunchStart),
      timeToMinutes(planSettings.lunchEnd)
    );
    const availableWorkMinutes = Math.max(0, workMinutes - lunchMinutes);
    if (availableWorkMinutes <= 0) {
      return t("status.reason.workHours");
    }
    const dailyCapacity = Math.min(planSettings.maxDailyMinutes, availableWorkMinutes);
    if (dailyCapacity < task.minBlockMinutes) {
      return t("status.reason.dailyLimit", {
        limit: dailyCapacity,
        min: task.minBlockMinutes
      });
    }
    const horizonCapacity = dailyCapacity * planSettings.planningHorizonDays;
    if (horizonCapacity < remainingMinutes) {
      return t("status.reason.horizon", {
        capacity: horizonCapacity,
        needed: remainingMinutes
      });
    }
    const warning = warnings.find((item) => item.taskId === task.id);
    if (warning) {
      if (warning.code === "INSUFFICIENT_TIME") {
        return t("status.reason.noFreeSlots");
      }
      if (warning.code === "DEADLINE_ALREADY_PASSED") {
        return t("status.reason.deadlinePassed");
      }
      return warning.message;
    }
    return t("status.reason.noFreeSlots");
  };

  const handleGenerateTip = async () => {
    if (!currentTask) {
      setFocusTip(t("sticky.noTaskTitle"));
      return;
    }
    if (!apiSettings.apiKey) {
      setFocusTip(t("sticky.tipNeedKey"));
      return;
    }
    setTipBusy(true);
    try {
      const tip = await generateFocusTip(
        { title: currentTask.title, description: currentTask.description },
        apiSettings,
        language
      );
      setFocusTip(tip);
    } catch (error) {
      setFocusTip(error instanceof Error ? error.message : t("sticky.tipFailed"));
    } finally {
      setTipBusy(false);
    }
  };

  const handleGeneratePlan = () => {
    if (tasks.length === 0) {
      setStatusMessage(t("status.addTaskPrompt"));
      return;
    }
    const horizonSettings = expandPlanningHorizon(tasks, settings);
    const planSettings = extendWorkHoursForTasks(tasks, horizonSettings);
    const result = generatePlan(tasks, events, planSettings, plan?.blocks.filter((block) => block.locked) ?? []);
    result.assumptions = mergeAssumptions(result.assumptions);
    setPlan(result);
    setStatusMessage(t("status.planGenerated", { time: new Date(result.generatedAt).toLocaleTimeString() }));
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      setStatusMessage(t("status.parseEnter"));
      return;
    }
    setIsParsing(true);
    setStatusMessage(t("status.parsing"));
    try {
      const result = await parseTasksFromText(inputText, apiSettings, {
        timezone: settings.timezone,
        workDayStart: settings.workDayStart,
        workDayEnd: settings.workDayEnd
      });
      const baseTasks = tasksRef.current;
      const baseAiAssumptions = aiAssumptionsRef.current;
      const baseEvents = eventsRef.current;
      const baseSettings = settingsRef.current;
      const basePlan = planRef.current;
      const nextTasks = [...baseTasks, ...result.tasks];
      const nextAiAssumptions = uniqueList([...baseAiAssumptions, ...result.assumptions]);
      setTasks(nextTasks);
      setAiAssumptions(nextAiAssumptions);
      if (result.tasks.length > 0) {
        const horizonSettings = expandPlanningHorizon(nextTasks, baseSettings);
        const planSettings = extendWorkHoursForTasks(nextTasks, horizonSettings);
        const nextPlan = generatePlan(
          nextTasks,
          baseEvents,
          planSettings,
          basePlan?.blocks.filter((block) => block.locked) ?? []
        );
        nextPlan.assumptions = mergeAssumptions(nextPlan.assumptions, nextTasks, nextAiAssumptions);
        setPlan(nextPlan);
        setStatusMessage(t("status.planGenerated", { time: new Date(nextPlan.generatedAt).toLocaleTimeString() }));
      } else {
        setStatusMessage(t("status.parsed", { count: result.tasks.length }));
      }
    } catch (error) {
      const fallback = t("status.parseFailed");
      setStatusMessage(error instanceof Error ? `${fallback} ${error.message}` : fallback);
    } finally {
      setIsParsing(false);
    }
  };

  const triggerTaskFormPulse = () => {
    setTaskFormPulseKey(Date.now());
  };

  const handleExplainPlan = async () => {
    if (!plan || plan.blocks.length === 0) {
      setStatusMessage(t("status.noPlan"));
      return;
    }
    if (!apiSettings.apiKey) {
      setStatusMessage(t("status.explainNeedKey"));
      return;
    }
    setIsExplaining(true);
    setExplanation("");
    try {
      const content = await explainPlan(plan, tasks, apiSettings, {
        language,
        timezone: settings.timezone,
        workDayStart: settings.workDayStart,
        workDayEnd: settings.workDayEnd
      });
      setExplanation(content);
      setExplanationOpen(true);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("status.explainFailed"));
    } finally {
      setIsExplaining(false);
    }
  };

  useEffect(() => {
    if (!uiSettings.stickyMode || !uiSettings.tipsEnabled) {
      return;
    }
    if (!currentTask) {
      setFocusTip(t("sticky.noTaskTitle"));
      return;
    }
    handleGenerateTip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiSettings.stickyMode, uiSettings.tipsEnabled, currentTask?.id]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const applyWindowState = async () => {
      if (uiSettings.stickyMode) {
        setSettingsOpen(false);
        setTaskDetail(null);
        setKnowledgeModal(null);
        setExplanationOpen(false);
        const size = await appWindow.outerSize();
        const resizable = await appWindow.isResizable();
        if (!previousWindowState.current) {
          previousWindowState.current = { size, resizable };
        }
        await appWindow.setResizable(false);
        await appWindow.setSize(new LogicalSize(420, 260));
        await appWindow.setAlwaysOnTop(uiSettings.alwaysOnTop);
      } else if (previousWindowState.current) {
        await appWindow.setAlwaysOnTop(false);
        await appWindow.setResizable(previousWindowState.current.resizable);
        await appWindow.setSize(previousWindowState.current.size);
        previousWindowState.current = null;
      }
    };
    applyWindowState();
  }, [isTauri, uiSettings.alwaysOnTop, uiSettings.stickyMode]);

  const handleMinimize = async () => {
    if (!isTauri) {
      return;
    }
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    if (!isTauri) {
      return;
    }
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    if (!isTauri) {
      return;
    }
    await appWindow.close();
  };

  if (uiSettings.stickyMode) {
    return (
      <div className="app sticky-mode">
        <div className="titlebar sticky-titlebar" data-tauri-drag-region>
          <div className="titlebar-left" data-tauri-drag-region>
            <AppLogo />
            <span className="product-name">{t("header.eyebrow")}</span>
          </div>
          <div className="titlebar-actions">
            <button className="button tiny ghost" onClick={() => setUiSettings((prev) => ({ ...prev, stickyMode: false }))}>
              {t("sticky.exit")}
            </button>
          </div>
        </div>
        <div className="sticky-card">
          <div className="sticky-time">{currentTaskRange || t("sticky.noTime")}</div>
          <div className="sticky-task">{currentTask ? currentTask.title : t("sticky.noTaskTitle")}</div>
          {currentTask?.description ? <div className="sticky-notes">{currentTask.description}</div> : null}
          <div className="sticky-tip">
            {uiSettings.tipsEnabled ? focusTip || t("sticky.tipPlaceholder") : t("sticky.tipDisabled")}
          </div>
          <div className="sticky-actions">
            <button className="button tiny" onClick={handleGenerateTip} disabled={tipBusy || !uiSettings.tipsEnabled}>
              {tipBusy ? t("sticky.tipLoading") : t("sticky.tip")}
            </button>
            <label className="field inline sticky-toggle">
              <input
                type="checkbox"
                checked={uiSettings.alwaysOnTop}
                onChange={(event) =>
                  setUiSettings((prev) => ({ ...prev, alwaysOnTop: event.target.checked }))
                }
              />
              <span>{t("sticky.alwaysOnTop")}</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <AppLogo />
          <span className="product-name">{t("header.eyebrow")}</span>
        </div>
        <div className="titlebar-center">
          <a className="contact-link" href={contactUrl} target="_blank" rel="noreferrer">
            <GithubIcon />
            <span>{t("contact.label")}</span>
            <span className="contact-url">github.com/1sh1ro</span>
          </a>
        </div>
        <div className="titlebar-actions">
          <button className="titlebar-button" onClick={handleMinimize} disabled={!isTauri} aria-label="Minimize">
            <span className="titlebar-glyph">–</span>
          </button>
          <button className="titlebar-button" onClick={handleMaximize} disabled={!isTauri} aria-label="Maximize">
            <span className="titlebar-glyph">▢</span>
          </button>
          <button
            className="titlebar-button close"
            onClick={handleClose}
            disabled={!isTauri}
            aria-label="Close"
          >
            <span className="titlebar-glyph">×</span>
          </button>
        </div>
      </div>
      <header className="app-header">
        <div data-tauri-drag-region>
          <h1>{currentTime}</h1>
        </div>
        <div className="status" data-tauri-drag-region>
          {statusMessage}
        </div>
        <div className="header-actions">
          <button className="button ghost" onClick={() => setSettingsOpen(true)}>
            {t("header.settings")}
          </button>
        </div>
      </header>

      <div className={`layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="column primary">
          <TaskForm
            draft={draft}
            onChange={setDraft}
            onSubmit={handleSaveTask}
            onReset={handleResetDraft}
            selectedTask={selectedTask}
            highlightKey={taskFormPulseKey}
            t={t}
          />
          <div className="panel">
            <div className="panel-header">
              <h2>{t("nl.title")}</h2>
            </div>
            <div className="panel-body">
              <textarea
                className="input-area"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={t("nl.placeholder")}
              />
              <div className="button-row">
                <button className="button" onClick={handleParse} disabled={isParsing}>
                  {isParsing ? t("nl.parsing") : t("nl.parse")}
                </button>
              </div>
            </div>
          </div>
          <TaskList
            tasks={tasks}
            onSelect={openTaskDetail}
            onDelete={handleDeleteTask}
            onAddToCalendar={handleAddTaskToCalendar}
            onGeneratePlan={handleGeneratePlan}
            canGenerate={canGeneratePlan}
            t={t}
          />
        </div>
        <div className="column wide">
          <CalendarWeek
            blocks={plan?.blocks ?? []}
            events={events}
            settings={settings}
            taskMap={taskMap}
            taskDifficultyMap={taskDifficultyMap}
            t={t}
            viewMode={calendarView}
            onViewModeChange={setCalendarView}
            onBlockSelect={handleCalendarBlockSelect}
            onBlockMove={handleCalendarBlockMove}
            onGeneratePlan={handleGeneratePlan}
            onExplainPlan={handleExplainPlan}
            onClearLocks={handleClearLocks}
            hasPlan={hasPlanBlocks}
            hasLockedBlocks={hasLockedBlocks}
            isExplaining={isExplaining}
            canGenerate={canGeneratePlan}
            now={now}
          />
        </div>
        <div className={`column side sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sidebar-header">
            <span>{t("sidebar.title")}</span>
            <button
              className="button tiny ghost"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          </div>
          <div className="sidebar-tabs">
            <button
              className={`chip ${sidebarTab === "memo" ? "active" : ""}`}
              onClick={() => setSidebarTab("memo")}
            >
              {t("memo.title")}
            </button>
            <button
              className={`chip ${sidebarTab === "knowledge" ? "active" : ""}`}
              onClick={() => setSidebarTab("knowledge")}
            >
              {t("knowledge.title")}
            </button>
            <button
              className={`chip ${sidebarTab === "ai" ? "active" : ""}`}
              onClick={() => setSidebarTab("ai")}
            >
              {t("ai.title")}
            </button>
          </div>
          <div className="sidebar-content">
            {sidebarTab === "memo" ? <MemoPanel memo={memo} onChange={setMemo} t={t} /> : null}
            {sidebarTab === "knowledge" ? (
              <KnowledgeBasePanel
                categories={knowledgeCategories}
                items={knowledgeItems}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
                onAddCategory={handleAddCategory}
                draft={knowledgeDraft}
                onDraftChange={setKnowledgeDraft}
                onAddItem={handleAddKnowledgeItem}
                onViewItem={handleViewKnowledgeItem}
                onDeleteItem={handleDeleteKnowledgeItem}
                t={t}
              />
            ) : null}
            {sidebarTab === "ai" ? (
              <KnowledgeAiPanel
                mode={aiMode}
                onModeChange={setAiMode}
                question={aiQuestion}
                onQuestionChange={setAiQuestion}
                response={aiResponse}
                suggestion={aiSuggestion}
                onAsk={handleAskKnowledge}
                onClassify={handleClassifyKnowledge}
                onApplySuggestion={applyAiSuggestion}
                isBusy={aiBusy}
                draft={{ title: knowledgeDraft.title, content: knowledgeDraft.content }}
                categories={knowledgeCategories}
                t={t}
              />
            ) : null}
          </div>
        </div>
      </div>
      {settingsOpen ? (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="button ghost tiny modal-close" onClick={() => setSettingsOpen(false)}>
              {t("modal.close")}
            </button>
            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              apiSettings={apiSettings}
              onApiSettingsChange={setApiSettings}
              uiSettings={uiSettings}
              onUiSettingsChange={setUiSettings}
              language={language}
              onLanguageChange={setLanguage}
              t={t}
            />
          </div>
        </div>
      ) : null}
      {knowledgeModal ? (
        <div className="modal-backdrop" onClick={() => setKnowledgeModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="button ghost tiny modal-close" onClick={() => setKnowledgeModal(null)}>
              {t("modal.close")}
            </button>
            <div className="panel compact knowledge-modal">
              <div className="panel-header">
                <h2>{t("knowledge.detailsTitle")}</h2>
              </div>
              <div className="panel-body">
                <strong>{knowledgeModal.title}</strong>
                <div className="knowledge-meta">
                  {t("knowledge.category")}:{" "}
                  {knowledgeCategories.find((category) => category.id === knowledgeModal.categoryId)?.name ??
                    t("knowledge.uncategorized")}
                </div>
                <div className="knowledge-meta">
                  {t("knowledge.createdAt")}: {new Date(knowledgeModal.createdAt).toLocaleString()}
                </div>
                <div className="knowledge-full">{knowledgeModal.content}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {taskDetail ? (
        <div className="modal-backdrop" onClick={closeTaskDetail}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="button ghost tiny modal-close" onClick={closeTaskDetail}>
              {t("modal.close")}
            </button>
            <div className="panel compact task-modal">
              <div className="panel-header">
                <h2>{t("modal.taskDetailsTitle")}</h2>
              </div>
              <div className="panel-body">
                <div className="section">
                  <strong>{taskDetail.title}</strong>
                  <div className="description">
                    {taskDetail.description?.trim() ? taskDetail.description : t("modal.noDescription")}
                  </div>
                </div>
                <div className="section">
                  <h3>{t("modal.progress")}</h3>
                  <input
                    className="slider"
                    type="range"
                    min={0}
                    max={taskDetail.estimatedMinutes}
                    step={5}
                    value={Math.min(taskCompleted, taskDetail.estimatedMinutes)}
                    onChange={(event) => setTaskCompleted(Number(event.target.value))}
                  />
                  <div className="progress-meta">
                    {t("modal.completed")}: {Math.min(taskCompleted, taskDetail.estimatedMinutes)} min |{" "}
                    {t("modal.remaining")}:{" "}
                    {Math.max(0, taskDetail.estimatedMinutes - Math.min(taskCompleted, taskDetail.estimatedMinutes))} min
                  </div>
                </div>
                <div className="section">
                  <h3>{t("modal.details")}</h3>
                  <div className="details-grid">
                    <div>
                      <span>{t("modal.priority")}</span>
                      <strong> P{taskDetail.priority}</strong>
                    </div>
                    <div>
                      <span>{t("modal.estimate")}</span>
                      <strong> {taskDetail.estimatedMinutes} min</strong>
                    </div>
                    <div>
                      <span>{t("modal.minBlock")}</span>
                      <strong> {taskDetail.minBlockMinutes} min</strong>
                    </div>
                    <div>
                      <span>{t("modal.maxBlock")}</span>
                      <strong> {taskDetail.maxBlockMinutes ?? taskDetail.estimatedMinutes} min</strong>
                    </div>
                    <div>
                      <span>{t("modal.deadline")}</span>
                      <strong> {taskDetail.deadline ? new Date(taskDetail.deadline).toLocaleString() : "-"}</strong>
                    </div>
                    <div>
                      <span>{t("modal.earliest")}</span>
                      <strong> {taskDetail.earliestStart ? new Date(taskDetail.earliestStart).toLocaleString() : "-"}</strong>
                    </div>
                    <div>
                      <span>{t("modal.interruptible")}</span>
                      <strong> {taskDetail.interruptible ? t("modal.yes") : t("modal.no")}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className="panel-footer">
                <button
                  className="button ghost"
                  onClick={() => {
                    handleSelectTask(taskDetail);
                    triggerTaskFormPulse();
                    closeTaskDetail();
                  }}
                >
                  {t("modal.editTask")}
                </button>
                <button className="button primary" onClick={saveTaskProgress}>
                  {t("modal.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {explanationOpen ? (
        <div className="modal-backdrop" onClick={() => setExplanationOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="button ghost tiny modal-close" onClick={() => setExplanationOpen(false)}>
              {t("modal.close")}
            </button>
            <div className="panel compact">
              <div className="panel-header">
                <h2>{t("nl.explainTitle")}</h2>
              </div>
              <div className="panel-body">
                <div className="explanation-text">
                  {explanation ? explanation : t("nl.noExplanation")}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
