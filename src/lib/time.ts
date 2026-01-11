const pad = (value: number) => String(value).padStart(2, "0");

export const toLocalInputValue = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInputValue = (value: string) => {
  return new Date(value).toISOString();
};

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const minutesBetween = (start: Date, end: Date) => {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};

export const combineDateAndTime = (date: Date, time: string) => {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
};

export const formatShortDate = (date: Date) => {
  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", options).format(date);
};

export const formatTimeRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${pad(startDate.getHours())}:${pad(startDate.getMinutes())} - ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
};

export const dayKey = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const weekDayShort = (date: Date) => {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
};

export const isWithin = (target: Date, start: Date, end: Date) => {
  return target.getTime() >= start.getTime() && target.getTime() <= end.getTime();
};
