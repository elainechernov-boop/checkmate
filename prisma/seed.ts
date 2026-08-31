import { prisma } from "@/lib/prisma";

// Matches the familyId default baked into every scoped model's schema
// (see MULTI_FAMILY_SPEC.md) — the one family this repo has ever had data
// for, until real per-family accounts exist.
const SEED_FAMILY_ID = "seed-family";

const STUDENTS = [
  { name: "Miles", gradeLevel: "7th Grade", accentColor: "#C97B4A" },
  { name: "Violet", gradeLevel: "5th Grade", accentColor: "#5B7FA6" },
];

// The fixed subject list from SPEC.md §3, mapped to Blue Ridge's four
// work-sample-eligible categories (§8) and flagged for faith-integrated curricula.
const SUBJECTS = [
  { name: "Math", workSampleCategory: "math", isFaithIntegrated: false },
  { name: "ELA", workSampleCategory: "languageArts", isFaithIntegrated: true },
  { name: "Latin", workSampleCategory: "languageArts", isFaithIntegrated: true },
  { name: "Science", workSampleCategory: "science", isFaithIntegrated: false },
  { name: "History", workSampleCategory: "socialStudies", isFaithIntegrated: false },
  { name: "Art", workSampleCategory: "none", isFaithIntegrated: false },
  { name: "Scouts", workSampleCategory: "none", isFaithIntegrated: false },
  { name: "Other", workSampleCategory: "none", isFaithIntegrated: false },
] as const;

async function main() {
  await prisma.family.upsert({
    where: { id: SEED_FAMILY_ID },
    update: {},
    create: { id: SEED_FAMILY_ID, name: "Seed Family", slug: SEED_FAMILY_ID },
  });

  for (const student of STUDENTS) {
    await prisma.student.upsert({
      where: { familyId_name: { familyId: SEED_FAMILY_ID, name: student.name } },
      update: student,
      create: student,
    });
  }

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { familyId_name: { familyId: SEED_FAMILY_ID, name: subject.name } },
      update: subject,
      create: subject,
    });
  }

  console.log(`Seeded ${STUDENTS.length} students and ${SUBJECTS.length} subjects.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
