import type { ChangeEvent } from "react";

type MemoPanelProps = {
  memo: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
};

const MemoPanel = ({ memo, onChange, t }: MemoPanelProps) => {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="panel compact">
      <div className="panel-header">
        <h2>{t("memo.title")}</h2>
      </div>
      <div className="panel-body">
        <textarea
          className="memo-textarea"
          value={memo}
          onChange={handleChange}
          placeholder={t("memo.placeholder")}
        />
      </div>
    </div>
  );
};

export default MemoPanel;
