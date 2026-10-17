import { GALLERY } from "@/lib/site";
import SectionHeading from "./SectionHeading";

/** Photos from real events. Renders nothing until GALLERY in site.ts has at least one. */
export default function Gallery({ channel }: { channel: string }) {
  if (GALLERY.length === 0) return null;

  return (
    <section id="gallery" className="scroll-mt-16 px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading channel={channel} label="From the shows" title="Recent events." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GALLERY.map((photo) => (
            <figure key={photo.src} className="overflow-hidden rounded-sm border bg-card">
              <img src={photo.src} alt={photo.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              {photo.caption && (
                <figcaption className="px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {photo.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
