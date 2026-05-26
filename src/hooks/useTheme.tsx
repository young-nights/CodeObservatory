// ThemeContext — dark/light toggle with localStorage persistence
// Applied via data-theme attribute on <html>

import { createContext, useState, useCallback, useEffect, useContext, type ReactNode } from "react";

export type Theme = "dark" | "light";

export const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("co-theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch {}
    return "dark";
  });

  const toggle = useCallback(() => {
    setTheme((v) => {
      const n: Theme = v === "dark" ? "light" : "dark";
      try { localStorage.setItem("co-theme", n); } catch {}
      return n;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
