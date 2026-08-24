import CatalogManagerPage from "@/components/admin/CatalogManagerPage";

export default function TemasPage() {
  return (
    <CatalogManagerPage
      entity="temas"
      title="Temas"
      singularLabel="tema"
      subtitle="Cadastre os temas das questões e relacione-os com um nível."
      searchPlaceholder="Filtrar temas..."
      createLabel="Criar tema"
      emptyMessage="Nenhum tema cadastrado."
      showLevelColumn
    />
  );
}
