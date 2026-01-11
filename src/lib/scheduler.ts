import { addDays, combineDateAndTime, dayKey, minutesBetween, startOfDay, weekDayShort } from "./time";
import type {
  CalendarEvent,
  PlanResult,
  PlanWarning,
  PlannedBlock,
  Settings,
  Task
} from "./types";

type Interval = {
  start: Date;
  end: Date;
};

const createInterval = (start: Date, end: Date): Interval | null => {
  if (end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
};

const overlaps = (a: Interval, b: Interval) => {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
};

const subtractInterval = (base: Interval, cut: Interval): Interval[] => {
  if (!overlaps(base, cut)) {
    return [base];
  }
  const intervals: Interval[] = [];
  if (cut.start.getTime() > base.start.getTime()) {
    intervals.push({ start: base.start, end: new Date(cut.start) });
  }
  if (cut.end.getTime() < base.end.getTime()) {
    intervals.push({ start: new Date(cut.end), end: base.end });
  }
  return intervals;
};

const subtractIntervals = (bases: Interval[], cuts: Interval[]) => {
  return cuts.reduce((current, cut) => {
    return current.flatMap((base) => subtractInterval(base, cut));
  }, bases);
};

const sortByStart = (a: Interval, b: Interval) => a.start.getTime() - b.start.getTime();

const buildFreeSlots = (
  startDay: Date,
  settings: Settings,
  events: CalendarEvent[],
  lockedBlocks: PlannedBlock[]
) => {
  const slotsByDay = new Map<string, Interval[]>();
  const busyIntervals: Interval[] = [];

  events
    .filter((event) => event.busy)
    .forEach((event) => {
      busyIntervals.push({ start: new Date(event.start), end: new Date(event.end) });
    });

  lockedBlocks.forEach((block) => {
    busyIntervals.push({ start: new Date(block.start), end: new Date(block.end) });
  });

  for (let offset = 0; offset < settings.planningHorizonDays; offset += 1) {
    const day = addDays(startDay, offset);
    const dayStart = combineDateAndTime(day, settings.workDayStart);
    const dayEnd = combineDateAndTime(day, settings.workDayEnd);
    const workingInterval = createInterval(dayStart, dayEnd);
    if (!workingInterval) {
      slotsByDay.set(dayKey(day), []);
      continue;
    }

    const cuts: Interval[] = [];
    const lunchStart = combineDateAndTime(day, settings.lunchStart);
    const lunchEnd = combineDateAndTime(day, settings.lunchEnd);
    const lunchInterval = createInterval(lunchStart, lunchEnd);
    if (lunchInterval) {
      cuts.push(lunchInterval);
    }

    busyIntervals.forEach((busy) => {
      const cutStart = busy.start.getTime() < dayStart.getTime() ? dayStart : busy.start;
      const cutEnd = busy.end.getTime() > dayEnd.getTime() ? dayEnd : busy.end;
      const cutInterval = createInterval(cutStart, cutEnd);
      if (cutInterval) {
        cuts.push(cutInterval);
      }
    });

    const free = subtractIntervals([workingInterval], cuts).sort(sortByStart);
    slotsByDay.set(dayKey(day), free);
  }

  return slotsByDay;
};

const isPreferredWindow = (task: Task, date: Date) => {
  if (!task.preferredTimeWindows || task.preferredTimeWindows.length === 0) {
    return false;
  }
  const day = weekDayShort(date);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return task.preferredTimeWindows.some((window) => {
    if (!window.days.includes(day)) {
      return false;
    }
    const [startHour, startMinute] = window.start.split(":").map(Number);
    const [endHour, endMinute] = window.end.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    return minutes >= startMinutes && minutes < endMinutes;
  });
};

const confidenceForBlock = (preferred: boolean, nearDeadline: boolean, firstBlock: boolean) => {
  let score = 0.6;
  if (preferred) {
    score += 0.2;
  }
  if (nearDeadline) {
    score += 0.1;
  }
  if (firstBlock) {
    score += 0.05;
  }
  return Math.min(0.95, Math.max(0.2, score));
};

const deadlineIsNear = (deadline: string | undefined, date: Date) => {
  if (!deadline) {
    return false;
  }
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - date.getTime();
  return diff <= 48 * 60 * 60 * 1000 && diff >= 0;
};

const taskSort = (a: Task, b: Task) => {
  const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
  if (aDeadline !== bDeadline) {
    return aDeadline - bDeadline;
  }
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  return a.title.localeCompare(b.title);
};

const minutesByDay = (blocks: PlannedBlock[]) => {
  const totals: Record<string, number> = {};
  blocks.forEach((block) => {
    const start = new Date(block.start);
    const key = dayKey(start);
    const duration = minutesBetween(new Date(block.start), new Date(block.end));
    totals[key] = (totals[key] ?? 0) + duration;
  });
  return totals;
};

const minutesByTask = (blocks: PlannedBlock[]) => {
  const totals: Record<string, number> = {};
  blocks.forEach((block) => {
    const duration = minutesBetween(new Date(block.start), new Date(block.end));
    totals[block.taskId] = (totals[block.taskId] ?? 0) + duration;
  });
  return totals;
};

const latestDependencyEnd = (task: Task, blocks: PlannedBlock[]) => {
  if (!task.dependencies || task.dependencies.length === 0) {
    return null;
  }
  const dependentBlocks = blocks.filter((block) => task.dependencies?.includes(block.taskId));
  if (dependentBlocks.length === 0) {
    return null;
  }
  return dependentBlocks.reduce((latest, block) => {
    const end = new Date(block.end);
    return end.getTime() > latest.getTime() ? end : latest;
  }, new Date(dependentBlocks[0].end));
};

const addWarning = (warnings: PlanWarning[], warning: PlanWarning) => {
  warnings.push(warning);
};

const validateBlocks = (
  blocks: PlannedBlock[],
  events: CalendarEvent[],
  settings: Settings,
  warnings: PlanWarning[]
) => {
  const busyIntervals = events.filter((event) => event.busy).map((event) => ({
    start: new Date(event.start),
    end: new Date(event.end)
  }));

  blocks.forEach((block) => {
    const blockInterval = { start: new Date(block.start), end: new Date(block.end) };
    const day = startOfDay(blockInterval.start);
    const workStart = combineDateAndTime(day, settings.workDayStart);
    const workEnd = combineDateAndTime(day, settings.workDayEnd);

    if (blockInterval.start.getTime() < workStart.getTime() || blockInterval.end.getTime() > workEnd.getTime()) {
      addWarning(warnings, {
        code: "OUTSIDE_WORK_HOURS",
        message: `Block ${block.id} sits outside working hours.`
      });
    }

    busyIntervals.forEach((busy) => {
      if (overlaps(blockInterval, busy)) {
        addWarning(warnings, {
          code: "OVERLAPS_BUSY",
          message: `Block ${block.id} overlaps a busy event.`
        });
      }
    });
  });

  const sorted = [...blocks].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = { start: new Date(sorted[i].start), end: new Date(sorted[i].end) };
    const next = { start: new Date(sorted[i + 1].start), end: new Date(sorted[i + 1].end) };
    if (overlaps(current, next)) {
      addWarning(warnings, {
        code: "BLOCK_OVERLAP",
        message: `Blocks ${sorted[i].id} and ${sorted[i + 1].id} overlap.`
      });
    }
  }
};

