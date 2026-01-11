const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const loadFromStorage = <T,>(key: string, fallback: T): T => {
  return safeParse<T>(localStorage.getItem(key), fallback);
};

export const saveToStorage = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};
