import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, restoreAccessToken: vi.fn().mockResolvedValue(false) };
});
vi.mock("@/components/finance-dashboard", () => ({ FinanceDashboard: () => <div>Financial overview</div> }));

import { restoreAccessToken } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { ...render(<RouterProvider router={router} />), router };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App routing", () => {
  it("keeps the public landing page at root for signed-out visitors", async () => {
    vi.mocked(restoreAccessToken).mockResolvedValue(false);
    const { container, router } = renderAt("/");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(container.textContent).toContain("Understand money.");
  });

  it("routes an authenticated root visit to the original financial overview", async () => {
    vi.mocked(restoreAccessToken).mockResolvedValue(true);
    const { container, router } = renderAt("/");

    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    await waitFor(() => expect(container.textContent).toContain("Financial overview"));
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { container } = renderAt("/this-route-does-not-exist");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });
});
