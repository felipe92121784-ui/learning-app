/* eslint-disable react/only-export-components */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccessRuleForm } from "@/features/access-rules/access-rule-form";
import { EffectiveAccessSummary } from "@/features/access-rules/effective-access-summary";
import type { AccessResource } from "@/features/access-rules/access-rules-types";
import { EditCourseForm } from "@/features/courses/course-form";
import { ModuleForm } from "@/features/courses/module-form";
import { ModulesList } from "@/features/courses/modules-list";
import { MaterialUploadForm } from "@/features/materials/material-upload-form";
import { MaterialsList } from "@/features/materials/materials-list";
import { useMaterialsQuery } from "@/features/materials/materials-queries";
import type { UploadSetting } from "@/features/materials/materials-types";
import { useUsersQuery } from "@/features/users/users-queries";
import {
  uploadSettingsQueryOptions,
  useUploadSettingsQuery,
} from "@/features/settings/upload-settings-queries";
import {
  courseQueryOptions,
  useCourseQuery,
  useCreateModuleMutation,
  useDeleteModuleMutation,
  useReorderModulesMutation,
  useUpdateCourseMutation,
  useUpdateModuleMutation,
} from "@/features/courses/courses-queries";
import type {
  CourseModule,
  CreateModuleInput,
  UpdateCourseInput,
  UpdateModuleInput,
} from "@/features/courses/courses-types";

export const Route = createFileRoute("/_admin/admin/courses/$courseId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      courseQueryOptions(Number(params.courseId)),
    );
    void context.queryClient
      .ensureQueryData(uploadSettingsQueryOptions())
      .catch(() => undefined);
  },
  errorComponent: CourseRouteError,
  component: CoursePage,
});

function CourseRouteError() {
  return (
    <main>
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar o curso. Tente novamente.
        </AlertDescription>
      </Alert>
    </main>
  );
}

