import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '../theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
