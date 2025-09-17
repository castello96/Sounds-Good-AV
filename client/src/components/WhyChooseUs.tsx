import { Card, CardContent } from "@/components/ui/card";
import { Package, Settings, Wrench } from "lucide-react";

const benefits = [
  {
    icon: Package,
    title: "Wide Selection",
    description: "Extensive inventory of professional AV equipment including sound systems, microphones, speakers, and more to meet any event requirement."
  },
  {
    icon: Settings,
    title: "Flexible Rental Options", 
    description: "Choose between self-service equipment pickup for DIY events or fully managed setup and breakdown services for seamless experiences."
  },
  {
    icon: Wrench,
    title: "Professional Assistance",
    description: "Expert setup and breakdown services with experienced technicians ensuring optimal audio quality for your event."
  }
];

export default function WhyChooseUs() {
  return (
    <section className="py-24 px-8 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Why Choose Sounds Good AV?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Professional audio visual solutions tailored to your specific needs
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <Card 
              key={index} 
              className="hover-elevate transition-all duration-300 border-card-border"
              data-testid={`card-benefit-${index}`}
            >
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                  <benefit.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-4">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}