function CoursePage() {
  const { courseId: courseIdParam } = Route.useParams();
  const courseId = Number(courseIdParam);
  const courseQuery = useCourseQuery(courseId);
  const updateCourseMutation = useUpdateCourseMutation();
  const createModuleMutation = useCreateModuleMutation();
  const updateModuleMutation = useUpdateModuleMutation();
  const deleteModuleMutation = useDeleteModuleMutation();
  const reorderModulesMutation = useReorderModulesMutation();
  const uploadSettingsQuery = useUploadSettingsQuery();
  const [moduleDialog, setModuleDialog] = useState<
    "create" | CourseModule | null
  >(null);
  const [moduleToDelete, setModuleToDelete] = useState<CourseModule | null>(
    null,
  );
  const [materialModule, setMaterialModule] = useState<CourseModule | null>(
    null,
  );
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);

  function handleCourseSubmit(input: UpdateCourseInput) {
    updateCourseMutation.mutate({ courseId, input });
  }

  function openCreateModuleDialog() {
    createModuleMutation.reset();
    setModuleDialog("create");
  }

  function openUpdateModuleDialog(module: CourseModule) {
    updateModuleMutation.reset();
    setModuleDialog(module);
  }

  function closeModuleDialog() {
    if (moduleDialog === "create") {
      createModuleMutation.reset();
    } else if (moduleDialog) {
      updateModuleMutation.reset();
    }
    setModuleDialog(null);
  }

  function openDeleteModuleDialog(module: CourseModule) {
    deleteModuleMutation.reset();
    setModuleToDelete(module);
  }

  function closeDeleteModuleDialog() {
    if (deleteModuleMutation.isPending) return;
    deleteModuleMutation.reset();
    setModuleToDelete(null);
  }

  function handleModuleSubmit(input: CreateModuleInput | UpdateModuleInput) {
    if (moduleDialog === "create") {
      createModuleMutation.mutate(
        { courseId, input: input as CreateModuleInput },
        { onSuccess: () => setModuleDialog(null) },
      );
      return;
    }

    if (moduleDialog) {
      updateModuleMutation.mutate(
        {
          courseId,
          moduleId: moduleDialog.id,
          input: input as UpdateModuleInput,
        },
        { onSuccess: () => setModuleDialog(null) },
      );
    }
  }

  function handleDeleteModule() {
    if (!moduleToDelete) return;

    deleteModuleMutation.mutate(
      { courseId, moduleId: moduleToDelete.id },
      { onSuccess: () => setModuleToDelete(null) },
    );
  }

  if (courseQuery.isPending) {
    return (
      <main>
        <Card>
          <CardContent className="py-8 text-sm text-slate-600">
            Carregando curso…
          </CardContent>
        </Card>
      </main>
    );
  }

  if (courseQuery.isError) {
    return <CourseRouteError />;
  }

  const course = courseQuery.data;
  const isModuleMutationPending =
    createModuleMutation.isPending ||
    updateModuleMutation.isPending ||
    deleteModuleMutation.isPending ||
    reorderModulesMutation.isPending;
  const createModuleError = createModuleMutation.isError
    ? "Não foi possível adicionar o módulo. Tente novamente."
    : null;
  const updateModuleError = updateModuleMutation.isError
    ? "Não foi possível atualizar o módulo. Tente novamente."
    : null;
  const deleteError = deleteModuleMutation.isError
    ? "Não foi possível excluir o módulo. Tente novamente."
    : null;
  const reorderError = reorderModulesMutation.isError
    ? "Não foi possível reordenar os módulos. Tente novamente."
    : null;

  return (
    <main className="space-y-8">
      <Button asChild variant="ghost">
        <Link to="/admin/courses">Voltar para cursos</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Editar curso</CardTitle>
          <CardDescription>
            Atualize as informações e o status de publicação do curso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditCourseForm
            course={course}
            error={
              updateCourseMutation.isError
                ? "Não foi possível salvar o curso. Revise os dados e tente novamente."
                : null
            }
            isPending={updateCourseMutation.isPending}
            onSubmit={handleCourseSubmit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Permissões de acesso</CardTitle>
              <CardDescription>
                Configure o acesso individual de alunos ao curso, módulos e materiais.
              </CardDescription>
            </div>
            <Button
              onClick={() => setPermissionsDialogOpen(true)}
              type="button"
            >
              Gerenciar permissões
            </Button>
          </div>
        </CardHeader>
      </Card>

      <section aria-labelledby="course-materials-heading" className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold" id="course-materials-heading">
            Materiais
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Envie e organize os materiais privados de cada módulo.
          </p>
        </div>

        {course.modules.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Adicione um módulo para gerenciar seus materiais.
            </CardContent>
          </Card>
        ) : (
          course.modules.map((module) => (
            <ModuleMaterialsCard
              key={module.id}
              module={module}
              onUpload={() => setMaterialModule(module)}
              settings={uploadSettingsQuery.data}
              settingsError={uploadSettingsQuery.isError}
              settingsLoading={uploadSettingsQuery.isPending}
            />
          ))
        )}
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Módulos</CardTitle>
              <CardDescription>
                Organize a sequência de aprendizagem do curso.
              </CardDescription>
            </div>
            <Button onClick={openCreateModuleDialog} type="button">
              Adicionar módulo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ModulesList
            error={reorderError}
            isMutating={isModuleMutationPending}
            modules={course.modules}
            onDelete={openDeleteModuleDialog}
            onEdit={openUpdateModuleDialog}
            onMove={(moduleIds) => {
              reorderModulesMutation.reset();
              reorderModulesMutation.mutate({ courseId, moduleIds });
            }}
          />
        </CardContent>
      </Card>

      <Dialog
        open={moduleDialog !== null}
        onOpenChange={(open) => !open && closeModuleDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moduleDialog === "create" ? "Adicionar módulo" : "Editar módulo"}
            </DialogTitle>
            <DialogDescription>
              Defina o título e uma descrição opcional para o módulo.
            </DialogDescription>
          </DialogHeader>
          <ModuleForm
            error={
              moduleDialog === "create" ? createModuleError : updateModuleError
            }
            isPending={
              createModuleMutation.isPending || updateModuleMutation.isPending
            }
            module={
              moduleDialog && typeof moduleDialog === "object"
                ? moduleDialog
                : undefined
            }
            onSubmit={handleModuleSubmit}
          />
        </DialogContent>
      </Dialog>

      {permissionsDialogOpen ? (
        <AccessPermissionsDialog
          courseId={course.id}
          modules={course.modules}
          onClose={() => setPermissionsDialogOpen(false)}
        />
      ) : null}

      <Dialog
        open={materialModule !== null}
        onOpenChange={(open) => !open && setMaterialModule(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar material</DialogTitle>
            <DialogDescription>
              {materialModule
                ? `Envie um material privado para o módulo ${materialModule.title}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {materialModule && uploadSettingsQuery.data ? (
            <MaterialUploadForm
              moduleId={materialModule.id}
              onSuccess={() => setMaterialModule(null)}
              settings={uploadSettingsQuery.data}
            />
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                Não foi possível carregar os limites de upload. Feche e tente novamente.
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={moduleToDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteModuleDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir módulo</DialogTitle>
            <DialogDescription>
              {moduleToDelete
                ? `${moduleToDelete.title} será removido permanentemente.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild disabled={deleteModuleMutation.isPending}>
              <Button
                disabled={deleteModuleMutation.isPending}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
            </DialogClose>
            <Button
              disabled={deleteModuleMutation.isPending}
              onClick={handleDeleteModule}
              type="button"
              variant="destructive"
            >
              {deleteModuleMutation.isPending ? "Excluindo…" : "Excluir módulo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function resourceValue(resource: AccessResource) {
  return `${resource.type}:${resource.id}`;
}

function MaterialResourceOptions({ module }: { module: CourseModule }) {
  const materialsQuery = useMaterialsQuery(module.id);

  return materialsQuery.data?.map((material) => (
    <SelectItem
      key={`MATERIAL:${material.id}`}
      value={resourceValue({ type: "MATERIAL", id: material.id })}
    >
      Material: {material.title} ({module.title})
    </SelectItem>
  ));
}

function AccessPermissionsDialog({
  courseId,
  modules,
  onClose,
}: {
  courseId: number;
  modules: CourseModule[];
  onClose: () => void;
}) {
  const usersQuery = useUsersQuery();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [resource, setResource] = useState<AccessResource>({
    type: "COURSE",
    id: courseId,
  });
  const students = (usersQuery.data ?? []).filter((user) => user.role === "STUDENT");

  function selectResource(value: string) {
    const [type, id] = value.split(":");
    setResource({
      type: type as AccessResource["type"],
      id: Number(id),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar permissões</DialogTitle>
          <DialogDescription>
            Escolha um aluno e o recurso administrativo a configurar. As regras
            diretas não concedem acesso a administradores.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="access-rule-student">
              Aluno
            </label>
            <Select
              onValueChange={(value) => setSelectedUserId(Number(value))}
              value={selectedUserId === null ? "" : String(selectedUserId)}
            >
              <SelectTrigger aria-label="Aluno" id="access-rule-student">
                <SelectValue placeholder="Selecione um aluno" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={String(student.id)}>
                    {student.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {usersQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando alunos…</p>
            ) : null}
            {usersQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Não foi possível carregar os alunos. Tente novamente.
                </AlertDescription>
              </Alert>
            ) : null}
            {!usersQuery.isPending && !usersQuery.isError && students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aluno disponível para configurar permissões.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="access-rule-resource">
              Recurso
            </label>
            <Select onValueChange={selectResource} value={resourceValue(resource)}>
              <SelectTrigger aria-label="Recurso" id="access-rule-resource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={resourceValue({ type: "COURSE", id: courseId })}>
                  Curso
                </SelectItem>
                {modules.map((module) => (
                  <SelectItem
                    key={`MODULE:${module.id}`}
                    value={resourceValue({ type: "MODULE", id: module.id })}
                  >
                    Módulo: {module.title}
                  </SelectItem>
                ))}
                {modules.map((module) => (
                  <MaterialResourceOptions key={module.id} module={module} />
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedUserId ? (
          <div className="space-y-6">
            <AccessRuleForm
              onSaved={onClose}
              resource={resource}
              userId={selectedUserId}
            />
            <EffectiveAccessSummary resource={resource} userId={selectedUserId} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModuleMaterialsCard({
  module,
  onUpload,
  settings,
  settingsError,
  settingsLoading,
}: {
  module: CourseModule;
  onUpload: () => void;
  settings: UploadSetting[] | undefined;
  settingsError: boolean;
  settingsLoading: boolean;
}) {
  const materialsQuery = useMaterialsQuery(module.id);
  const uploadUnavailable = settingsLoading || settingsError || !settings;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Materiais — {module.title}</CardTitle>
            <CardDescription>
              {module.description ?? "Materiais privados deste módulo."}
            </CardDescription>
          </div>
          <Button
            aria-label={`Enviar material para ${module.title}`}
            disabled={uploadUnavailable}
            onClick={onUpload}
            type="button"
          >
            {settingsLoading ? "Carregando limites…" : "Enviar material"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {settingsError ? (
          <Alert className="mb-4" variant="destructive">
            <AlertDescription>
              Não foi possível carregar os limites de upload. O envio está indisponível.
            </AlertDescription>
          </Alert>
        ) : null}
        <MaterialsList
          error={
            materialsQuery.isError
              ? "Não foi possível carregar os materiais. Tente novamente."
              : null
          }
          isLoading={materialsQuery.isPending}
          materials={materialsQuery.data ?? []}
          moduleId={module.id}
        />
      </CardContent>
    </Card>
  );
}
