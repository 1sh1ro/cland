import type { ApiSettings, PlanResult, Task } from "./types";

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

export const parseTasksFromText = async (
  input: string,
  settings: ApiSettings,
  context: { timezone: string; workDayStart: string; workDayEnd: string }
): Promise<{ tasks: Task[]; assumptions: string[] }> => {
  const systemPrompt = `You extract structured tasks for a planner. Return JSON only.
JSON shape: { "tasks": [ { "title": string, "description": string, "estimated_minutes": number, "deadline": string | null, "earliest_start": string | null, "priority": number (1-5), "interruptible": boolean, "min_block_minutes": number, "max_block_minutes": number | null, "preferred_time_windows": [{"days": ["Mon"], "start": "09:00", "end": "12:00"}], "assumptions": [string] } ], "assumptions": [string] }.
Use timezone ${context.timezone}. Default working hours ${context.workDayStart}-${context.workDayEnd}. Minimum block is 30 minutes.`;

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
