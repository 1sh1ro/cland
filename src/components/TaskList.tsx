import { useEffect, useState } from "react";
import type { Task } from "../lib/types";

const formatMinutes = (minutes: number) => `${minutes} min`;

type TaskListProps = {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onDelete: (taskId: string) => void;
  t: (key: string) => string;
};

const TaskList = ({ tasks, onSelect, onDelete, t }: TaskListProps) => {
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
                <button className="button tiny danger" onClick={() => onDelete(task.id)}>
                  {t("tasks.remove")}
                </button>
              </div>
            )})}
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
