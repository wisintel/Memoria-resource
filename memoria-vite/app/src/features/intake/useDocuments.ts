import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignShelfFolderItem,
  createShelfFolder,
  deleteDocument,
  deleteShelfFolder,
  importDocument,
  importDocumentFile,
  loadDocumentWorkbench,
  updateItem,
  updateShelfFolder
} from "@/api";
import { queryKeys } from "@/lib/query-keys";

type UpdateItemInput = Parameters<typeof updateItem>[1];

export function useDocuments() {
  return useQuery({ queryKey: queryKeys.documents(), queryFn: loadDocumentWorkbench });
}

export function useImportDocument() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: importDocument,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useImportDocumentFile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: importDocumentFile,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useCreateShelfFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createShelfFolder,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useUpdateShelfFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateShelfFolder>[1] }) =>
      updateShelfFolder(id, input),
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useDeleteShelfFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteShelfFolder,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useAssignShelfFolderItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: assignShelfFolderItem,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.documents(), snapshot)
  });
}

export function useSaveDocumentDetails() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateItemInput }) => updateItem(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.documents() })
  });
}
