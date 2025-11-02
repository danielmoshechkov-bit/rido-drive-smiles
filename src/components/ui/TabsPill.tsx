import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// TabsPill — wspólny pasek zakładek (fioletowy; aktywna biała; hover biała)
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  return (
    <Tabs {...props}>
      <TabsList
        className="
          w-full flex gap-2 overflow-x-auto scrollbar-hide
          bg-primary text-white rounded-full p-1 shadow-soft h-12
        "
      >
        {React.Children.map(props.children as any, (child: any) => {
          if (child?.type?.displayName === "TabsTrigger") {
            return React.cloneElement(child, {
              className:
                "px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 " +
                "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold " +
                "hover:bg-white/90 hover:text-primary focus-visible:outline-none",
            });
          }
          return child;
        })}
      </TabsList>
      {React.Children.toArray(props.children).filter(
        (c: any) => c?.type?.displayName === "TabsContent"
      )}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

// For backward compatibility
export const TabsPillList = TabsList;
export const TabsPillTrigger = TabsTrigger;
export const TabsPillContent = TabsContent;