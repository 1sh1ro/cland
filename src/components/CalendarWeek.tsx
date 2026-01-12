import { useMemo, useState } from "react";
import type { CalendarEvent, CalendarViewMode, PlannedBlock, Settings } from "../lib/types";
import { addDays, dayKey, formatShortDate, formatTimeRange, isWithin, startOfDay } from "../lib/time";

const segments = [
  { key: "morning", labelKey: "calendar.morning", start: 6 * 60, end: 12 * 60 },
  { key: "afternoon", labelKey: "calendar.afternoon", start: 12 * 60, end: 18 * 60 },
  { key: "evening", labelKey: "calendar.evening", start: 18 * 60, end: 24 * 60 }
];

type CalendarWeekProps = {
  blocks: PlannedBlock[];
  events: CalendarEvent[];
  settings: Settings;
  taskMap: Record<string, string>;
  taskDifficultyMap: Record<string, string>;
  t: (key: string) => string;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onBlockSelect: (block: PlannedBlock) => void;
  onBlockMove: (blockId: string, start: string, end: string) => void;
  onGeneratePlan: () => void;
  onExplainPlan: () => void;
  onClearLocks: () => void;
  hasPlan: boolean;
  hasLockedBlocks: boolean;
  isExplaining: boolean;
  canGenerate: boolean;
  now: Date;
};

type SegmentItem = {
  id: string;
  kind: "busy" | "block";
  title: string;
  start: string;
  end: string;
  locked?: boolean;
  block?: PlannedBlock;
};

const minutesFromDayStart = (date: Date) => date.getHours() * 60 + date.getMinutes();

const isInSegment = (start: Date, end: Date, segmentStart: number, segmentEnd: number) => {
  const startMinutes = minutesFromDayStart(start);
  const endMinutes = minutesFromDayStart(end);
  const midpoint = startMinutes + (endMinutes - startMinutes) / 2;
  return midpoint >= segmentStart && midpoint < segmentEnd;
};

