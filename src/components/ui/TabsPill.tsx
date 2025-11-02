import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// TabsPill — wspólny pasek zakładek (fioletowy; aktywna biała; hover biała)
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  const children = React.Children.toArray(props.children) as any[];
  
  // Separate triggers, contents, and extras (context bars, etc.)
  const triggers = children.filter((c: any) => c?.type?.displayName === "TabsTrigger");
  const contents = children.filter((c: any) => c?.type?.displayName === "TabsContent");
  const extras = children.filter(
    (c: any) => !["TabsTrigger", "TabsContent"].includes(c?.type?.displayName)
  );

  return (
    <Tabs {...props}>
      <TabsList
        className="
          w-full flex gap-3 overflow-x-auto scrollbar-hide
          bg-primary text-white rounded-full p-1.5 shadow-lg h-[56px]
        "
      >
        {triggers.map((child: any, index: number) =>
          React.cloneElement(child, {
            key: index,
            className:
              "px-6 py-3 rounded-full text-base whitespace-nowrap transition-all duration-150 font-medium " +
              "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md " +
              "hover:bg-white/90 hover:text-primary focus-visible:outline-none",
          })
        )}
      </TabsList>
      {extras.length > 0 && <div className="mt-4">{extras}</div>}
      {contents}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

// For backward compatibility
export const TabsPillList = TabsList;
export const TabsPillTrigger = TabsTrigger;
export const TabsPillContent = TabsContent;