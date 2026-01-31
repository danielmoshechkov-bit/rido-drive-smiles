import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Volume2, Check, AlertCircle } from "lucide-react";
import { AIAgentConfig, useUpdateAIAgentConfig, ELEVENLABS_VOICES } from "@/hooks/useAIAgentConfig";

interface AIAgentVoiceSelectorProps {
  config: AIAgentConfig;
}

export function AIAgentVoiceSelector({ config }: AIAgentVoiceSelectorProps) {
  const updateConfig = useUpdateAIAgentConfig();
  const [selectedGender, setSelectedGender] = useState(config.voice_gender);
  const [selectedVoice, setSelectedVoice] = useState(config.voice_id);
  const [selectedStyle, setSelectedStyle] = useState(config.conversation_style);

  const filteredVoices = ELEVENLABS_VOICES.filter(v => v.gender === selectedGender);

  const handleSave = async () => {
    await updateConfig.mutateAsync({
      id: config.id,
      voice_id: selectedVoice,
      voice_gender: selectedGender,
      conversation_style: selectedStyle,
    });
  };

  const selectedVoiceInfo = ELEVENLABS_VOICES.find(v => v.id === selectedVoice);

  return (
    <div className="space-y-6">
      {/* Gender Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Płeć głosu
          </CardTitle>
          <CardDescription>
            Wybierz płeć głosu dla Twojego AI Agenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedGender}
            onValueChange={(value) => {
              setSelectedGender(value);
              // Reset voice selection when gender changes
              const firstVoice = ELEVENLABS_VOICES.find(v => v.gender === value);
              if (firstVoice) setSelectedVoice(firstVoice.id);
            }}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="male" id="male" />
              <Label htmlFor="male" className="cursor-pointer">Męski</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="female" id="female" />
              <Label htmlFor="female" className="cursor-pointer">Żeński</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Voice Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Wybór głosu</CardTitle>
          <CardDescription>
            Wybierz głos z biblioteki ElevenLabs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {filteredVoices.map((voice) => (
              <div
                key={voice.id}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedVoice === voice.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setSelectedVoice(voice.id)}
              >
                {selectedVoice === voice.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Volume2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{voice.name}</p>
                    <p className="text-xs text-muted-foreground">{voice.style}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 gap-2"
                  disabled
                >
                  <Volume2 className="h-3 w-3" />
                  Odsłuchaj
                </Button>
              </div>
            ))}
          </div>

          <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Odsłuchiwanie próbek głosu będzie dostępne po podłączeniu API ElevenLabs
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Conversation Style */}
      <Card>
        <CardHeader>
          <CardTitle>Styl rozmowy</CardTitle>
          <CardDescription>
            Jak AI Agent ma prowadzić rozmowy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedStyle} onValueChange={setSelectedStyle}>
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">
                <div className="flex items-center gap-2">
                  <span>Profesjonalny</span>
                  <span className="text-xs text-muted-foreground">- formalny, rzeczowy</span>
                </div>
              </SelectItem>
              <SelectItem value="casual">
                <div className="flex items-center gap-2">
                  <span>Swobodny</span>
                  <span className="text-xs text-muted-foreground">- przyjazny, bezpośredni</span>
                </div>
              </SelectItem>
              <SelectItem value="energetic">
                <div className="flex items-center gap-2">
                  <span>Energiczny</span>
                  <span className="text-xs text-muted-foreground">- entuzjastyczny, dynamiczny</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-medium">Wybrana konfiguracja głosu</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline">
                  {selectedGender === "male" ? "Męski" : "Żeński"}
                </Badge>
                <Badge variant="outline">
                  {selectedVoiceInfo?.name || "Nie wybrano"}
                </Badge>
                <Badge variant="outline">
                  {selectedStyle === "professional" ? "Profesjonalny" : 
                   selectedStyle === "casual" ? "Swobodny" : "Energiczny"}
                </Badge>
              </div>
            </div>
            <Button 
              onClick={handleSave}
              disabled={updateConfig.isPending}
            >
              Zapisz ustawienia głosu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
