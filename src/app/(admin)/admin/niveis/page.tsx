import CatalogManagerPage from "@/components/admin/CatalogManagerPage";

export default function NiveisPage() {
  return (
    <CatalogManagerPage
      entity="niveis"
      title="Níveis"
      singularLabel="nível"
      subtitle="Cadastre os níveis acadêmicos usados na classificação das questões."
      searchPlaceholder="Filtrar níveis..."
      createLabel="Criar nível"
      emptyMessage="Nenhum nível cadastrado."
    />
  );
}
