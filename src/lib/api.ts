import type { ApiSettings, PlanResult, Task } from "./types";

export const DEFAULT_TASK_SYSTEM_PROMPT = `You extract structured tasks for a planner. Return JSON only (no Markdown, no extra text).
JSON shape: { "tasks": [ { "title": string, "description": string, "estimated_minutes": number, "deadline": string | null, "earliest_start": string | null, "priority": number (1-5), "interruptible": boolean, "min_block_minutes": number, "max_block_minutes": number | null, "preferred_time_windows": [{"days": ["Mon"], "start": "09:00", "end": "12:00"}], "assumptions": [string] } ], "assumptions": [string] }.
Planning guidance:
- Use timezone {{timezone}}. Dates must be ISO 8601 with timezone (e.g. 2026-01-15T18:00:00+08:00), or null.
- Default working hours are {{workDayStart}}-{{workDayEnd}}. Map time-of-day mentions to preferred_time_windows: morning 09:00-12:00, afternoon 13:00-18:00, evening 19:00-22:00, lunch 12:00-13:00 (avoid).
- If multiple tasks are mentioned, split into multiple tasks.
- If duration is given, convert to minutes. If missing, infer a reasonable estimate and add an assumption explaining the basis.
- Choose interruptible/min/max blocks to help scheduling: short tasks (<=60m) use 30m blocks; medium (60-180m) use 60m blocks; long (>180m) use 60-120m blocks. If user says uninterrupted/continuous, set interruptible=false and min/max to full estimate.
- Set priority using urgency and importance cues (deadline soon, "ASAP", "important"). If not stated, default to 3 and add an assumption.
- If phrases like "today", "tonight", "this afternoon", or "next week" are used, translate them into earliest_start/deadline and add an assumption.
- Always include assumptions for any defaults or inferences.`;

const extractJson = (value: string) => {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found in response.");
  }
  const jsonText = value.slice(first, last + 1);
  return JSON.parse(jsonText);
};

const callOpenAI = async (settings: ApiSettings, messages: Array<{ role: string; content: string }>) => {
  const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Missing content from API response.");
  }
  return content as string;
};

