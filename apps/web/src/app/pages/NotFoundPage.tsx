import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link to="/" className={buttonVariants({ className: 'mt-6' })}>
        Go to home
      </Link>
    </main>
  );
}
