import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

// index.html applies the saved theme before the app loads, so start from what's on the page.
export default function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const fadeTimer = useRef<number>();
  // On the public site this works like house lights, so the change fades in.
  const site = document.documentElement.classList.contains("site");

  const toggleTheme = () => {
    const next = !dark;
    const root = document.documentElement;
    setDark(next);
    if (site) {
      root.classList.add("theme-fade");
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => root.classList.remove("theme-fade"), 750);
    }
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private windows can block storage. The toggle still works for this visit.
    }
  };

  const label = site
    ? dark ? "House lights up" : "House lights down"
    : dark ? "Turn the lights up" : "Turn the lights down";

  return (
    <Button
      title={site ? label : undefined}
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className={className ?? "hover-elevate"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
