import { useEffect } from "react";
import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Mixer from "@/components/Mixer";
import WhoWeServe from "@/components/WhoWeServe";
import HowItWorks from "@/components/HowItWorks";
import About from "@/components/About";
import Gallery from "@/components/Gallery";
import Testimonials from "@/components/Testimonials";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import StageLights from "@/components/StageLights";
import { GALLERY, TESTIMONIALS } from "@/lib/site";

// Sections after About take the next channel numbers, skipping the ones that are still hidden.
const channels = (() => {
  let next = 4;
  const take = (shown: boolean) => (shown ? String(next++).padStart(2, "0") : "");
  return { gallery: take(GALLERY.length > 0), testimonials: take(TESTIMONIALS.length > 0), contact: take(true) };
})();

let greeted = false;

/** A hello for anyone who opens the console. */
function greet() {
  if (greeted) return;
  greeted = true;
  console.log(
    "%cSounds Good AV%c\nCheck, one, two. You found the console.\nBuilt by Nick, who also writes software. Try ↑ ↑ ↓ ↓ ← → ← → B A.",
    "font: 700 20px 'Barlow Condensed', sans-serif; text-transform: uppercase; color: #ffb01f;",
    "font: 12px ui-monospace, monospace; color: inherit;",
  );
}

export default function Home() {
  useEffect(greet, []);

  return (
    <div className="min-h-screen">
      <Navigation />
      <main>
        <Hero />
        <Mixer />
        <WhoWeServe />
        <HowItWorks />
        <About />
        <Gallery channel={channels.gallery} />
        <Testimonials channel={channels.testimonials} />
        <Contact channel={channels.contact} />
      </main>
      <Footer />
      <StageLights />
    </div>
  );
}
