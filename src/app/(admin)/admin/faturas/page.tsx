import { redirect } from "next/navigation";

// Faturas agora vive como aba dentro de Assinaturas & Faturas.
export default function FaturasPage() {
  redirect("/admin/assinaturas?tab=faturas");
}
