import { useState } from "react";
import type { CalendarEvent } from "../lib/types";
import { fromLocalInputValue, toLocalInputValue } from "../lib/time";

type BusyListProps = {
  events: CalendarEvent[];
  onAdd: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  t: (key: string) => string;
};

const BusyList = ({ events, onAdd, onDelete, t }: BusyListProps) => {
  const now = new Date();
  const initialStart = toLocalInputValue(now.toISOString());
  const initialEnd = toLocalInputValue(new Date(now.getTime() + 60 * 60000).toISOString());
  const [title, setTitle] = useState(() => t("busy.defaultTitle"));
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  const handleAdd = () => {
    if (!title.trim() || !start || !end) {
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      title,
      start: fromLocalInputValue(start),
      end: fromLocalInputValue(end),
      busy: true
    });
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{t("busy.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="field">
          <span>{t("busy.fieldTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field-grid">
          <label className="field">
            <span>{t("busy.start")}</span>
            <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("busy.end")}</span>
            <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <button className="button" onClick={handleAdd}>
          {t("busy.add")}
        </button>
        <div className="divider" />
        {events.length === 0 ? (
          <div className="empty">{t("busy.empty")}</div>
        ) : (
          <div className="list">
            {events.map((event) => (
              <div className="list-item" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <span>
                    {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}
                  </span>
                </div>
                <button className="button tiny danger" onClick={() => onDelete(event.id)}>
                  {t("busy.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusyList;
