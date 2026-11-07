import { notFound } from "next/navigation";
import { connection } from "next/server";

// For the end-to-end tests only (E2E_FIXTURES): a page that breaks, to show
// what anyone sees when something goes wrong. Anywhere else it isn't here.
export default async function Broken() {
  await connection();
  if (process.env.E2E_FIXTURES !== "true") notFound();
  throw new Error("Broken on purpose, for the tests.");
}
