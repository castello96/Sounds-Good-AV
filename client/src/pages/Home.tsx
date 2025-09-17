import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import WhyChooseUs from "@/components/WhyChooseUs";
import WhoWeServe from "@/components/WhoWeServe";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <WhyChooseUs />
      <WhoWeServe />
      <Contact />
    </div>
  );
}