import * as TablePrimitive from "@rn-primitives/table";
import type * as React from "react";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * A data table: rows divided by `border`, a `muted` header and footer, and
 * Subhead text (Emphasized in the header). Cells hand their style to the
 * `Text` inside them; size columns with `className` (`flex-1`, `w-24`).
 */
function Table({
  className,
  ...props
}: TablePrimitive.RootProps & {
  ref?: React.RefObject<TablePrimitive.RootRef>;
}) {
  return <TablePrimitive.Root className={cn("w-full", className)} {...props} />;
}

function TableHeader({
  className,
  ...props
}: TablePrimitive.HeaderProps & {
  ref?: React.RefObject<TablePrimitive.HeaderRef>;
}) {
  return (
    <TablePrimitive.Header className={cn("bg-muted", className)} {...props} />
  );
}

function TableBody({
  className,
  ...props
}: TablePrimitive.BodyProps & {
  ref?: React.RefObject<TablePrimitive.BodyRef>;
}) {
  return <TablePrimitive.Body className={cn("flex-1", className)} {...props} />;
}

function TableFooter({
  className,
  ...props
}: TablePrimitive.FooterProps & {
  ref?: React.RefObject<TablePrimitive.FooterRef>;
}) {
  return (
    <TablePrimitive.Footer className={cn("bg-muted", className)} {...props} />
  );
}

function TableRow({
  className,
  ...props
}: TablePrimitive.RowProps & {
  ref?: React.RefObject<TablePrimitive.RowRef>;
}) {
  return (
    <TablePrimitive.Row
      className={cn("flex-row border-border border-b", className)}
      {...props}
    />
  );
}

function TableHead({
  className,
  ...props
}: TablePrimitive.HeadProps & {
  ref?: React.RefObject<TablePrimitive.HeadRef>;
}) {
  return (
    <TextClassContext.Provider value="text-foreground text-subhead-emphasized">
      <TablePrimitive.Head
        className={cn("justify-center px-3 py-2", className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function TableCell({
  className,
  ...props
}: TablePrimitive.CellProps & {
  ref?: React.RefObject<TablePrimitive.CellRef>;
}) {
  return (
    <TextClassContext.Provider value="text-foreground text-subhead">
      <TablePrimitive.Cell
        className={cn("justify-center px-3 py-2", className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
