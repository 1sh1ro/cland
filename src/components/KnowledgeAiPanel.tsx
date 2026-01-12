import type { KnowledgeCategory } from "../lib/types";

type KnowledgeDraft = {
  title: string;
  content: string;
};

type Suggestion = {
  category: string;
  reason: string;
};

type KnowledgeAiPanelProps = {
  mode: "ask" | "classify";
  onModeChange: (mode: "ask" | "classify") => void;
  question: string;
  onQuestionChange: (value: string) => void;
  response: string;
  suggestion: Suggestion | null;
  onAsk: () => void;
  onClassify: () => void;
  onApplySuggestion: () => void;
  isBusy: boolean;
  draft: KnowledgeDraft;
  categories: KnowledgeCategory[];
  t: (key: string) => string;
};

const KnowledgeAiPanel = ({
  mode,
  onModeChange,
  question,
  onQuestionChange,
  response,
  suggestion,
  onAsk,
  onClassify,
  onApplySuggestion,
  isBusy,
  draft,
  categories,
  t
}: KnowledgeAiPanelProps) => {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{t("ai.title")}</h2>
        <div className="view-toggle">
          <button
            className={`chip ${mode === "ask" ? "active" : ""}`}
            onClick={() => onModeChange("ask")}
          >
            {t("ai.ask")}
          </button>
          <button
            className={`chip ${mode === "classify" ? "active" : ""}`}
            onClick={() => onModeChange("classify")}
          >
            {t("ai.classify")}
          </button>
        </div>
      </div>
      <div className="panel-body">
        {mode === "ask" ? (
          <>
            <label className="field">
              <span>{t("ai.question")}</span>
              <textarea value={question} onChange={(event) => onQuestionChange(event.target.value)} />
            </label>
            <button className="button primary" onClick={onAsk} disabled={isBusy}>
              {isBusy ? t("ai.thinking") : t("ai.ask")}
            </button>
            {response ? <div className="ai-response">{response}</div> : null}
          </>
        ) : (
          <>
            <div className="ai-hint">
              {t("ai.classifyHint", { count: categories.length })}
            </div>
            <div className="ai-draft">
              <strong>{draft.title ? draft.title : t("ai.noTitle")}</strong>
              <div className="knowledge-snippet">
                {draft.content ? draft.content.slice(0, 120) : t("ai.noContent")}
              </div>
            </div>
            <button className="button primary" onClick={onClassify} disabled={isBusy}>
              {isBusy ? t("ai.thinking") : t("ai.classify")}
            </button>
            {suggestion ? (
              <div className="ai-response">
                <div>
                  <strong>{t("ai.suggested")}</strong> {suggestion.category}
                </div>
                {suggestion.reason ? <div className="ai-reason">{suggestion.reason}</div> : null}
                <button className="button tiny primary" onClick={onApplySuggestion}>
                  {t("ai.apply")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default KnowledgeAiPanel;
