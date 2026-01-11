import { useState } from "react";
import type { CalendarEvent, CalendarViewMode, PlannedBlock, Settings } from "../lib/types";
import { addDays, dayKey, formatShortDate, formatTimeRange, startOfDay } from "../lib/time";

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
  t: (key: string) => string;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onBlockSelect: (block: PlannedBlock) => void;
  onBlockMove: (blockId: string, start: string, end: string) => void;
};

type SegmentItem = {
  id: string;
  kind: "busy" | "block";
  title: string;
  start: string;
  end: string;
  confidence?: number;
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
  t,
  viewMode,
  onViewModeChange,
  onBlockSelect,
  onBlockMove
}: CalendarWeekProps) => {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{ blockId: string; startX: number; startY: number } | null>(
    null
  );
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [suppressClickId, setSuppressClickId] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const dayCount = Math.min(viewMode === "week" ? 7 : 3, settings.planningHorizonDays);
  const days = Array.from({ length: dayCount }, (_, index) => addDays(today, index));

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

  return (
    <div className="panel calendar-panel">
      <div className="panel-header">
        <h2>{t("calendar.title")}</h2>
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
      <div className="panel-body">
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
                            confidence: block.confidence,
                            locked: block.locked,
                            block
                          }))
                      ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                      return (
                        <div key={segment.key} className="segment">
                          <div className="segment-header">{t(segment.labelKey)}</div>
                          <div
                            className={`segment-body ${
                              dragTarget === `${key}-${segment.key}` ? "drag-over" : ""
                            }`}
                            onPointerEnter={() => {
                              if (isPointerDragging) {
                                setDragTarget(`${key}-${segment.key}`);
                              }
                            }}
                            onPointerMove={() => {
                              if (isPointerDragging) {
                                setDragTarget(`${key}-${segment.key}`);
                              }
                            }}
                            onPointerUp={(event) => {
                              if (isPointerDragging && pointerDrag) {
                                event.preventDefault();
                                handleDrop(pointerDrag.blockId, day, segment.start);
                              }
                              setPointerDrag(null);
                              setIsPointerDragging(false);
                              setDragTarget(null);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDragEnter={() => setDragTarget(`${key}-${segment.key}`)}
                            onDragLeave={() => setDragTarget(null)}
                            onDrop={(event) => {
                              event.preventDefault();
                              const blockId = event.dataTransfer.getData("text/plain");
                              if (blockId) {
                                handleDrop(blockId, day, segment.start);
                              }
                              setDragTarget(null);
                            }}
                          >
                            {items.length === 0 ? (
                              <div className="empty">{t("calendar.empty")}</div>
                            ) : (
                              items.map((item) => (
                                <div
                                  key={`${segment.key}-${item.kind}-${item.id}`}
                                  className={`segment-item ${item.kind} ${item.locked ? "locked" : ""} ${
                                    item.kind === "block" ? "clickable" : ""
                                  }`}
                                  title={formatTimeRange(item.start, item.end)}
                                  draggable={item.kind === "block"}
                                  onDragStart={(event) => {
                                    if (item.kind === "block" && item.block) {
                                      event.dataTransfer.setData("text/plain", item.block.id);
                                      event.dataTransfer.effectAllowed = "move";
                                    }
                                  }}
                                  onPointerDown={(event) => {
                                    if (item.kind !== "block" || !item.block) {
                                      return;
                                    }
                                    setPointerDrag({
                                      blockId: item.block.id,
                                      startX: event.clientX,
                                      startY: event.clientY
                                    });
                                    setIsPointerDragging(false);
                                  }}
                                  onPointerMove={(event) => {
                                    if (item.kind !== "block" || !item.block || !pointerDrag) {
                                      return;
                                    }
                                    if (pointerDrag.blockId !== item.block.id) {
                                      return;
                                    }
                                    if (!isPointerDragging) {
                                      const dx = event.clientX - pointerDrag.startX;
                                      const dy = event.clientY - pointerDrag.startY;
                                      if (Math.hypot(dx, dy) > 6) {
                                        setIsPointerDragging(true);
                                        setSuppressClickId(item.block.id);
                                      }
                                    }
                                  }}
                                  onPointerUp={() => {
                                    if (isPointerDragging) {
                                      setPointerDrag(null);
                                      setIsPointerDragging(false);
                                      setDragTarget(null);
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
                                  <div>
                                    <strong>{item.title}</strong>
                                    <div className="meta">{formatTimeRange(item.start, item.end)}</div>
                                  </div>
                                  {item.kind === "block" && item.confidence !== undefined ? (
                                    <div className="badge">{Math.round(item.confidence * 100)}%</div>
                                  ) : null}
                                </div>
                              ))
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
      </div>
    </div>
  );
};

export default CalendarWeek;
