import React, { createContext, useContext, useState } from "react";
import { translations, TranslationKey } from "../i18n/translations";

type Language = "vi" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("app_language");
    return (saved === "en" || saved === "vi") ? saved : "vi";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app_language", lang);
    window.dispatchEvent(new CustomEvent("language-changed", { detail: lang }));
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const keys = key.split(".");
    let translation: any = translations[language];

    for (const k of keys) {
      if (translation && typeof translation === "object" && k in translation) {
        translation = translation[k];
      } else {
        // Fallback to Vietnamese if not found
        let fallback: any = translations["vi"];
        let foundFallback = true;
        for (const fk of keys) {
          if (fallback && typeof fallback === "object" && fk in fallback) {
            fallback = fallback[fk];
          } else {
            foundFallback = false;
            break;
          }
        }
        if (foundFallback && typeof fallback === "string") {
          translation = fallback;
        } else {
          translation = key; // Return key if not found in fallback
        }
        break;
      }
    }

    if (typeof translation !== "string") {
      return key;
    }

    if (params) {
      let result = translation;
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(new RegExp(`{${paramKey}}`, "g"), String(paramValue));
      });
      return result;
    }

    return translation;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
