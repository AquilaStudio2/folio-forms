import { createRouter, RouterProvider } from "@tanstack/react-router";

import { NotFoundPage } from "@/components/not-found";
import { routeTree } from "@/routeTree.gen";

const router = createRouter({
  defaultNotFoundComponent: NotFoundPage,
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const App = () => <RouterProvider router={router} />;

export default App;