export const generatePlan = (
  tasks: Task[],
  events: CalendarEvent[],
  settings: Settings,
  lockedBlocks: PlannedBlock[] = []
): PlanResult => {
  const warnings: PlanWarning[] = [];
  const now = new Date();
  const startDay = startOfDay(now);
  const slotsByDay = buildFreeSlots(startDay, settings, events, lockedBlocks);
  const planBlocks: PlannedBlock[] = [...lockedBlocks];
  const dailyTotals = minutesByDay(lockedBlocks);
  const lockedMinutesByTask = minutesByTask(lockedBlocks);

  const sortedTasks = [...tasks].sort(taskSort);

  sortedTasks.forEach((task) => {
    const lockedMinutes = lockedMinutesByTask[task.id] ?? 0;
    const completedMinutes = task.completedMinutes ?? 0;
    let remaining = Math.max(0, task.estimatedMinutes - completedMinutes - lockedMinutes);
    if (remaining === 0) {
      return;
    }

    const dependencyEnd = latestDependencyEnd(task, planBlocks);
    const earliestStart = task.earliestStart ? new Date(task.earliestStart) : now;
    const earliest = dependencyEnd && dependencyEnd.getTime() > earliestStart.getTime() ? dependencyEnd : earliestStart;
    const deadline = task.deadline ? new Date(task.deadline) : null;

    if (deadline && earliest.getTime() > deadline.getTime()) {
      addWarning(warnings, {
        code: "DEADLINE_ALREADY_PASSED",
        message: `${task.title} has an earliest start after its deadline.`,
        taskId: task.id
      });
      return;
    }

    const minBlock = task.interruptible ? task.minBlockMinutes : remaining;
    const maxBlock = task.maxBlockMinutes ?? remaining;
    let firstBlock = true;

    for (let offset = 0; offset < settings.planningHorizonDays; offset += 1) {
      if (remaining <= 0) {
        break;
      }
      const day = addDays(startDay, offset);
      const dayKeyValue = dayKey(day);
      const slots = slotsByDay.get(dayKeyValue) ?? [];
      if (slots.length === 0) {
        continue;
      }

      const dayStart = combineDateAndTime(day, settings.workDayStart);
      const dayEnd = combineDateAndTime(day, settings.workDayEnd);
      if (earliest.getTime() > dayEnd.getTime()) {
        continue;
      }
      if (deadline && deadline.getTime() < dayStart.getTime()) {
        break;
      }

      for (let index = 0; index < slots.length; index += 1) {
        if (remaining <= 0) {
          break;
        }
        const slot = slots[index];
        let slotStart = slot.start.getTime() < earliest.getTime() ? new Date(earliest) : new Date(slot.start);
        let slotEnd = new Date(slot.end);
        if (deadline && slotEnd.getTime() > deadline.getTime()) {
          slotEnd = new Date(deadline);
        }
        if (slotEnd.getTime() <= slotStart.getTime()) {
          continue;
        }

        while (remaining > 0) {
          const availableMinutes = minutesBetween(slotStart, slotEnd);
          const alreadyPlanned = dailyTotals[dayKeyValue] ?? 0;
          const remainingDaily = settings.maxDailyMinutes - alreadyPlanned;
          const canFit = Math.min(availableMinutes, remainingDaily, maxBlock, remaining);

          if (availableMinutes < minBlock || remainingDaily < minBlock || canFit < minBlock) {
            break;
          }

          const blockMinutes = canFit;
          const blockEnd = new Date(slotStart.getTime() + blockMinutes * 60000);
          const preferred = isPreferredWindow(task, slotStart);
          const nearDeadline = deadlineIsNear(task.deadline, slotStart);
          const block: PlannedBlock = {
            id: `${task.id}-${slotStart.getTime()}`,
            taskId: task.id,
            start: slotStart.toISOString(),
            end: blockEnd.toISOString(),
            confidence: confidenceForBlock(preferred, nearDeadline, firstBlock),
            reasonCodes: [
              firstBlock ? "FIRST_AVAILABLE" : "CHUNKED",
              preferred ? "PREFERRED_WINDOW" : "EARLIEST_SLOT",
              nearDeadline ? "NEAR_DEADLINE" : "NORMAL_BUFFER"
            ].filter((value) => value !== "")
          };

          planBlocks.push(block);
          dailyTotals[dayKeyValue] = alreadyPlanned + blockMinutes;
          remaining -= blockMinutes;
          firstBlock = false;

          slotStart = new Date(blockEnd);
          if (!task.interruptible) {
            remaining = 0;
            break;
          }
          if (minutesBetween(slotStart, slotEnd) < minBlock) {
            break;
          }
        }

        if (slotStart.getTime() >= slotEnd.getTime()) {
          slots.splice(index, 1);
          index -= 1;
        } else {
          slots[index] = { start: slotStart, end: slotEnd };
        }
      }
    }

    if (remaining > 0) {
      addWarning(warnings, {
        code: "INSUFFICIENT_TIME",
        message: `${task.title} has ${remaining} minutes unscheduled within the horizon.`,
        taskId: task.id
      });
    }
  });

  validateBlocks(planBlocks, events, settings, warnings);

  const assumptions = [
    `Working hours ${settings.workDayStart}-${settings.workDayEnd}`,
    `Lunch break ${settings.lunchStart}-${settings.lunchEnd}`,
    `Max daily focus ${settings.maxDailyMinutes} minutes`
  ];

  return {
    blocks: planBlocks,
    warnings,
    assumptions,
    generatedAt: new Date().toISOString()
  };
};
