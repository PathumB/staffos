import { createBrowserRouter } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Routes grow per module: internal app, /careers (public) and /client-portal.
export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '*', element: <NotFoundPage /> },
]);
