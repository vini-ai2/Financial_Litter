import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ThemeContextValue = { preference: ThemePreference; setPreference: (preference: ThemePreference) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "finlitter-theme";
const validPreference = (value: string | null): value is ThemePreference => value === "light" || value === "dark" || value === "system";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const initialized = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const firstMount = !initialized.current;
    initialized.current = true;
    let stored: string | null = null;
    try { stored = firstMount ? window.localStorage.getItem(STORAGE_KEY) : null; } catch { /* Use the system preference when storage is unavailable. */ }
    const selected = validPreference(stored) ? stored : preference;
    if (selected !== preference) setPreference(selected);

    const apply = () => {
      const resolved = selected === "system" ? (media.matches ? "dark" : "light") : selected;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    try { if (!firstMount || validPreference(stored)) window.localStorage.setItem(STORAGE_KEY, selected); } catch { /* Keep the in-memory theme if storage is unavailable. */ }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return <label className="theme-control">
    <span className="sr-only">Color theme</span>
    <select aria-label="Color theme" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
