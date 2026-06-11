import * as React from "react"

import { cn } from "@/lib/utils"

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Tailwind min-width class applied to the inner content wrapper.
   * Forces horizontal scrolling on viewports narrower than this width.
   * Set to an empty string to disable the minimum width constraint.
   * @default "min-w-[640px]"
   */
  minWidth?: string
}

const ResponsiveTable = React.forwardRef<HTMLDivElement, ResponsiveTableProps>(
  ({ className, minWidth = "min-w-[640px]", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("w-full overflow-x-auto", className)}
      {...props}
    >
      <div className={minWidth}>{children}</div>
    </div>
  )
)
ResponsiveTable.displayName = "ResponsiveTable"

export { ResponsiveTable }
