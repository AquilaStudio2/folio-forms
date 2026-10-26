import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { NotFoundPage } from "@/components/not-found";

it("renders the 404 page for an unknown URL with a link to /", async () => {
  const root = createRootRoute();
  const index = createRoute({
    component: () => <p>home</p>,
    getParentRoute: () => root,
    path: "/",
  });
  const router = createRouter({
    defaultNotFoundComponent: NotFoundPage,
    history: createMemoryHistory({ initialEntries: ["/nope"] }),
    routeTree: root.addChildren([index]),
  });
  render(<RouterProvider router={router} />);
  expect(await screen.findByText("Page not found")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Back to home" }).getAttribute("href")
  ).toBe("/");
});
