import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const TabsPill = TabsPrimitive.Root;

const TabsPillList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-start gap-1 p-2 bg-gradient-subtle rounded-full shadow-soft h-12 overflow-x-auto scrollbar-hide",
      className
    )}
    {...props}
  />
));
TabsPillList.displayName = TabsPrimitive.List.displayName;

const TabsPillTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-soft data-[state=active]:font-semibold",
      "hover:bg-white/30 hover:shadow-soft/50",
      className
    )}
    {...props}
  />
));
TabsPillTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsPillContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsPillContent.displayName = TabsPrimitive.Content.displayName;

export { TabsPill, TabsPillList, TabsPillTrigger, TabsPillContent };