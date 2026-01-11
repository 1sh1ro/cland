import type { Task } from "../lib/types";

export type TaskDraft = {
  title: string;
  description: string;
  estimatedMinutes: number;
  deadline: string;
  earliestStart: string;
  priority: number;
  interruptible: boolean;
  minBlockMinutes: number;
  maxBlockMinutes: number;
};

type TaskFormProps = {
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  onSubmit: () => void;
  onReset: () => void;
  selectedTask: Task | null;
  t: (key: string) => string;
};

const TaskForm = ({ draft, onChange, onSubmit, onReset, selectedTask, t }: TaskFormProps) => {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{selectedTask ? t("taskForm.edit") : t("taskForm.new")}</h2>
      </div>
      <div className="panel-body">
        <label className="field">
          <span>{t("taskForm.title")}</span>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            placeholder={t("taskForm.titlePlaceholder")}
          />
        </label>
        <label className="field">
          <span>{t("taskForm.description")}</span>
          <textarea
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            placeholder={t("taskForm.descriptionPlaceholder")}
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>{t("taskForm.estimate")}</span>
            <input
              type="number"
              min={15}
              value={draft.estimatedMinutes}
              onChange={(event) => onChange({ ...draft, estimatedMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t("taskForm.priority")}</span>
            <input
              type="number"
              min={1}
              max={5}
              value={draft.priority}
              onChange={(event) => onChange({ ...draft, priority: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>{t("taskForm.earliest")}</span>
            <input
              type="datetime-local"
              value={draft.earliestStart}
              onChange={(event) => onChange({ ...draft, earliestStart: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("taskForm.deadline")}</span>
            <input
              type="datetime-local"
              value={draft.deadline}
              onChange={(event) => onChange({ ...draft, deadline: event.target.value })}
            />
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>{t("taskForm.minBlock")}</span>
            <input
              type="number"
              min={30}
              value={draft.minBlockMinutes}
              onChange={(event) => onChange({ ...draft, minBlockMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t("taskForm.maxBlock")}</span>
            <input
              type="number"
              min={30}
              value={draft.maxBlockMinutes}
              onChange={(event) => onChange({ ...draft, maxBlockMinutes: Number(event.target.value) })}
            />
          </label>
        </div>
        <label className="field inline">
          <input
            type="checkbox"
            checked={draft.interruptible}
            onChange={(event) => onChange({ ...draft, interruptible: event.target.checked })}
          />
          <span>{t("taskForm.interruptible")}</span>
        </label>
      </div>
      <div className="panel-footer">
        <button className="button primary" onClick={onSubmit} disabled={!draft.title.trim()}>
          {selectedTask ? t("taskForm.update") : t("taskForm.add")}
        </button>
        <button className="button ghost" onClick={onReset}>
          {selectedTask ? t("taskForm.cancel") : t("taskForm.clear")}
        </button>
      </div>
    </div>
  );
};

export default TaskForm;