const CalendarWeek = ({
  blocks,
  events,
  settings,
  taskMap,
  taskDifficultyMap,
  t,
  viewMode,
  onViewModeChange,
  onBlockSelect,
  onBlockMove,
  onGeneratePlan,
  onExplainPlan,
  onClearLocks,
  hasPlan,
  hasLockedBlocks,
  isExplaining,
  canGenerate,
  now
}: CalendarWeekProps) => {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{
    blockId: string;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; segmentStart: number } | null>(null);
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [suppressClickId, setSuppressClickId] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const dayCount = Math.min(viewMode === "week" ? 7 : 3, settings.planningHorizonDays);
  const days = Array.from({ length: dayCount }, (_, index) => addDays(today, index));
  const hasItems = blocks.length > 0 || events.length > 0;
  const actionLabel = hasPlan ? t("plan.replan") : t("header.generatePlan");
  const explainLabel = isExplaining ? t("nl.explaining") : t("nl.explain");
  const emptyHint = canGenerate ? t("plan.empty") : t("status.addTaskPrompt");
  const dayByKey = useMemo(() => {
    return days.reduce<Map<string, Date>>((acc, day) => {
      acc.set(dayKey(day), day);
      return acc;
    }, new Map());
  }, [days]);

  const blocksByDay = blocks.reduce<Record<string, PlannedBlock[]>>((acc, block) => {
    const key = dayKey(new Date(block.start));
    acc[key] = acc[key] ? [...acc[key], block] : [block];
    return acc;
  }, {});

  const eventsByDay = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const key = dayKey(new Date(event.start));
    acc[key] = acc[key] ? [...acc[key], event] : [event];
    return acc;
  }, {});

  const handleDrop = (blockId: string, day: Date, segmentStart: number) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) {
      return;
    }
    const start = new Date(day);
    start.setHours(Math.floor(segmentStart / 60), segmentStart % 60, 0, 0);
    const durationMs = new Date(block.end).getTime() - new Date(block.start).getTime();
    const end = new Date(start.getTime() + Math.max(durationMs, 0));
    onBlockMove(blockId, start.toISOString(), end.toISOString());
  };

  const updateDropTargetFromPointer = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const segmentBody = element?.closest(".segment-body") as HTMLElement | null;
    if (!segmentBody) {
      setDropTarget(null);
      setDragTarget(null);
      return;
    }
    const key = segmentBody.dataset.dayKey;
    const segmentStart = Number(segmentBody.dataset.segmentStart);
    if (!key || Number.isNaN(segmentStart)) {
      setDropTarget(null);
      setDragTarget(null);
      return;
    }
    setDropTarget({ key, segmentStart });
    setDragTarget(`${key}-${segmentStart}`);
  };

  const resetPointerDrag = () => {
    setPointerDrag(null);
    setIsPointerDragging(false);
    setDragTarget(null);
    setDropTarget(null);
  };

  return (
    <div className="panel calendar-panel">
      <div className="panel-header calendar-header">
        <h2>{t("calendar.title")}</h2>
        <div className="calendar-header-actions">
          <div className="calendar-actions">
            <button className="button primary" onClick={onGeneratePlan} disabled={!canGenerate}>
              {actionLabel}
            </button>
            <button className="button ghost" onClick={onExplainPlan} disabled={!hasPlan || isExplaining}>
              {explainLabel}
            </button>
            {hasLockedBlocks ? (
              <button className="button ghost" onClick={onClearLocks}>
                {t("calendar.clearLocks")}
              </button>
            ) : null}
          </div>
          <div className="view-toggle">
            <button
              className={`chip ${viewMode === "week" ? "active" : ""}`}
              onClick={() => onViewModeChange("week")}
            >
              {t("calendar.weekView")}
            </button>
            <button
              className={`chip ${viewMode === "focus" ? "active" : ""}`}
              onClick={() => onViewModeChange("focus")}
            >
              {t("calendar.focusView")}
            </button>
          </div>
        </div>
      </div>
      <div className="panel-body">
        {!hasItems ? (
          <div className="calendar-empty">
            <div className="empty-title">{t("calendar.empty")}</div>
            <div className="empty-hint">{emptyHint}</div>
            <button className="button primary" onClick={onGeneratePlan} disabled={!canGenerate}>
              {actionLabel}
            </button>
          </div>
        ) : (
          <div className="calendar">
            <div className={`days ${viewMode}`}>
              {days.map((day) => {
                const key = dayKey(day);
                const dayBlocks = blocksByDay[key] ?? [];
                const dayEvents = eventsByDay[key] ?? [];
                return (
                  <div key={key} className="day-column">
                    <div className="day-header">{formatShortDate(day)}</div>
                    <div className="day-body">
                      {segments.map((segment) => {
                        const items: SegmentItem[] = [
                          ...dayEvents
                            .filter((event) =>
                              isInSegment(new Date(event.start), new Date(event.end), segment.start, segment.end)
                            )
                            .map((event) => ({
                              id: event.id,
                              kind: "busy" as const,
                              title: event.title,
                              start: event.start,
                              end: event.end
                            })),
                          ...dayBlocks
                            .filter((block) =>
                              isInSegment(new Date(block.start), new Date(block.end), segment.start, segment.end)
                            )
                            .map((block) => ({
                              id: block.id,
                            kind: "block" as const,
                            title: taskMap[block.taskId] ?? t("plan.unknownTask"),
                            start: block.start,
                            end: block.end,
                            locked: block.locked,
                            block
                          }))
                        ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                        return (
                          <div key={segment.key} className="segment">
                            <div className="segment-header">{t(segment.labelKey)}</div>
                            <div
                              className={`segment-body ${
                                dragTarget === `${key}-${segment.start}` ? "drag-over" : ""
                              }`}
                              data-day-key={key}
                              data-segment-start={segment.start}
                            >
                              {items.length === 0 ? (
                                <div className="empty">{t("calendar.empty")}</div>
                              ) : (
                                items.map((item) => {
                                  const inProgress =
                                    item.kind === "block"
                                      ? isWithin(now, new Date(item.start), new Date(item.end))
                                      : false;
                                  const isUpcoming =
                                    item.kind === "block" ? new Date(item.start).getTime() > now.getTime() : false;
                                  const difficulty =
                                    item.kind === "block" && item.block
                                      ? taskDifficultyMap[item.block.taskId] ?? t("calendar.difficultyMedium")
                                      : "";
                                  return (
                                    <div
                                      key={`${segment.key}-${item.kind}-${item.id}`}
                                      className={`segment-item ${item.kind} ${item.locked ? "locked" : ""} ${
                                        item.kind === "block" ? "clickable" : ""
                                      } ${
                                        item.kind === "block" && pointerDrag?.blockId === item.block?.id ? "dragging" : ""
                                      }`}
                                      title={formatTimeRange(item.start, item.end)}
                                      onPointerDown={(event) => {
                                        if (item.kind !== "block" || !item.block) {
                                          return;
                                        }
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        setPointerDrag({
                                          blockId: item.block.id,
                                          startX: event.clientX,
                                          startY: event.clientY,
                                          pointerId: event.pointerId
                                        });
                                        setIsPointerDragging(false);
                                      }}
                                      onPointerMove={(event) => {
                                        if (item.kind !== "block" || !item.block || !pointerDrag) {
                                          return;
                                        }
                                        if (
                                          pointerDrag.blockId !== item.block.id ||
                                          pointerDrag.pointerId !== event.pointerId
                                        ) {
                                          return;
                                        }
                                        if (!isPointerDragging) {
                                          const dx = event.clientX - pointerDrag.startX;
                                          const dy = event.clientY - pointerDrag.startY;
                                          if (Math.hypot(dx, dy) > 6) {
                                            setIsPointerDragging(true);
                                            setSuppressClickId(item.block.id);
                                            updateDropTargetFromPointer(event.clientX, event.clientY);
                                          }
                                          return;
                                        }
                                        updateDropTargetFromPointer(event.clientX, event.clientY);
                                      }}
                                      onPointerUp={(event) => {
                                        if (pointerDrag && pointerDrag.pointerId === event.pointerId) {
                                          if (isPointerDragging && dropTarget) {
                                            const dayForDrop = dayByKey.get(dropTarget.key);
                                            if (dayForDrop) {
                                              handleDrop(pointerDrag.blockId, dayForDrop, dropTarget.segmentStart);
                                            }
                                          }
                                          resetPointerDrag();
                                          event.currentTarget.releasePointerCapture(event.pointerId);
                                        }
                                      }}
                                      onPointerCancel={(event) => {
                                        if (pointerDrag && pointerDrag.pointerId === event.pointerId) {
                                          resetPointerDrag();
                                          event.currentTarget.releasePointerCapture(event.pointerId);
                                        }
                                      }}
                                      onClick={() => {
                                        if (item.kind === "block" && suppressClickId === item.block?.id) {
                                          setSuppressClickId(null);
                                          return;
                                        }
                                        if (item.kind === "block" && item.block) {
                                          onBlockSelect(item.block);
                                        }
                                      }}
                                    >
                                      <div className="item-main">
                                        <strong>{item.title}</strong>
                                        <div className="meta">{formatTimeRange(item.start, item.end)}</div>
                                      </div>
                                      <div className="item-meta">
                                        <div className="item-status">
                                          {inProgress ? (
                                            <span className="in-progress">
                                              <span className="pulse-dot" />
                                              {t("calendar.inProgress")}
                                            </span>
                                          ) : isUpcoming ? (
                                            <span className="status-upcoming">{t("calendar.upcoming")}</span>
                                          ) : (
                                            <span className="status-empty">{"\u00A0"}</span>
                                          )}
                                        </div>
                                        {item.kind === "block" ? (
                                          <div className="badge">
                                            {t("calendar.difficulty")} {difficulty}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarWeek;
