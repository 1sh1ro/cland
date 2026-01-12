import { useRef, useState } from "react";
import type { KnowledgeCategory, KnowledgeItem } from "../lib/types";

type KnowledgeDraft = {
  title: string;
  content: string;
  categoryId: string;
};

type KnowledgeBasePanelProps = {
  categories: KnowledgeCategory[];
  items: KnowledgeItem[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: (name: string) => void;
  draft: KnowledgeDraft;
  onDraftChange: (draft: KnowledgeDraft) => void;
  onAddItem: () => void;
  onViewItem: (item: KnowledgeItem) => void;
  onDeleteItem: (itemId: string) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
};

const snippet = (value: string, length = 120) => {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length)}...`;
};

const TrashIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
    />
  </svg>
);


const KnowledgeBasePanel = ({
  categories,
  items,
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  draft,
  onDraftChange,
  onAddItem,
  onViewItem,
  onDeleteItem,
  t
}: KnowledgeBasePanelProps) => {
  const [newCategoryName, setNewCategoryName] = useState("");
  const entryTitleRef = useRef<HTMLInputElement | null>(null);
  const categoryMap = categories.reduce<Record<string, string>>((acc, category) => {
    acc[category.id] = category.name;
    return acc;
  }, {});

  const filteredItems =
    selectedCategoryId === "all"
      ? items
      : items.filter((item) => item.categoryId === selectedCategoryId);

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      return;
    }
    onAddCategory(newCategoryName.trim());
    setNewCategoryName("");
  };

  const focusEntry = () => {
    entryTitleRef.current?.focus();
    entryTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };


  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{t("knowledge.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="section">
          <h3>{t("knowledge.categories")}</h3>
          <div className="category-row">
            <button
              className={`chip ${selectedCategoryId === "all" ? "active" : ""}`}
              onClick={() => onSelectCategory("all")}
            >
              {t("knowledge.all")}
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                className={`chip ${selectedCategoryId === category.id ? "active" : ""}`}
                onClick={() => onSelectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="field inline">
            <input
              type="text"
              placeholder={t("knowledge.newCategory")}
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
            />
            <button className="button tiny" onClick={handleAddCategory}>
              {t("knowledge.addCategory")}
            </button>
          </div>
        </div>
        <div className="section">
          <h3>{t("knowledge.newEntry")}</h3>
          <label className="field">
            <span>{t("knowledge.entryTitle")}</span>
            <input
              ref={entryTitleRef}
              type="text"
              value={draft.title}
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("knowledge.entryContent")}</span>
            <textarea
              value={draft.content}
              onChange={(event) => onDraftChange({ ...draft, content: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("knowledge.entryCategory")}</span>
            <select
              value={draft.categoryId}
              onChange={(event) => onDraftChange({ ...draft, categoryId: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" onClick={onAddItem}>
            {t("knowledge.addEntry")}
          </button>
        </div>
        <div className="section">
          <h3>{t("knowledge.list")}</h3>
          {filteredItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty">{t("knowledge.empty")}</div>
              <button className="button primary" onClick={focusEntry}>
                {t("knowledge.emptyAction")}
              </button>
            </div>
          ) : (
            <div className="knowledge-list">
              {filteredItems.map((item) => (
                <div className="knowledge-item" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <div className="knowledge-meta">
                      {categoryMap[item.categoryId] ?? t("knowledge.uncategorized")} |{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    <div className="knowledge-snippet">{snippet(item.content)}</div>
                  </div>
                  <div className="knowledge-actions">
                    <button className="button tiny" onClick={() => onViewItem(item)}>
                      {t("knowledge.view")}
                    </button>
                    <button
                      className="button tiny danger icon-button"
                      onClick={() => onDeleteItem(item.id)}
                      aria-label={t("knowledge.delete")}
                      title={t("knowledge.delete")}>
                      <TrashIcon />
                      <span className="icon-label">{t("knowledge.delete")}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBasePanel;
