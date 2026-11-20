import type { WarRoomSettings } from "../types/war-room.js";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY_API_URL = "opspilot.apiUrl";
export const STORAGE_KEY_THEME = "opspilot.theme";

function normalizeRawUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A URL da API não pode estar vazia.");
  }
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("A URL da API deve usar protocolo http:// ou https://.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function readEnvApiUrl(): string | undefined {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  return meta.env?.VITE_API_URL;
}

function resolveDefaultApiUrl(): string {
  const envUrl = readEnvApiUrl();
  if (envUrl) {
    try {
      return normalizeRawUrl(envUrl);
    } catch {
      // Fallback safely if env override is invalid
    }
  }
  return "http://localhost:3000";
}

export const DEFAULT_API_URL = resolveDefaultApiUrl();

export function isValidApiUrl(value: string): boolean {
  try {
    normalizeRawUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeApiUrl(value: string): string {
  return normalizeRawUrl(value);
}

export function buildApiEndpoint(baseUrl: string, path: string): string {
  const cleanBase = normalizeRawUrl(baseUrl);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function getDefaultStorage(): StorageLike | undefined {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return undefined;
}

function getDefaultTheme(): "dark" | "light" {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

export function loadWarRoomSettings(
  storage: StorageLike | undefined = getDefaultStorage(),
  fallbackApiUrl: string = DEFAULT_API_URL
): WarRoomSettings {
  const safeFallback = isValidApiUrl(fallbackApiUrl)
    ? normalizeRawUrl(fallbackApiUrl)
    : "http://localhost:3000";

  let apiUrl = safeFallback;
  let theme: "dark" | "light" = getDefaultTheme();

  if (storage) {
    try {
      const storedUrl = storage.getItem(STORAGE_KEY_API_URL);
      if (storedUrl && isValidApiUrl(storedUrl)) {
        apiUrl = normalizeRawUrl(storedUrl);
      }

      const storedTheme = storage.getItem(STORAGE_KEY_THEME);
      if (storedTheme === "dark" || storedTheme === "light") {
        theme = storedTheme;
      }
    } catch {
      // Ignore storage access errors cleanly
    }
  }

  return { apiUrl, theme };
}

export function saveWarRoomSettings(
  settings: WarRoomSettings,
  storage: StorageLike | undefined = getDefaultStorage()
): WarRoomSettings {
  const normalizedUrl = normalizeRawUrl(settings.apiUrl);
  const nextSettings: WarRoomSettings = {
    apiUrl: normalizedUrl,
    theme: settings.theme,
  };

  if (storage) {
    try {
      storage.setItem(STORAGE_KEY_API_URL, nextSettings.apiUrl);
      storage.setItem(STORAGE_KEY_THEME, nextSettings.theme);
    } catch {
      // Ignore storage quota/access errors cleanly
    }
  }

  return nextSettings;
}
