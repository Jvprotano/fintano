import {
  inspectRepository,
  readRepositoryDocument,
  REPOSITORY_CHANGED_EVENT,
  REPOSITORY_STORAGE_KEY,
  writeRepositoryDocument,
  type RepositoryDocument,
} from './repository'

export type CommandResult =
  | { ok: true; alreadyApplied: boolean }
  | { ok: false; reason: 'invalid' | 'conflict' | 'rejected' | 'write_failed'; message: string }

export interface RepositoryCommand {
  id: string
  expectedRevision?: string | null
  apply: (document: RepositoryDocument) => RepositoryDocument | null
}

/** O JSON bruto identifica a revisão vista quando uma confirmação foi aberta. */
export function repositoryRevision(storage: Storage = window.localStorage): string | null {
  return storage.getItem(REPOSITORY_STORAGE_KEY)
}

/** Prepara todas as coleções e as grava uma única vez; os hooks sincronizam após o sucesso. */
export function runRepositoryCommand(
  command: RepositoryCommand,
  storage: Storage = window.localStorage,
): CommandResult {
  if (!command.id.trim()) return { ok: false, reason: 'rejected', message: 'Operação sem identidade.' }
  const before = repositoryRevision(storage)
  const inspection = inspectRepository(storage)
  if (inspection.status === 'blocked') {
    return { ok: false, reason: 'invalid', message: inspection.message }
  }
  const document = readRepositoryDocument(storage)
  if (document.appliedOperations?.includes(command.id)) return { ok: true, alreadyApplied: true }
  if (command.expectedRevision !== undefined && before !== command.expectedRevision) {
    return { ok: false, reason: 'conflict', message: 'Os dados mudaram em outra aba. Revise antes de confirmar novamente.' }
  }

  let next: RepositoryDocument | null
  try {
    next = command.apply(document)
  } catch (error) {
    return {
      ok: false, reason: 'rejected',
      message: error instanceof Error ? error.message : 'Esta operação não pôde ser aplicada.',
    }
  }
  if (!next) return { ok: false, reason: 'rejected', message: 'Esta operação não é válida para os dados atuais.' }
  if (repositoryRevision(storage) !== before) {
    return { ok: false, reason: 'conflict', message: 'Os dados mudaram durante a operação. Revise antes de confirmar novamente.' }
  }
  const toWrite: RepositoryDocument = {
    ...next,
    appliedOperations: [...(next.appliedOperations ?? document.appliedOperations ?? []), command.id],
  }
  if (!writeRepositoryDocument(toWrite, storage)) {
    return { ok: false, reason: 'write_failed', message: 'O navegador recusou a gravação. Nenhuma parte da operação foi salva.' }
  }
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.dispatchEvent(new CustomEvent(REPOSITORY_CHANGED_EVENT))
  }
  return { ok: true, alreadyApplied: false }
}
