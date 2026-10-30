import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type MessageKey } from "./en";
import { ar } from "./ar";

export type Locale = "en" | "ar";
const DICTS: Record<Locale, Record<MessageKey, string>> = { en, ar };
const STORAGE_KEY = "thara.locale";

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  let s: string = DICTS[locale][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

// Hot reloads re-run this module; reuse the same context object so the
// provider already mounted in the root and the pages keep matching.
const I18nContext: React.Context<I18nValue | null> =
  (import.meta.hot?.data["i18nContext"] as React.Context<I18nValue | null> | undefined) ??
  createContext<I18nValue | null>(null);
if (import.meta.hot) import.meta.hot.data["i18nContext"] = I18nContext;

// Safe fallback (English, no-op setter) so a missing provider never blanks the screen.
const FALLBACK: I18nValue = {
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  t: (key, vars) => translate("en", key, vars),
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK;
}

export type { MessageKey };
