import { Link } from "@tanstack/react-router";

// Blue/white palette is scoped to this page; blue-700 on white is 6.7:1 (WCAG AA).
export const NotFoundPage = () => (
  <main className="grid min-h-screen place-items-center bg-white px-6 text-center">
    <div className="flex max-w-md flex-col items-center gap-4">
      <p className="text-8xl font-bold text-blue-700 sm:text-9xl">404</p>
      <h1 className="text-2xl font-semibold text-blue-700">Page not found</h1>
      <p className="text-slate-600">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        to="/"
        className="rounded-md bg-blue-700 px-6 py-2.5 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Back to home
      </Link>
    </div>
  </main>
);
