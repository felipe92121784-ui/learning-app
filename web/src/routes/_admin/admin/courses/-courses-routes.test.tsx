// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { profileQueryKey } from "@/features/auth/auth-api";
import { AuthProvider } from "@/features/auth/auth-provider";
import { coursesQueryKeys } from "@/features/courses/courses-queries";
import { materialsQueryKeys } from "@/features/materials/materials-queries";
import { uploadSettingsQueryKeys } from "@/features/settings/upload-settings-queries";
import { createAppRouter } from "@/router";

const admin = {
  id: 1,
  fullName: "Ada Admin",
  email: "ada.admin@example.test",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
};

const course = {
  id: 9,
  title: "Fundamentos de produto",
  description: "Do problema à primeira entrega.",
  status: "DRAFT" as const,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

const courseDetail = {
  ...course,
  modules: [
    {
      id: 12,
      courseId: 9,
      title: "Descoberta",
      description: "Entenda o problema.",
      position: 0,
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
    },
  ],
};

const createdCourseDetail = {
  ...courseDetail,
  id: 10,
  title: "Curso criado",
  modules: [
    {
      ...courseDetail.modules[0],
      id: 13,
      courseId: 10,
      title: "Módulo do curso criado",
    },
  ],
};

const uploadSettings = [
  { type: "PDF" as const, maxSizeBytes: 100 * 1024 * 1024 },
  { type: "IMAGE" as const, maxSizeBytes: 100 * 1024 * 1024 },
  { type: "ZIP" as const, maxSizeBytes: 100 * 1024 * 1024 },
];

function renderAdminCourses(initialPath = "/admin/courses") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(profileQueryKey, admin);
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    isServer: false,
    origin: "http://localhost",
    queryClient,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { queryClient, router };
}

