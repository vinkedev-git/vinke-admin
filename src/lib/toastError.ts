import { toast } from "sonner";

/**
 * Exibe um toast de erro a partir de qualquer valor capturado num catch block.
 * Substitui o padrão repetitivo:
 *   toast.error(error instanceof Error ? error.message : "Mensagem padrão")
 */
export function toastError(error: unknown, fallback = "Ocorreu um erro inesperado.") {
  toast.error(error instanceof Error ? error.message : fallback);
}
