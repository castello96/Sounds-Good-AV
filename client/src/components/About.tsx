import { LevelMark } from "./Logo";
import SectionHeading from "./SectionHeading";

const credits = [
  "Live sound for my band",
  "Live sound for community theatre",
  "Singer, songwriter and actor",
  "Software engineer by day",
];

export default function About() {
  return (
    <section id="about" className="scroll-mt-16 px-6 py-24 md:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 md:grid-cols-[minmax(0,280px)_1fr] md:gap-16">
        {/* Stands in for a photo until there is one. */}
        <div className="relative flex aspect-[4/5] w-44 flex-col md:w-auto md:max-w-[280px] justify-between overflow-hidden rounded-sm border bg-card p-5">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "radial-gradient(70% 55% at 50% 0%, hsl(var(--primary) / 0.25), transparent 70%)" }}
          />
          <LevelMark className="relative h-6 w-6" />
          <span aria-hidden className="relative font-display text-8xl font-extrabold md:text-[9rem] uppercase leading-none text-primary-text">
            N
          </span>
          <p className="relative font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Nick · Founder</p>
        </div>

        <div>
          <SectionHeading channel="03" label="Behind the board" title="Hi, I'm Nick." />
          <div className="max-w-2xl space-y-4 text-lg text-muted-foreground">
            <p>
              I sing, write songs, act and play in a band, so I've spent a lot of time on stage trusting the sound to
              just work. By day, I'm a software engineer.
            </p>
            <p>
              I started doing AV in college and fell in love with it. It sits right where music, technology and
              engineering meet, which is pretty much everything I care about.
            </p>
            <p>
              Today I run live sound for my band and for community theatre. Sounds Good AV brings that same care to your
              event, whatever the size.
            </p>
          </div>
          <p className="mt-8 font-display text-2xl font-bold uppercase">I've been on both sides of the mic.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {credits.map((credit) => (
              <li
                key={credit}
                className="rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground"
              >
                {credit}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