const callAnthropic = async (settings: ApiSettings, messages: Array<{ role: string; content: string }>) => {
  const response = await fetch(`${settings.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1024,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error("Missing content from API response.");
  }
  return content as string;
};

const callModel = async (settings: ApiSettings, messages: Array<{ role: string; content: string }>) => {
  if (settings.provider === "anthropic") {
    return callAnthropic(settings, messages);
  }
  return callOpenAI(settings, messages);
};

const applyPromptContext = (
  prompt: string,
  context: { timezone: string; workDayStart: string; workDayEnd: string }
) => {
  return prompt
    .replaceAll("{{timezone}}", context.timezone)
    .replaceAll("{{workDayStart}}", context.workDayStart)
    .replaceAll("{{workDayEnd}}", context.workDayEnd);
};

export const parseTasksFromText = async (
  input: string,
  settings: ApiSettings,
  context: { timezone: string; workDayStart: string; workDayEnd: string }
): Promise<{ tasks: Task[]; assumptions: string[] }> => {
  const now = new Date();
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: context.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset"
  }).formatToParts(now);
  const getPart = (type: string) => nowParts.find((part) => part.type === type)?.value ?? "";
  const currentDate = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const currentTime = `${getPart("hour")}:${getPart("minute")}`;
  const currentWeekday = getPart("weekday");
  const currentOffset = getPart("timeZoneName");
  const currentStamp = `${currentDate} ${currentTime} (${currentWeekday}) ${currentOffset}`;

  const basePrompt = applyPromptContext(DEFAULT_TASK_SYSTEM_PROMPT, context);
  const customNotes = settings.taskPromptNotes?.trim();
  const systemPrompt = customNotes
    ? `${basePrompt}\n\nUser preferences (apply when relevant):\n${customNotes}`
    : basePrompt;
  const datedSystemPrompt = `${systemPrompt}\n\nCurrent date/time (${context.timezone}): ${currentStamp}. Use this to resolve relative dates like "today", "tomorrow", or weekday mentions.`;

  const userPrompt = `Task input:\n${input}\n\nCurrent date/time (${context.timezone}): ${currentStamp}`;

  const content = await callModel(settings, [
    { role: "system", content: datedSystemPrompt },
    { role: "user", content: userPrompt }
  ]);

  const parsed = extractJson(content);
  const tasks = (parsed.tasks ?? []).map((task: any) => {
    const rawMinBlock = Number(task.min_block_minutes ?? 30);
    const minBlockMinutes = Number.isFinite(rawMinBlock) ? Math.max(rawMinBlock, 30) : 30;
    const rawEstimate = Number(task.estimated_minutes ?? minBlockMinutes);
    const estimatedMinutes = Number.isFinite(rawEstimate) ? Math.max(rawEstimate, minBlockMinutes) : minBlockMinutes;
    const rawMaxBlock = task.max_block_minutes ? Number(task.max_block_minutes) : undefined;
    const maxBlockMinutes =
      rawMaxBlock && Number.isFinite(rawMaxBlock) ? Math.max(rawMaxBlock, minBlockMinutes) : undefined;

    return {
      id: crypto.randomUUID(),
      title: String(task.title ?? "Untitled"),
      description: task.description ? String(task.description) : "",
      estimatedMinutes,
      completedMinutes: 0,
      deadline: task.deadline ?? undefined,
      earliestStart: task.earliest_start ?? undefined,
      priority: Number(task.priority ?? 3),
      interruptible: Boolean(task.interruptible ?? true),
      minBlockMinutes,
      maxBlockMinutes,
      preferredTimeWindows: task.preferred_time_windows ?? undefined,
      assumptions: task.assumptions ?? []
    };
  }) as Task[];

  return {
    tasks,
    assumptions: parsed.assumptions ?? []
  };
};

export const explainPlan = async (
  plan: PlanResult,
  tasks: Task[],
  apiSettings: ApiSettings,
  options: { language: "zh" | "en"; timezone: string; workDayStart: string; workDayEnd: string }
): Promise<string> => {
  const systemPrompt = `You are a scheduling analyst. Explain why the plan is arranged the way it is.
Use ${options.language === "zh" ? "Chinese" : "English"}.
Be practical, focus on timing logic (deadline, priority, preferred windows, daily limits).`;

  const userPrompt = `Explain the schedule with these rules:
- Mention per-task reasons for placement (why morning/afternoon/evening, or why near deadline).
- Call out conflicts/risks from warnings and any unscheduled minutes.
- Keep it concise (<= 200 words) and use bullets if helpful.
- If no blocks exist, say the plan is empty and suggest generating again.

Context:
- Timezone: ${options.timezone}
- Working hours: ${options.workDayStart}-${options.workDayEnd}

Tasks: ${JSON.stringify(tasks)}
Plan: ${JSON.stringify(plan)}`;

  const content = await callModel(apiSettings, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  return content.trim();
};

export const generateFocusTip = async (
  task: { title: string; description?: string },
  settings: ApiSettings,
  language: "zh" | "en"
): Promise<string> => {
  const systemPrompt =
    language === "zh"
      ? "你是高效办公助手，只输出一句很短的实用建议（不超过20字），不要列表。"
      : "You are a focus coach. Return one short practical tip (<= 20 words), no bullets.";
  const userPrompt = `Task: ${task.title}\nNotes: ${task.description ?? ""}`;

  const content = await callModel(settings, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  return content.trim();
};

export const suggestCategoryForEntry = async (
  entry: { title: string; content: string },
  categories: string[],
  settings: ApiSettings
): Promise<{ category: string; reason: string }> => {
  const systemPrompt = `You assign a category for a knowledge base entry. Return JSON only.
JSON shape: { "category": string, "reason": string }.
Prefer one of the existing categories when possible.`;

  const userPrompt = `Existing categories: ${JSON.stringify(categories)}\nEntry title: ${entry.title}\nEntry content: ${entry.content}`;

  const content = await callModel(settings, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  const parsed = extractJson(content);
  return {
    category: String(parsed.category ?? "General"),
    reason: String(parsed.reason ?? "")
  };
};

export const answerKnowledgeQuestion = async (
  question: string,
  knowledge: Array<{ category: string; title: string; content: string }>,
  settings: ApiSettings
): Promise<string> => {
  const systemPrompt =
    "You answer questions using only the provided knowledge base entries. If the answer is not present, say it is not found in the knowledge base.";
  const userPrompt = `Question: ${question}\nKnowledge base: ${JSON.stringify(knowledge)}`;

  const content = await callModel(settings, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  return content.trim();
};
