import { Button } from "@/components/ui/button";
import heroImage from "@assets/generated_images/Professional_audio_equipment_studio_setup_70f1296e.png";

export default function Hero() {
  const handleGetQuote = () => {
    console.log('Get Quote button clicked');
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleViewServices = () => {
    console.log('View Services button clicked');
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with Gradient Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/90 via-foreground/70 to-primary/80" />
      
      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-8">
        <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6 leading-tight">
          Sounds Good <span className="text-primary">AV</span>
        </h1>
        <p className="text-xl md:text-2xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto leading-relaxed">
          Professional audio visual equipment rental for your events, performances, and presentations
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            onClick={handleGetQuote}
            className="text-lg px-8 py-6"
            data-testid="button-get-quote"
          >
            Get a Quote
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            onClick={handleViewServices}
            className="text-lg px-8 py-6 bg-primary-foreground/10 backdrop-blur-sm border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20"
            data-testid="button-view-services"
          >
            View Services
          </Button>
        </div>
      </div>
    </section>
  );
}