function stubCourseRequests({
  courseAfterDelete = courseDetail,
  courseResponse = courseDetail,
  deleteResponse = () => Promise.resolve(new Response(null, { status: 204 })),
  createModuleResponse = () =>
    Promise.resolve(
      Response.json({ data: courseDetail.modules[0] }, { status: 201 }),
    ),
  updateModuleResponse = () =>
    Promise.resolve(Response.json({ data: courseDetail.modules[0] })),
  reorderResponse = () =>
    Promise.resolve(Response.json({ data: courseDetail })),
  uploadSettingsResponse = () =>
    Promise.resolve(Response.json({ data: uploadSettings })),
}: {
  courseAfterDelete?: typeof courseDetail;
  courseResponse?: typeof courseDetail;
  deleteResponse?: () => Promise<Response>;
  createModuleResponse?: () => Promise<Response>;
  updateModuleResponse?: () => Promise<Response>;
  reorderResponse?: () => Promise<Response>;
  uploadSettingsResponse?: () => Promise<Response>;
} = {}) {
  vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
  let hasDeletedModule = false;
  const fetchMock = vi
    .fn()
    .mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/courses") && !init?.method) {
        return Promise.resolve(Response.json({ data: [course] }));
      }

      if (url.endsWith("/courses/9") && !init?.method) {
        return Promise.resolve(
          Response.json({
            data: hasDeletedModule ? courseAfterDelete : courseResponse,
          }),
        );
      }

      if (url.endsWith("/upload-settings") && !init?.method) {
        return uploadSettingsResponse();
      }

      if (/\/modules\/\d+\/materials$/.test(url) && !init?.method) {
        return Promise.resolve(Response.json({ data: [] }));
      }

      if (url.endsWith("/courses") && init?.method === "POST") {
        return Promise.resolve(Response.json({ data: createdCourseDetail }));
      }

      if (url.endsWith("/courses/9/modules/12") && init?.method === "DELETE") {
        return deleteResponse().then((response) => {
          hasDeletedModule = response.ok;
          return response;
        });
      }

      if (url.endsWith("/courses/9/modules") && init?.method === "POST") {
        return createModuleResponse();
      }

      if (url.endsWith("/courses/9/modules/12") && init?.method === "PATCH") {
        return updateModuleResponse();
      }

      if (url.endsWith("/courses/9/modules/order") && init?.method === "PUT") {
        return reorderResponse();
      }

      throw new Error(`Unexpected request: ${url}`);
    });
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("administrative course routes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("inherits the ADMIN guard for the courses area", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { user: { ...admin, role: "STUDENT" } } }),
        ),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/admin/courses"] }),
      isServer: false,
      origin: "http://localhost",
      queryClient: new QueryClient(),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/app");
  });

  it("preloads courses and exposes Cursos in the administrative menu", async () => {
    stubCourseRequests();
    const { queryClient } = renderAdminCourses();

    expect(await screen.findByRole("heading", { name: "Cursos" })).toBeTruthy();
    expect(queryClient.getQueryData(coursesQueryKeys.list())).toEqual([course]);
    expect(
      screen.getByRole("link", { name: "Cursos" }).getAttribute("href"),
    ).toBe("/admin/courses");
    expect(screen.getByText("Fundamentos de produto")).toBeTruthy();
    expect(screen.getByText("Rascunho")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Configurações" }).getAttribute("href"),
    ).toBe("/admin/settings");
  });

  it("preloads a selected course before rendering the edit route", async () => {
    stubCourseRequests();
    const { queryClient } = renderAdminCourses("/admin/courses/9");

    expect(await screen.findByText("Editar curso")).toBeTruthy();
    expect(queryClient.getQueryData(coursesQueryKeys.detail(9))).toEqual(
      courseDetail,
    );
    expect(screen.getByText("Descoberta")).toBeTruthy();
  });

  it("shows private material administration for each module without a download surface", async () => {
    stubCourseRequests();
    const { queryClient } = renderAdminCourses("/admin/courses/9");

    expect(await screen.findByRole("heading", { name: "Materiais" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar material para Descoberta" })).toBeTruthy();
    expect(queryClient.getQueryData(uploadSettingsQueryKeys.list())).toEqual(uploadSettings);
    await waitFor(() =>
      expect(queryClient.getQueryData(materialsQueryKeys.list(12))).toEqual([]),
    );
    expect(screen.queryByRole("link", { name: /baixar|download/i })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar material para Descoberta" }),
    );
    expect(await screen.findByRole("form", { name: "Enviar material" })).toBeTruthy();
  });

  it("keeps course management available and disables upload when limits cannot load", async () => {
    stubCourseRequests({
      uploadSettingsResponse: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    });
    renderAdminCourses("/admin/courses/9");

    expect(await screen.findByText("Editar curso")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adicionar módulo" })).toBeTruthy();
    expect(
      await screen.findByText(
        "Não foi possível carregar os limites de upload. O envio está indisponível.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Enviar material para Descoberta" }),
    ).toHaveProperty("disabled", true);
  });

  it("navigates to and renders the full detail returned after course creation", async () => {
    const fetchMock = stubCourseRequests();
    const { router } = renderAdminCourses("/admin/courses/new");

    fireEvent.change(await screen.findByLabelText("Título"), {
      target: { value: "Curso criado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar curso" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/courses/10"),
    );
    expect(await screen.findByText("Módulo do curso criado")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/courses",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Curso criado" }),
      }),
    );
  });

  it("uses the full shared content width for course forms", async () => {
    stubCourseRequests();
    renderAdminCourses("/admin/courses/new");

    const newCourseCard = (await screen.findByText("Novo curso")).closest(
      "main",
    );
    expect(newCourseCard?.className).not.toContain("max-w-3xl");
    cleanup();

    renderAdminCourses("/admin/courses/9");
    const editCourseCard = (await screen.findByText("Editar curso")).closest(
      "main",
    );
    expect(editCourseCard?.className).not.toContain("max-w-3xl");
  });

  it("keeps deletion confirmation open while pending and refreshes the course after a scoped delete", async () => {
    let resolveDelete: (response: Response) => void = () => undefined;
    const deleteRequest = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const fetchMock = stubCourseRequests({
      courseAfterDelete: { ...courseDetail, modules: [] },
      deleteResponse: () => deleteRequest,
    });
    const { queryClient } = renderAdminCourses("/admin/courses/9");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Excluir Descoberta",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Excluir módulo" }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Descoberta será removido permanentemente.",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Excluir módulo",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Excluindo…" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    resolveDelete(new Response(null, { status: 204 }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByText("Nenhum módulo adicionado.")).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/courses/9/modules/12",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(queryClient.getQueryData(coursesQueryKeys.detail(9))).toEqual({
      ...courseDetail,
      modules: [],
    });
  });

  it("announces a module deletion error inside the confirmation dialog", async () => {
    stubCourseRequests({
      deleteResponse: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    });
    renderAdminCourses("/admin/courses/9");

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir Descoberta" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Excluir módulo",
      }),
    );

    expect(
      (await within(screen.getByRole("dialog")).findByRole("alert"))
        .textContent,
    ).toContain("Não foi possível excluir o módulo. Tente novamente.");
    expect(
      screen.queryByText(
        "Não foi possível salvar os módulos. Tente novamente.",
      ),
    ).toBeNull();

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Excluir Descoberta" }));
    expect(
      within(await screen.findByRole("dialog")).queryByRole("alert"),
    ).toBeNull();
  });

  it("reports module creation errors only in the create dialog and clears them when reopened", async () => {
    stubCourseRequests({
      createModuleResponse: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    });
    renderAdminCourses("/admin/courses/9");

    fireEvent.click(
      await screen.findByRole("button", { name: "Adicionar módulo" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Título"), {
      target: { value: "Novo módulo" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar módulo" }),
    );

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Não foi possível adicionar o módulo. Tente novamente.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Adicionar módulo" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("reports module update errors only in the edit dialog", async () => {
    stubCourseRequests({
      updateModuleResponse: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    });
    renderAdminCourses("/admin/courses/9");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Descoberta" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar módulo" }),
    );

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Não foi possível atualizar o módulo. Tente novamente.",
    );
  });

  it("reports reorder errors in the module list without opening a form dialog", async () => {
    const secondModule = {
      ...courseDetail.modules[0],
      id: 13,
      title: "Entrega",
      position: 1,
    };
    stubCourseRequests({
      courseResponse: {
        ...courseDetail,
        modules: [...courseDetail.modules, secondModule],
      },
      reorderResponse: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    });
    renderAdminCourses("/admin/courses/9");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mover Descoberta para baixo",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível reordenar os módulos. Tente novamente.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
