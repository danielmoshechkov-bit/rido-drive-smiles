import { X, PlayCircle, BookOpen, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { cn } from "@/lib/utils";

export function HelpPanel() {
  const { 
    isHelpOpen, 
    closeHelp, 
    currentModule, 
    getModuleConfig, 
    startTour,
    completedTours 
  } = useOnboarding();

  const config = getModuleConfig();

  if (!isHelpOpen) return null;

  const moduleNames: Record<string, string> = {
    driver: 'Panel Kierowcy',
    fleet: 'Panel Floty',
    client: 'Portal Klienta',
    home: 'Strona Główna',
    marketplace: 'Giełda Pojazdów',
    realestate: 'Nieruchomości',
    services: 'Usługi'
  };

  // Group videos by category
  const videosByCategory = config?.videos.reduce((acc, video) => {
    if (!acc[video.category]) {
      acc[video.category] = [];
    }
    acc[video.category].push(video);
    return acc;
  }, {} as Record<string, typeof config.videos>) || {};

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={closeHelp}
      />
      
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-background z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Centrum Pomocy</h2>
            <p className="text-sm text-muted-foreground">
              {moduleNames[currentModule] || 'GetRido'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={closeHelp}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <Tabs defaultValue="tours" className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 pt-2 bg-transparent">
            <TabsTrigger value="tours" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Przewodniki
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Wideo
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="tours" className="p-4 space-y-3 mt-0">
              {config?.tours.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Brak dostępnych przewodników dla tego modułu.
                </p>
              )}
              
              {config?.tours.map((tour) => {
                const isCompleted = completedTours.includes(tour.id);
                
                return (
                  <button
                    key={tour.id}
                    onClick={() => startTour(tour.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border transition-all",
                      "hover:border-primary hover:bg-accent/50",
                      isCompleted && "border-green-500/30 bg-green-500/5"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-0.5 p-1.5 rounded-full",
                        isCompleted ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"
                      )}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <BookOpen className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tour.name}</span>
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs">
                              Ukończony
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {tour.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {tour.steps.length} kroków
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </TabsContent>

            <TabsContent value="videos" className="p-4 space-y-6 mt-0">
              {Object.keys(videosByCategory).length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Brak dostępnych filmów dla tego modułu.
                </p>
              )}
              
              {Object.entries(videosByCategory).map(([category, videos]) => (
                <div key={category}>
                  <h3 className="font-medium text-sm text-muted-foreground mb-3">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {videos.map((video) => (
                      <a
                        key={video.id}
                        href={video.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative w-20 h-12 bg-muted rounded overflow-hidden flex-shrink-0">
                            {video.thumbnailUrl ? (
                              <img 
                                src={video.thumbnailUrl} 
                                alt={video.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                <PlayCircle className="h-6 w-6 text-primary" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm line-clamp-1">
                              {video.title}
                            </span>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {video.description}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {video.duration}
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          <p className="text-xs text-center text-muted-foreground">
            Potrzebujesz więcej pomocy?{' '}
            <a href="mailto:support@getrido.pl" className="text-primary hover:underline">
              Napisz do nas
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
