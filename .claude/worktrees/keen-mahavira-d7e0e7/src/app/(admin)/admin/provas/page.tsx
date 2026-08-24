import CatalogManagerPage from "@/components/admin/CatalogManagerPage";

export default function ProvasPage() {
  return (
    <CatalogManagerPage
      entity="provas"
      title="Provas"
      singularLabel="prova"
      subtitle="Cadastre e organize as provas disponíveis para classificação das questões."
      searchPlaceholder="Filtrar provas..."
      createLabel="Criar prova"
      emptyMessage="Nenhuma prova cadastrada."
    />
  );
}
