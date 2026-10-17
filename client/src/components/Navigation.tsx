import { useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { micCheck } from "@/lib/fx";
import { NAV_LINKS } from "@/lib/site";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  const [checking, setChecking] = useState(0);
  const checkTimer = useRef<number>();

  // The logo goes back to the top. Already at the top, it does a mic check instead.
  const onLogo = (event: MouseEvent) => {
    if (window.scrollY > 8) return;
    event.preventDefault();
    micCheck();
    setChecking((count) => count + 1);
    window.clearTimeout(checkTimer.current);
    checkTimer.current = window.setTimeout(() => setChecking(0), 2400);
  };

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-8">
        <a href="#top" onClick={onLogo} aria-label="Sounds Good AV, back to top" className="relative" data-testid="link-home">
          <Logo key={checking} className={checking ? "mic-check" : undefined} />
          {checking > 0 && (
            <span
              key={`bubble-${checking}`}
              aria-hidden
              className="mic-bubble pointer-events-none absolute left-0 top-full mt-2 whitespace-nowrap rounded-sm border bg-card px-2.5 py-1 font-mono text-xs uppercase tracking-widest text-primary-text shadow-md"
            >
              Check, one, two
            </span>
          )}
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              data-testid={`link-${link.href.slice(1)}`}
            >
              {link.label}
            </a>
          ))}
          <ThemeToggle className="ml-2" />
          <Button asChild className="ml-2 rounded-sm font-display text-base uppercase tracking-wider">
            <a href="#contact" data-testid="button-nav-quote">
              Get a quote
            </a>
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            data-testid="button-mobile-menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t bg-background px-4 pb-4 pt-2 lg:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={close}
              className="block rounded-sm px-3 py-3 font-mono text-sm uppercase tracking-widest text-muted-foreground hover:text-foreground"
              data-testid={`link-mobile-${link.href.slice(1)}`}
            >
              {link.label}
            </a>
          ))}
          <Button asChild className="mt-2 w-full rounded-sm font-display text-base uppercase tracking-wider">
            <a href="#contact" onClick={close} data-testid="button-mobile-quote">
              Get a quote
            </a>
          </Button>
        </div>
      )}
    </nav>
  );
}
