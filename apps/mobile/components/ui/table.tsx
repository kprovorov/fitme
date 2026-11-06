import * as TablePrimitive from "@rn-primitives/table/dist/table";
import type * as React from "react";

import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * A data table: rows divided by `border`, a `muted` header and footer, and
 * Subhead text (Emphasized in the header). Cells hand their style to the
 * `Text` inside them; size columns with `className` (`flex-1`, `w-24`).
 */
const Table = ({
  className,
  ...props
}: TablePrimitive.RootProps & {
  ref?: React.RefObject<TablePrimitive.RootRef>;
}) => <TablePrimitive.Root className={cn("w-full", className)} {...props} />;

const TableHeader = ({
  className,
  ...props
}: TablePrimitive.HeaderProps & {
  ref?: React.RefObject<TablePrimitive.HeaderRef>;
}) => (
  <TablePrimitive.Header className={cn("bg-muted", className)} {...props} />
);

const TableBody = ({
  className,
  ...props
}: TablePrimitive.BodyProps & {
  ref?: React.RefObject<TablePrimitive.BodyRef>;
}) => <TablePrimitive.Body className={cn("flex-1", className)} {...props} />;

const TableFooter = ({
  className,
  ...props
}: TablePrimitive.FooterProps & {
  ref?: React.RefObject<TablePrimitive.FooterRef>;
}) => (
  <TablePrimitive.Footer className={cn("bg-muted", className)} {...props} />
);

const TableRow = ({
  className,
  ...props
}: TablePrimitive.RowProps & {
  ref?: React.RefObject<TablePrimitive.RowRef>;
}) => (
  <TablePrimitive.Row
    className={cn("border-border flex-row border-b", className)}
    {...props}
  />
);

const TableHead = ({
  className,
  ...props
}: TablePrimitive.HeadProps & {
  ref?: React.RefObject<TablePrimitive.HeadRef>;
}) => (
  <TextClassContext.Provider value="text-foreground text-subhead-emphasized">
    <TablePrimitive.Head
      className={cn("justify-center px-3 py-2", className)}
      {...props}
    />
  </TextClassContext.Provider>
);

const TableCell = ({
  className,
  ...props
}: TablePrimitive.CellProps & {
  ref?: React.RefObject<TablePrimitive.CellRef>;
}) => (
  <TextClassContext.Provider value="text-foreground text-subhead">
    <TablePrimitive.Cell
      className={cn("justify-center px-3 py-2", className)}
      {...props}
    />
  </TextClassContext.Provider>
);

export {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
