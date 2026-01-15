import { useEffect, useState } from "react";
import type { Task } from "../lib/types";

const formatMinutes = (minutes: number) => `${minutes} min`;

const TrashIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
    />
  </svg>
);

const CalendarPlusIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M7 3a1 1 0 0 1 1 1v1h8V4a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v3H3V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1zm14 9v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7h18zM12 13a1 1 0 0 0-1 1v2H9a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2v-2a1 1 0 0 0-1-1z"
    />
  </svg>
);

type TaskListProps = {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onAddToCalendar: (task: Task) => void;
  onGeneratePlan: () => void;
  canGenerate: boolean;
  t: (key: string) => string;
};

const TaskList = ({
  tasks,
  onSelect,
  onDelete,
  onAddToCalendar,
  onGeneratePlan,
  canGenerate,
  t
}: TaskListProps) => {
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(tasks.length / pageSize));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const startIndex = page * pageSize;
  const pageTasks = tasks.slice(startIndex, startIndex + pageSize);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{t("tasks.title")}</h2>
        <div className="panel-actions">
          <button className="button tiny" onClick={onGeneratePlan} disabled={!canGenerate}>
            {t("tasks.generatePlan")}
          </button>
        </div>
      </div>
      <div className="panel-body">
        {tasks.length === 0 ? (
          <div className="empty">{t("tasks.empty")}</div>
        ) : (
          <div className="list">
            {pageTasks.map((task) => {
              const completed = task.completedMinutes ?? 0;
              const percent = task.estimatedMinutes > 0 ? Math.round((completed / task.estimatedMinutes) * 100) : 0;
              return (
                <div className="list-item" key={task.id}>
                  <button className="link" onClick={() => onSelect(task)}>
                    <strong>{task.title}</strong>
                    <span>
                      {formatMinutes(task.estimatedMinutes)} | P{task.priority} | {percent}%
                    </span>
                    <div className="progress-bar">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </button>
                  <div className="list-actions">
                    <button
                      className="button tiny icon-button"
                      onClick={() => onAddToCalendar(task)}
                      aria-label={t("tasks.addToCalendar")}
                      title={t("tasks.addToCalendar")}
                    >
                      <CalendarPlusIcon />
                      <span className="icon-label">{t("tasks.addToCalendar")}</span>
                    </button>
                    <button
                      className="button tiny danger icon-button"
                      onClick={() => onDelete(task.id)}
                      aria-label={t("tasks.remove")}
                      title={t("tasks.remove")}
                    >
                      <TrashIcon />
                      <span className="icon-label">{t("tasks.remove")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tasks.length > 0 ? (
          <div className="pagination">
            <button
              className="button tiny"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={page === 0}
            >
              {t("tasks.prev")}
            </button>
            <span className="page-label">{t("tasks.page", { current: page + 1, total: totalPages })}</span>
            <button
              className="button tiny"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
              disabled={page >= totalPages - 1}
            >
              {t("tasks.next")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TaskList;
