import { SiInstagram } from "react-icons/si";
import { CONTACT, NAV_LINKS } from "@/lib/site";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t bg-card/50 px-6 md:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 py-14 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="sm:col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-muted-foreground">Live sound and AV rental for {CONTACT.serviceArea}.</p>
          <a
            href={CONTACT.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm hover:text-primary-text"
            data-testid="link-instagram"
          >
            <SiInstagram className="h-5 w-5" aria-hidden />
            {CONTACT.instagramHandle}
          </a>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
          <ul className="mt-3 space-y-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-primary-text">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#contact" className="hover:text-primary-text">
                Get a quote
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Get in touch</p>
          <ul className="mt-3 space-y-2">
            <li>
              <a href={`mailto:${CONTACT.email}`} className="hover:text-primary-text">
                {CONTACT.email}
              </a>
            </li>
            <li>
              <a href={CONTACT.phoneHref} className="hover:text-primary-text">
                {CONTACT.phone}
              </a>
            </li>
            <li className="text-muted-foreground">{CONTACT.serviceArea}</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t py-5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>© {new Date().getFullYear()} Sounds Good AV</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_6px_hsl(var(--signal))]" aria-hidden />
          Signal OK
        </span>
      </div>
    </footer>
  );
}
