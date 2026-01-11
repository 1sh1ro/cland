import { useEffect, useMemo, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
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
  answerKnowledgeQuestion
} from "./lib/api";
import { createTranslator, type Language } from "./lib/i18n";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { fromLocalInputValue, toLocalInputValue } from "./lib/time";
import { generatePlan } from "./lib/scheduler";
import type {
  ApiSettings,
  CalendarEvent,
  CalendarViewMode,
  KnowledgeCategory,
  KnowledgeItem,
  PlanResult,
  PlannedBlock,
  Settings,
  Task
} from "./lib/types";

const STORAGE_KEYS = {
  tasks: "cland.tasks",
  events: "cland.events",
  settings: "cland.settings",
  plan: "cland.plan",
  apiSettings: "cland.api",
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
  workDayEnd: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  maxDailyMinutes: 360
};

const defaultApiSettings: ApiSettings = {
  provider: coerceProvider(import.meta.env.VITE_API_PROVIDER),
  baseUrl: import.meta.env.VITE_API_BASE_URL || "https://api.longcat.chat/openai",
  apiKey: import.meta.env.VITE_API_KEY || "",
  model: import.meta.env.VITE_API_MODEL || "LongCat-Flash-Chat",
  taskSystemPrompt: DEFAULT_TASK_SYSTEM_PROMPT
};

const coerceApiSettings = (value: unknown): ApiSettings => {
  if (!value || typeof value !== "object") {
    return defaultApiSettings;
  }
  const candidate = value as Partial<ApiSettings>;
  return {
    ...defaultApiSettings,
    ...candidate,
    provider: coerceProvider(typeof candidate.provider === "string" ? candidate.provider : undefined),
    taskSystemPrompt:
      typeof candidate.taskSystemPrompt === "string" && candidate.taskSystemPrompt.trim()
        ? candidate.taskSystemPrompt
        : defaultApiSettings.taskSystemPrompt
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
  const [draft, setDraft] = useState<TaskDraft>(() => createEmptyDraft());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [inputText, setInputText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

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

  const mergeAssumptions = (baseAssumptions: string[]) => {
    const taskAssumptions = tasks.flatMap((task) => task.assumptions ?? []);
    return uniqueList([...baseAssumptions, ...aiAssumptions, ...taskAssumptions]);
  };

  const handleGeneratePlan = () => {
    if (tasks.length === 0) {
      setStatusMessage(t("status.addTaskPrompt"));
      return;
    }
    const result = generatePlan(tasks, events, settings, plan?.blocks.filter((block) => block.locked) ?? []);
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
      setTasks((prev) => [...prev, ...result.tasks]);
      setAiAssumptions((prev) => uniqueList([...prev, ...result.assumptions]));
      setStatusMessage(t("status.parsed", { count: result.tasks.length }));
    } catch (error) {
      const fallback = t("status.parseFailed");
      setStatusMessage(error instanceof Error ? `${fallback} ${error.message}` : fallback);
    } finally {
      setIsParsing(false);
    }
  };

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

  return (
    <div className="app">
      <div className="titlebar">
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
        <div>
          <h1>{currentTime}</h1>
        </div>
        <div className="status">{statusMessage}</div>
        <div className="header-actions">
          <button className="button primary" onClick={handleGeneratePlan}>
            {t("header.generatePlan")}
          </button>
          <button className="button ghost" onClick={() => setSettingsOpen(true)}>
            {t("header.settings")}
          </button>
        </div>
      </header>

      <div className="layout">
        <div className="column">
          <TaskForm
            draft={draft}
            onChange={setDraft}
            onSubmit={handleSaveTask}
            onReset={handleResetDraft}
            selectedTask={selectedTask}
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
              <button className="button" onClick={handleParse} disabled={isParsing}>
                {isParsing ? t("nl.parsing") : t("nl.parse")}
              </button>
            </div>
          </div>
          <TaskList tasks={tasks} onSelect={openTaskDetail} onDelete={handleDeleteTask} t={t} />
        </div>
        <div className="column wide">
          <CalendarWeek
            blocks={plan?.blocks ?? []}
            events={events}
            settings={settings}
            taskMap={taskMap}
            t={t}
            viewMode={calendarView}
            onViewModeChange={setCalendarView}
            onBlockSelect={handleCalendarBlockSelect}
            onBlockMove={handleCalendarBlockMove}
          />
        </div>
        <div className="column side">
          <MemoPanel memo={memo} onChange={setMemo} t={t} />
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
    </div>
  );
};

export default App;
