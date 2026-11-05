import { createFileRoute } from "@tanstack/react-router";
import { QuestionBankPage } from "@/components/question-bank/QuestionBankPage";
import { parseBankSearch } from "@/lib/question-bank";

export const Route = createFileRoute("/_authenticated/question-bank")({
  ssr: false,
  validateSearch: parseBankSearch,
  head: () => ({
    meta: [
      { title: "Question Bank" },
      {
        name: "description",
        content:
          "Browse De-Bright school questions by class, subject, difficulty and approval status.",
      },
      { property: "og:title", content: "Question Bank" },
      {
        property: "og:description",
        content: "Organised class and subject question bank for De-Bright staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionBankRoute,
});
function QuestionBankRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <QuestionBankPage
      search={search}
      change={(next) => {
        void navigate({ search: next });
      }}
    />
  );
}
