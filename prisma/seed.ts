import { prisma } from "@/lib/prisma";

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
  for (const student of STUDENTS) {
    await prisma.student.upsert({
      where: { name: student.name },
      update: student,
      create: student,
    });
  }

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { name: subject.name },
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
