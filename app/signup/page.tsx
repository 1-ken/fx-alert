import { redirect } from "next/navigation";

type SignupPageProps = {
  searchParams: Promise<{ ref?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const ref = params.ref?.trim();

  if (ref) {
    redirect(`/login?tab=register&ref=${encodeURIComponent(ref)}`);
  }

  redirect("/login?tab=register");
}
