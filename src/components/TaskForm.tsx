import { useEffect, useState } from "react";
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
  highlightKey?: number;
};

const TaskForm = ({ draft, onChange, onSubmit, onReset, selectedTask, t, highlightKey }: TaskFormProps) => {
  const [pulse, setPulse] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasAdvancedValues =
    Boolean(draft.description.trim()) ||
    Boolean(draft.earliestStart) ||
    draft.minBlockMinutes > 30 ||
    draft.maxBlockMinutes > 120 ||
    !draft.interruptible;

  useEffect(() => {
    if (!highlightKey) {
      return;
    }
    setPulse(false);
    const frame = requestAnimationFrame(() => setPulse(true));
    const timer = window.setTimeout(() => setPulse(false), 1400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [highlightKey]);

  useEffect(() => {
    if (!showAdvanced && hasAdvancedValues) {
      setShowAdvanced(true);
    }
  }, [hasAdvancedValues, showAdvanced]);

  return (
    <div className={`panel task-form ${pulse ? "pulse" : ""}`}>
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
        <label className="field">
          <span>{t("taskForm.deadline")}</span>
          <input
            type="datetime-local"
            value={draft.deadline}
            onChange={(event) => onChange({ ...draft, deadline: event.target.value })}
          />
        </label>
        <button
          className="button tiny ghost advanced-toggle"
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? t("taskForm.advancedHide") : t("taskForm.advancedShow")}
        </button>
        {showAdvanced ? (
          <div className="advanced-section">
            <label className="field">
              <span>{t("taskForm.description")}</span>
              <textarea
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
                placeholder={t("taskForm.descriptionPlaceholder")}
              />
            </label>
            <label className="field">
              <span>{t("taskForm.earliest")}</span>
              <input
                type="datetime-local"
                value={draft.earliestStart}
                onChange={(event) => onChange({ ...draft, earliestStart: event.target.value })}
              />
            </label>
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
        ) : null}
      </div>
      <div className="panel-footer">
        <button className="button tiny primary" onClick={onSubmit} disabled={!draft.title.trim()}>
          {selectedTask ? t("taskForm.update") : t("taskForm.add")}
        </button>
        <button className="button tiny ghost" onClick={onReset}>
          {selectedTask ? t("taskForm.cancel") : t("taskForm.clear")}
        </button>
      </div>
    </div>
  );
};

export default TaskForm;
