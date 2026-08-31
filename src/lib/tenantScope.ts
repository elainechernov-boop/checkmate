// The multi-tenant safety net (MULTI_FAMILY_SPEC.md Phase 2): rather than
// trusting every call site across the app to remember a `where: { familyId
// }` filter, every query against a family-owned model is intercepted here
// and scoped automatically. A forgotten filter at some call site simply
// can't leak another family's data — there's no call site left where the
// scoping is optional. See getScopedPrisma() in prisma.ts for how a
// request gets one of these bound to its own family.
const TENANT_SCOPED_MODELS = new Set([
  "Student",
  "Subject",
  "Project",
  "ProjectIdea",
  "AssignmentSeries",
  "AssignmentInstance",
  "SchoolDay",
  "LearningPeriod",
  "DaySeparator",
  "FamilyCalendarSettings",
  "DismissedCalendarEvent",
  "CalendarEventAssignment",
  "UndoLogEntry",
]);

// Every read/write-by-filter operation whose `args.where` should be ANDed
// with familyId. (RecurrenceRule and RemovedOccurrence are intentionally
// absent from TENANT_SCOPED_MODELS — they carry no familyId of their own,
// scoped indirectly through the AssignmentSeries they belong to.)
const WHERE_SCOPED_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type AllOperationsArgs = {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

export function tenantScopeExtension(familyId: string) {
  return {
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: AllOperationsArgs) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (operation === "create") {
            args.data = { ...(args.data as object), familyId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = args.data;
            args.data = Array.isArray(data)
              ? data.map((row) => ({ ...row, familyId }))
              : { ...(data as object), familyId };
          } else if (operation === "upsert") {
            args.where = { ...(args.where as object), familyId };
            args.create = { ...(args.create as object), familyId };
          } else if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            args.where = { ...((args.where as object) ?? {}), familyId };
          }

          return query(args);
        },
      },
    },
  };
}
