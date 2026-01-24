import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Declare global for stopping recording
declare global {
  interface Window {
    __voiceInputStopRecording?: () => void;
  }
}

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function VoiceInput({
  onTranscription,
  onRecordingStart,
  onRecordingEnd,
  disabled = false,
  className,
  size = "md",
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  // Audio level visualization
  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      updateAudioLevel();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, updateAudioLevel]);

  // Cleanup on unmount - stop all recording
  useEffect(() => {
    return () => {
      // Stop media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      // Send to transcription endpoint
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/ai-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
          },
          body: JSON.stringify({
            action: 'transcribe',
            payload: {
              audio: base64Audio,
              mimeType: 'audio/webm',
            },
          }),
        }
      );

      const result = await response.json();
      
      if (result.success && result.text) {
        onTranscription(result.text);
      } else {
        console.error('Transcription failed:', result.error);
        alert('Nie udało się rozpoznać mowy. Spróbuj ponownie.');
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      alert('Wystąpił błąd podczas przetwarzania nagrania.');
    } finally {
      setIsProcessing(false);
    }
  }, [onTranscription]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Setup audio analyser for visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Close audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await processAudio(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      onRecordingStart?.();

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Nie można uruchomić mikrofonu. Sprawdź uprawnienia przeglądarki.');
    }
  }, [onRecordingStart, processAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAudioLevel(0);
    onRecordingEnd?.();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [onRecordingEnd]);

  // Expose stopRecording for parent components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__voiceInputStopRecording = stopRecording;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__voiceInputStopRecording;
      }
    };
  }, [stopRecording]);

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {/* Audio level ring */}
      {isRecording && (
        <div 
          className="absolute inset-0 rounded-full bg-destructive/20 animate-pulse"
          style={{
            transform: `scale(${1 + audioLevel * 0.5})`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
      
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className={cn(
          sizeClasses[size],
          "rounded-full transition-all duration-200",
          isRecording && "ring-2 ring-destructive ring-offset-2",
          !isRecording && !disabled && "hover:bg-primary hover:text-primary-foreground"
        )}
      >
        {isProcessing ? (
          <Loader2 className={cn(iconSizes[size], "animate-spin")} />
        ) : isRecording ? (
          <Square className={iconSizes[size]} />
        ) : (
          <Mic className={iconSizes[size]} />
        )}
      </Button>

      {/* Recording indicator */}
      {isRecording && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-destructive font-medium whitespace-nowrap">
          Nagrywam...
        </span>
      )}
    </div>
  );
}
