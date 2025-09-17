import { Card, CardContent } from "@/components/ui/card";
import { Music, PartyPopper, Mic, Presentation } from "lucide-react";

const services = [
  {
    icon: Music,
    title: "Bands",
    description: "High-quality sound systems and professional audio equipment for live performances and concerts.",
    features: ["Professional mixing boards", "Stage monitors", "PA systems", "Wireless microphones"]
  },
  {
    icon: PartyPopper,
    title: "Parties",
    description: "Perfect audio solutions for weddings, birthdays, corporate events, and special celebrations.",
    features: ["Portable sound systems", "Wireless speakers", "DJ equipment", "Background music setup"]
  },
  {
    icon: Mic,
    title: "Podcasters", 
    description: "Top-tier microphones and recording equipment for professional podcast production.",
    features: ["Studio-grade microphones", "Audio interfaces", "Headphones", "Recording accessories"]
  },
  {
    icon: Presentation,
    title: "Speakers/Presenters",
    description: "Clear, professional audio systems for presentations, conferences, and speaking engagements.",
    features: ["Wireless presentation mics", "Portable PA systems", "Clip-on microphones", "Audio amplifiers"]
  }
];

export default function WhoWeServe() {
  return (
    <section id="services" className="py-24 px-8 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Who We Serve
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Specialized audio solutions for every type of event and professional need
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <Card 
              key={index} 
              className="hover-elevate transition-all duration-300 border-card-border"
              data-testid={`card-service-${index}`}
            >
              <CardContent className="p-8">
                <div className="flex items-start gap-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <service.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-card-foreground mb-3">
                      {service.title}
                    </h3>
                    <p className="text-muted-foreground mb-4 leading-relaxed">
                      {service.description}
                    </p>
                    <ul className="space-y-2">
                      {service.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="text-sm text-muted-foreground flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}