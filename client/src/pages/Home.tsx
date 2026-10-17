import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Mixer from "@/components/Mixer";
import WhoWeServe from "@/components/WhoWeServe";
import HowItWorks from "@/components/HowItWorks";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main>
        <Hero />
        <Mixer />
        <WhoWeServe />
        <HowItWorks />
        <About />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
