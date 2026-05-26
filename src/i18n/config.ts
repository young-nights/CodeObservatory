import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh.json";

const LANG_KEY = "co-language";

const saved = (() => {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
})();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: saved || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try { localStorage.setItem(LANG_KEY, lng); } catch {}
});

export default i18n;
