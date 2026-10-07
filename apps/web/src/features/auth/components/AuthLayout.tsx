import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/app/components/ThemeToggle';

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <span className="text-base font-semibold tracking-tight">StaffOS</span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 className="text-xl leading-none font-semibold tracking-tight">{title}</h1>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
