import type { PlanResult, PlannedBlock, Task } from "../lib/types";
import { fromLocalInputValue, toLocalInputValue } from "../lib/time";

type PlanReviewProps = {
  plan: PlanResult | null;
  tasks: Task[];
  onUpdateBlock: (block: PlannedBlock) => void;
  onToggleLock: (blockId: string) => void;
  onExplain: () => void;
  explanation: string;
  isExplaining: boolean;
  onReplan: () => void;
  t: (key: string) => string;
};

const taskTitle = (tasks: Task[], taskId: string, fallback: string) => {
  return tasks.find((task) => task.id === taskId)?.title ?? fallback;
};

const PlanReview = ({
  plan,
  tasks,
  onUpdateBlock,
  onToggleLock,
  onExplain,
  explanation,
  isExplaining,
  onReplan,
  t
}: PlanReviewProps) => {
  if (!plan) {
    return (
      <div className="panel plan-panel">
        <div className="panel-header">
          <h2>{t("plan.title")}</h2>
        </div>
        <div className="panel-body">
          <div className="empty">{t("plan.empty")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel plan-panel">
      <div className="panel-header">
        <h2>{t("plan.title")}</h2>
        <button className="button ghost" onClick={onReplan}>
          {t("plan.replan")}
        </button>
      </div>
      <div className="panel-body">
        <div className="section">
          <h3>{t("plan.warnings")}</h3>
          {plan.warnings.length === 0 ? (
            <div className="empty">{t("plan.noWarnings")}</div>
          ) : (
            <ul className="warning-list">
              {plan.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="section">
          <h3>{t("plan.assumptions")}</h3>
          <ul className="assumptions">
            {plan.assumptions.map((assumption, index) => (
              <li key={`${assumption}-${index}`}>{assumption}</li>
            ))}
          </ul>
        </div>
        <div className="section">
          <div className="section-header">
            <h3>{t("plan.blocks")}</h3>
            <button className="button" onClick={onExplain} disabled={isExplaining}>
              {isExplaining ? t("plan.explaining") : t("plan.explain")}
            </button>
          </div>
          <div className="block-list">
            {plan.blocks.map((block) => (
              <div className="block-item" key={block.id}>
                <div className="block-main">
                  <strong>{taskTitle(tasks, block.taskId, t("plan.unknownTask"))}</strong>
                  <span>{block.reasonCodes.join(" | ")}</span>
                </div>
                <div className="block-edit">
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(block.start)}
                    onChange={(event) =>
                      onUpdateBlock({
                        ...block,
                        start: fromLocalInputValue(event.target.value),
                        locked: true
                      })
                    }
                  />
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(block.end)}
                    onChange={(event) =>
                      onUpdateBlock({
                        ...block,
                        end: fromLocalInputValue(event.target.value),
                        locked: true
                      })
                    }
                  />
                  <label className="field inline small">
                    <input
                      type="checkbox"
                      checked={Boolean(block.locked)}
                      onChange={() => onToggleLock(block.id)}
                    />
                    <span>{t("plan.lock")}</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="section">
          <h3>{t("plan.aiExplanation")}</h3>
          {explanation ? <div className="explanation">{explanation}</div> : <div className="empty">{t("plan.noExplanation")}</div>}
        </div>
      </div>
    </div>
  );
};

export default PlanReview;
