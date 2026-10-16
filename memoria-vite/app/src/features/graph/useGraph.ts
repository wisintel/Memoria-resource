import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDomain,
  createEdge,
  createItem,
  createView,
  deleteDomain,
  deleteEdge,
  deleteItem,
  deleteView,
  loadGraph,
  resetWorkbench,
  runDomainContext,
  saveItemPositions,
  updateDomain,
  updateEdge,
  updateItem,
  updateView
} from "@/api";
import { queryKeys } from "@/lib/query-keys";
import type { GraphSnapshot } from "@/types";

type GraphParams = {
  domainId?: string | null;
  viewId?: string | null;
};

type GraphMutationFn<TInput> = (input: TInput) => Promise<GraphSnapshot>;

export function useGraph(params: GraphParams) {
  return useQuery({
    queryKey: queryKeys.graph(params),
    queryFn: () => loadGraph(params.viewId, params.domainId),
    placeholderData: keepPreviousData
  });
}

function useGraphSnapshotMutation<TInput>(params: GraphParams, mutationFn: GraphMutationFn<TInput>) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (snapshot) => qc.setQueryData(queryKeys.graph(params), snapshot)
  });
}

export function useCreateDomain() {
  return useMutation({ mutationFn: createDomain });
}

export function useUpdateDomain() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDomain>[1] }) => updateDomain(id, input)
  });
}

export function useDeleteDomain() {
  return useMutation({ mutationFn: deleteDomain });
}

export function useCreateView() {
  return useMutation({ mutationFn: createView });
}

export function useUpdateView() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateView>[1] }) => updateView(id, input)
  });
}

export function useDeleteView() {
  return useMutation({ mutationFn: deleteView });
}

export function useCreateItem(params: GraphParams) {
  return useGraphSnapshotMutation(params, createItem);
}

export function useUpdateItem(params: GraphParams) {
  return useGraphSnapshotMutation(params, ({ id, input }: { id: string; input: Parameters<typeof updateItem>[1] }) =>
    updateItem(id, input)
  );
}

export function useDeleteItem(params: GraphParams) {
  return useGraphSnapshotMutation(
    params,
    ({ id, domainId, viewId }: { domainId?: string | null; id: string; viewId?: string | null }) =>
      deleteItem(id, viewId, domainId)
  );
}

export function useCreateEdge(params: GraphParams) {
  return useGraphSnapshotMutation(params, createEdge);
}

export function useUpdateEdge(params: GraphParams) {
  return useGraphSnapshotMutation(params, ({ id, input }: { id: string; input: Parameters<typeof updateEdge>[1] }) =>
    updateEdge(id, input)
  );
}

export function useDeleteEdge(params: GraphParams) {
  return useGraphSnapshotMutation(
    params,
    ({ id, domainId, viewId }: { domainId?: string | null; id: string; viewId?: string | null }) =>
      deleteEdge(id, viewId, domainId)
  );
}

export function useSaveItemPositions(params: GraphParams) {
  return useGraphSnapshotMutation(params, saveItemPositions);
}

export function useResetWorkbench(params: GraphParams) {
  return useGraphSnapshotMutation(params, resetWorkbench);
}

export function useRunDomainContext(params: GraphParams) {
  return useGraphSnapshotMutation(
    params,
    ({ id, input }: { id: string; input: Parameters<typeof runDomainContext>[1] }) => runDomainContext(id, input)
  );
}
