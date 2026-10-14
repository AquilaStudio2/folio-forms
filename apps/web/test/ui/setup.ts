import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Radix uses layout and pointer APIs which jsdom does not implement.
Object.defineProperty(window, "PointerEvent", { value: MouseEvent });
Object.defineProperty(window, "scrollTo", { value: vi.fn() });
Object.defineProperty(Element.prototype, "hasPointerCapture", {
  value: () => false,
});
Object.defineProperty(Element.prototype, "setPointerCapture", {
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, "releasePointerCapture", {
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: vi.fn(),
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});
