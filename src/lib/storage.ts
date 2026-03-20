// Safe localStorage wrapper with in-memory fallback
const memoryStore: Record<string, string> = {};

function isLocalStorageAvailable(): boolean {
  try {
    const key = "__splitpal_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const useLocal = isLocalStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    if (useLocal) {
      try {
        return localStorage.getItem(key);
      } catch {
        return memoryStore[key] ?? null;
      }
    }
    return memoryStore[key] ?? null;
  },
  setItem(key: string, value: string): void {
    if (useLocal) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* fall through */
      }
    }
    memoryStore[key] = value;
  },
  removeItem(key: string): void {
    if (useLocal) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* fall through */
      }
    }
    delete memoryStore[key];
  },
};
