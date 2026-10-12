import { Loader2Icon } from "lucide-react";
// shadcn/ui new-york-v4; adapted to the project aliases.
// oxlint-disable func-style -- Keep the upstream shadcn component declarations.
import type * as React from "react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
