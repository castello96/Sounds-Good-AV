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
              I've been involved in music and theatre for most of my life, whether it's singing, songwriting, acting, 
              or playing in a band. I also happen to be a software engineer, so I've always had an interest in the 
              technical side of things.
            </p>
            <p>
              I first got into live sound in college and quickly realized it was the perfect combination of my interests 
              in music, technology, and engineering. These days, I run sound for my band and local theatre productions. 
            </p>
            <p>
              Having spent so much time on both sides of the microphone, I know how much good sound matters to 
              a performance. That's the perspective I bring to every event with Sounds Good AV.
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
