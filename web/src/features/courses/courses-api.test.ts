import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCourse,
  createModule,
  deleteModule,
  getCourse,
  listCourses,
  reorderModules,
  updateCourse,
  updateModule,
} from "./courses-api";
import type { Course, CourseModule } from "./courses-types";

const firstModule = {
  id: 11,
  courseId: 7,
  title: "Fundamentos",
  description: "Introdução",
  position: 0,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: null,
} satisfies CourseModule;

const course = {
  id: 7,
  title: "Metrologia",
  description: "Fundamentos",
  status: "DRAFT" as const,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: null,
  modules: [firstModule],
} satisfies Course;

function useApiResponse(body?: unknown, status = 200) {
  vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
  const response =
    status === 204
      ? new Response(null, { status })
      : Response.json(body, { status });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("courses API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("unwraps the administrative course list", async () => {
    const fetchMock = useApiResponse({ data: [course] });

    await expect(listCourses()).resolves.toEqual([course]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses",
    );
  });

  it("gets one course from its detail endpoint", async () => {
    const fetchMock = useApiResponse({ data: course });

    await expect(getCourse(7)).resolves.toEqual(course);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7",
    );
  });

  it("posts only title and optional description when creating a course", async () => {
    const fetchMock = useApiResponse({ data: course });

    await expect(
      createCourse({ title: "Metrologia", description: "Fundamentos" }),
    ).resolves.toEqual(course);

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(
      JSON.stringify({ title: "Metrologia", description: "Fundamentos" }),
    );
  });

  it("patches editable course fields including its status", async () => {
    const updatedCourse = {
      id: course.id,
      title: course.title,
      description: course.description,
      status: "PUBLISHED" as const,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
    const fetchMock = useApiResponse({
      data: updatedCourse,
    });

    await expect(
      updateCourse(7, {
        title: "Metrologia",
        description: "Fundamentos",
        status: "PUBLISHED",
      }),
    ).resolves.toEqual(updatedCourse);

    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7",
    );
    expect(request?.method).toBe("PATCH");
    expect(request?.body).toBe(
      JSON.stringify({
        title: "Metrologia",
        description: "Fundamentos",
        status: "PUBLISHED",
      }),
    );
  });

  it("creates and updates modules through their nested endpoints", async () => {
    useApiResponse({ data: firstModule });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(Response.json({ data: firstModule }));
    fetchMock.mockResolvedValueOnce(Response.json({ data: firstModule }));

    await createModule(7, { title: "Fundamentos", description: "Introdução" });
    let request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7/modules",
    );
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(
      JSON.stringify({ title: "Fundamentos", description: "Introdução" }),
    );

    await updateModule(7, 11, { title: "Introdução" });
    request = fetchMock.mock.calls[1]?.[1];
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7/modules/11",
    );
    expect(request?.method).toBe("PATCH");
    expect(request?.body).toBe(JSON.stringify({ title: "Introdução" }));
  });

  it("deletes a module through its nested endpoint", async () => {
    const fetchMock = useApiResponse(undefined, 204);

    await expect(deleteModule(7, 11)).resolves.toBeUndefined();
    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7/modules/11",
    );
    expect(request?.method).toBe("DELETE");
  });

  it("puts the complete module ID order and unwraps the updated course", async () => {
    const fetchMock = useApiResponse({ data: course });

    await expect(reorderModules(7, { moduleIds: [11] })).resolves.toEqual(
      course,
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/courses/7/modules/order",
    );
    expect(request?.method).toBe("PUT");
    expect(request?.body).toBe(JSON.stringify({ moduleIds: [11] }));
  });
});
