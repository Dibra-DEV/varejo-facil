import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getVarejoFacilData,
  type ApiResponse,
  type Cupom,
  type CupomResumo,
  type QueryParams,
} from "../../api/varejoFacil";

export type ExpandedDetails = {
  chave: string | null;
  type: "items" | "finalizadoras" | null;
};

export const INITIAL_QUERY_PARAMS: QueryParams = {
  dataInicial: "01.09.2025",
  dataFinal: "02.09.2025",
  estabelecimento: "1",
};

export function useVarejoFacil() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [resumos, setResumos] = useState<CupomResumo[]>([]);
  const [expandedDetails, setExpandedDetails] = useState<ExpandedDetails>({
    chave: null,
    type: null,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [queryParams, setQueryParams] =
    useState<QueryParams>(INITIAL_QUERY_PARAMS);

  const fetchData = useCallback(async (params: QueryParams) => {
    setLoading(true);
    setError(null);
    setExpandedDetails({ chave: null, type: null });
    try {
      const { cupons: resultCupons, resumos: resultResumos }: ApiResponse =
        await getVarejoFacilData(params);
      setCupons(resultCupons);
      setResumos(resultResumos);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Ocorreu um erro desconhecido.";
      setError(`Não foi possível carregar os dados. Detalhe: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(queryParams);
  }, [fetchData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryParams((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDateFilter("");
    fetchData(queryParams);
  };

  const handleClearDates = () => {
    setQueryParams((prev) => ({ ...prev, dataInicial: "", dataFinal: "" }));
  };

  const handleReload = () => {
    setDateFilter("");
    setQueryParams(INITIAL_QUERY_PARAMS);
    fetchData(INITIAL_QUERY_PARAMS);
  };

  const handleToggleDetails = (
    cupomChave: string,
    type: "items" | "finalizadoras"
  ) => {
    setExpandedDetails((prev) => {
      if (prev.chave === cupomChave && prev.type === type) {
        return { chave: null, type: null };
      }
      return { chave: cupomChave, type };
    });
  };

  const filteredData = useMemo(() => {
    if (!dateFilter.trim()) {
      return { filteredCupons: cupons, filteredResumos: resumos };
    }
    const parts = dateFilter.split("/");
    if (
      parts.length !== 3 ||
      parts[0].length !== 2 ||
      parts[1].length !== 2 ||
      parts[2].length !== 4
    ) {
      return { filteredCupons: cupons, filteredResumos: resumos };
    }
    const apiFormattedDate = `${parts[2]}${parts[1]}${parts[0]}`;

    const filteredCupons = cupons.filter(
      (cupom) => cupom.rzdata === apiFormattedDate
    );
    const filteredResumos = resumos.filter(
      (resumo) => resumo.rzdata === apiFormattedDate
    );

    return { filteredCupons, filteredResumos };
  }, [cupons, resumos, dateFilter]);

  const totalValorCupons = useMemo(() => {
    return filteredData.filteredCupons.reduce(
      (acc, cupom) => acc + (cupom.vlrtot || 0),
      0
    );
  }, [filteredData.filteredCupons]);

  return {
    state: {
      cupons,
      resumos,
      expandedDetails,
      loading,
      error,
      dateFilter,
      queryParams,
      filteredData,
      totalValorCupons,
    },
    actions: {
      setDateFilter,
      setQueryParams,
      handleInputChange,
      handleSearch,
      handleClearDates,
      handleReload,
      handleToggleDetails,
      fetchData,
    },
  } as const;
}
