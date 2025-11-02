import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// TabsPill — wspólny pasek zakładek (fioletowy; aktywna biała; hover biała)
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  return (
    <Tabs {...props}>
      <TabsList
        className="
          w-full flex gap-3 overflow-x-auto scrollbar-hide
          bg-primary text-white rounded-full p-1.5 shadow-lg h-[56px]
        "
      >
        {React.Children.map(props.children as any, (child: any) => {
          if (child?.type?.displayName === "TabsTrigger") {
            return React.cloneElement(child, {
              className:
                "px-6 py-3 rounded-full text-base whitespace-nowrap transition-all duration-150 font-medium " +
                "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md " +
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