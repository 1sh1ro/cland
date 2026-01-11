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
  const promptTemplate = settings.taskSystemPrompt?.trim() || DEFAULT_TASK_SYSTEM_PROMPT;
  const systemPrompt = applyPromptContext(promptTemplate, context);

  const userPrompt = `Task input:\n${input}`;

  const content = await callModel(settings, [
    { role: "system", content: systemPrompt },
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
  settings: ApiSettings
): Promise<string> => {
  const prompt = `Explain the schedule in concise bullet points and mention conflicts or risks. Provide 2 alternative strategies (conservative and aggressive). Keep it under 180 words.\n\nTasks: ${JSON.stringify(tasks)}\nPlan: ${JSON.stringify(plan)}`;

  const content = await callModel(settings, [
    { role: "system", content: "You are a planning assistant." },
    { role: "user", content: prompt }
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
