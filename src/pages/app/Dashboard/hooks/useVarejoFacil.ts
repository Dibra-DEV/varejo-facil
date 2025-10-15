import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getVarejoFacilData,
  type ApiResponse,
  type Cupom,
  type CupomResumo,
  type QueryParams,
} from "../../../../../api";

export type ExpandedDetails = {
  chave: string | null;
  type: "items" | "finalizadoras" | "subitems" | "sublist" | null;
};

export const INITIAL_QUERY_PARAMS: QueryParams = {
  dataInicial: "01.09.2025",
  dataFinal: "01.09.2025",
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
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const fetchData = useCallback(async (params: QueryParams) => {
    setLoading(true);
    setError(null);
    setExpandedDetails({ chave: null, type: null });
    try {
      const parse = (dateStr: string) => {
        const parts = dateStr?.split(".");
        if (!parts || parts.length !== 3) return null;
        const [dd, mm, yyyy] = parts.map((p) => parseInt(p, 10));
        if (!yyyy || !mm || !dd) return null;
        const d = new Date(yyyy, mm - 1, dd);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const format = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
      };
      const addDays = (d: Date, days: number) => {
        const nd = new Date(d);
        nd.setDate(nd.getDate() + days);
        return nd;
      };

      const start = parse(params.dataInicial);
      const end = parse(params.dataFinal);

      if (!start || !end || start > end) {
        const { cupons: resultCupons, resumos: resultResumos }: ApiResponse =
          await getVarejoFacilData(params);
        setCupons(resultCupons);
        setResumos(resultResumos);
        return;
      }

      const diffMs = end.getTime() - start.getTime();
      const rangeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

      if (rangeDays <= 7) {
        const { cupons: resultCupons, resumos: resultResumos }: ApiResponse =
          await getVarejoFacilData(params);
        setCupons(resultCupons);
        setResumos(resultResumos);
        return;
      }

      const cuponsMap = new Map<string, Cupom>();
      const resumosAll: CupomResumo[] = [];

      let day = new Date(start);
      while (day <= end) {
        try {
          const resp = await getVarejoFacilData({
            dataInicial: format(day),
            dataFinal: format(day),
            estabelecimento: params.estabelecimento,
          });
          for (const c of resp.cupons) {
            if (c.chcfe && !cuponsMap.has(c.chcfe)) {
              cuponsMap.set(c.chcfe, c);
            }
          }
          resumosAll.push(...resp.resumos);
        } catch (_ignore) {
          // ignora erro desse dia e segue
        }
        day = addDays(day, 1);
      }

      const resultCupons = Array.from(cuponsMap.values()).sort((a, b) => {
        const aNum = a.coo ? parseInt(a.coo, 10) : Number.POSITIVE_INFINITY;
        const bNum = b.coo ? parseInt(b.coo, 10) : Number.POSITIVE_INFINITY;
        if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
          return (a.coo || "").localeCompare(b.coo || "");
        }
        return aNum - bNum;
      });

      setCupons(resultCupons);
      setResumos(resumosAll);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Ocorreu um erro desconhecido.";
      setError(`Não foi possível carregar os dados. Detalhe: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDataChunked = useCallback(async (params: QueryParams) => {
    setLoading(true);
    setError(null);
    setExpandedDetails({ chave: null, type: null });
    setProgress({ current: 0, total: 0 });
    try {
      const parse = (dateStr: string) => {
        const parts = dateStr?.split(".");
        if (!parts || parts.length !== 3) return null;
        const [dd, mm, yyyy] = parts.map((p) => parseInt(p, 10));
        if (!yyyy || !mm || !dd) return null;
        const d = new Date(yyyy, mm - 1, dd);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const format = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
      };
      const addDays = (d: Date, days: number) => {
        const nd = new Date(d);
        nd.setDate(nd.getDate() + days);
        return nd;
      };

      const start = parse(params.dataInicial);
      const end = parse(params.dataFinal);
      if (!start || !end || start > end) {
        const { cupons: resultCupons, resumos: resultResumos }: ApiResponse =
          await getVarejoFacilData(params);
        setCupons(resultCupons);
        setResumos(resultResumos);
        setProgress({ current: 1, total: 1 });
        return;
      }

      const cuponsMap = new Map<string, Cupom>();
      const resumosAll: CupomResumo[] = [];

      let total = 0;
      {
        let tmp = new Date(start);
        while (tmp <= end) {
          total++;
          tmp = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate() + 1);
        }
      }
      setProgress({ current: 0, total });

      let day = new Date(start);
      while (day <= end) {
        try {
          const resp = await getVarejoFacilData({
            dataInicial: format(day),
            dataFinal: format(day),
            estabelecimento: params.estabelecimento,
          });
          for (const c of resp.cupons) {
            if (c.chcfe && !cuponsMap.has(c.chcfe)) {
              cuponsMap.set(c.chcfe, c);
            }
          }
          resumosAll.push(...resp.resumos);
        } catch (_ignore) {
          // ignore 500 or other errors for that day
        }
        setProgress((p) => ({
          current: Math.min(p.current + 1, p.total),
          total: p.total,
        }));
        day = addDays(day, 1);
      }

      const resultCupons = Array.from(cuponsMap.values()).sort((a, b) => {
        const aNum = a.coo ? parseInt(a.coo, 10) : Number.POSITIVE_INFINITY;
        const bNum = b.coo ? parseInt(b.coo, 10) : Number.POSITIVE_INFINITY;
        if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
          return (a.coo || "").localeCompare(b.coo || "");
        }
        return aNum - bNum;
      });

      setCupons(resultCupons);
      setResumos(resumosAll);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Ocorreu um erro desconhecido.";
      setError(`Não foi possível carregar os dados. Detalhe: ${msg}`);
    } finally {
      setProgress((p) => ({ current: p.total, total: p.total }));
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
    key: string,
    type: "items" | "finalizadoras" | "subitems" | "sublist"
  ) => {
    setExpandedDetails((prev) => {
      if (prev.chave === key && prev.type === type) {
        return { chave: null, type: null };
      }

      return { chave: key, type };
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
      progress,
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
      fetchDataChunked,
    },
  } as const;
}
