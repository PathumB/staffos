import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-48 overflow-hidden rounded-md border bg-card p-1 text-card-foreground shadow-md',
        className,
      )}
      {...props}
    />
  </Menu.Portal>
));
DropdownMenuContent.displayName = Menu.Content.displayName;

const itemClass =
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-4';

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => (
  <Menu.Item ref={ref} className={cn(itemClass, className)} {...props} />
));
DropdownMenuItem.displayName = Menu.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof Menu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Menu.CheckboxItem ref={ref} className={cn(itemClass, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <Menu.ItemIndicator>
        <Check aria-hidden />
      </Menu.ItemIndicator>
    </span>
    {children}
  </Menu.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = Menu.CheckboxItem.displayName;

const DropdownMenuLabel = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Label>) => (
  <Menu.Label className={cn('px-2 py-1.5 text-sm font-medium', className)} {...props} />
);

const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Separator>) => (
  <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
