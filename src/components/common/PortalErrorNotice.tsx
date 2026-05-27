import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PortalErrorNoticeProps {
  area: string;
  message: string;
  details?: string;
  url?: string;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Customer-safe error banner.
 * - Shows a friendly "pracujemy nad naprawą" message.
 * - Silently reports the technical error to admin via `report-portal-error` edge function.
 * - Never exposes API keys, providers, stack traces or config hints to the user.
 */
export function PortalErrorNotice({
  area,
  message,
  details,
  url,
  title = "Funkcja chwilowo niedostępna",
  description = "Pracujemy nad naprawą — spróbuj ponownie za chwilę.",
  className = "",
}: PortalErrorNoticeProps) {
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    // fire-and-forget: never block UI or surface errors to the user
    supabase.functions
      .invoke("report-portal-error", {
        body: {
          area,
          message,
          details: details || "",
          url: url || (typeof window !== "undefined" ? window.location.href : ""),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
      })
      .catch(() => { /* ignore */ });
  }, [area, message, details, url]);

  return (
    <div
      className={
        "mt-4 p-3 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground flex items-start gap-2 " +
        className
      }
    >
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-xs mt-1">{description}</p>
      </div>
    </div>
  );
}
