import { useState, useEffect, useCallback, Fragment, useMemo } from "react";
import * as XLSX from "xlsx"; // Importa a biblioteca para manipulação de Excel

// --- Interfaces para a estrutura de dados da API ---

interface CupomItem {
  item: string | null;
  matnr: string | null;
  matnr2: string | null; // Adicionado conforme solicitado
  preco: number | null;
  desconto: number | null;
  qte: number | null;
  total: number | null;
}

interface CupomFinalizadora {
  item: string | null;
  pagid: string | null;
  bandeira: string | null;
  valor: number | null;
  troco: number | null;
}

interface Cupom {
  unidade: string | null;
  necf: string | null;
  rzdata: string | null;
  coo: string | null;
  vlrtot: number | null;
  chcfe: string | null;
  cancelado: boolean;
  items: CupomItem[];
  finalizadoras: CupomFinalizadora[];
}

interface CupomResumo {
  unidade: string | null;
  rzdata: string | null;
  docInicial: string | null;
  docFinal: string | null;
  vlrBruto: number | null;
  vlrLiquido: number | null;
  vlrCancelado: number | null;
  vlrDesconto: number | null;
}

interface ApiResponse {
  cupons: Cupom[];
  resumos: CupomResumo[];
}

// Parâmetros da consulta
interface QueryParams {
  dataInicial: string;
  dataFinal: string;
  estabelecimento: string;
}

/**
 * Busca e processa os dados da API Varejo Fácil.
 * @param params Os parâmetros para a consulta (data inicial, final e estabelecimento).
 * @returns Uma promessa que resolve para um objeto contendo cupons e resumos.
 */
async function getVarejoFacilData(params: QueryParams): Promise<ApiResponse> {
  const apiUrl = "/TmConsultoria/VarejoFacil.asmx";
  const soapAction = "http://tempuri.org/ConsultaEcf";

  const soapRequest = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
      <soapenv:Header/>
      <soapenv:Body>
        <tem:ConsultaEcf>
          <tem:ConsultaEcfRequest>
            <tem:dataInicial>${params.dataInicial}</tem:dataInicial>
            <tem:dataFinal>${params.dataFinal}</tem:dataFinal>
            <tem:estabelecimento>${params.estabelecimento}</tem:estabelecimento>
          </tem:ConsultaEcfRequest>
        </tem:ConsultaEcf>
      </soapenv:Body>
    </soapenv:Envelope>
  `;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body: soapRequest,
  });

  if (!response.ok) {
    throw new Error(
      `Erro na requisição: ${response.status} ${response.statusText}`
    );
  }

  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    throw new Error("A resposta da API não é um XML válido.");
  }

  const getText = (element: Element, tagName: string) =>
    element.getElementsByTagName(tagName)[0]?.textContent?.trim() || null;
  const getFloat = (element: Element, tagName: string) => {
    const text = getText(element, tagName);
    return text ? parseFloat(text) : null;
  };

  // 1. Processar dados auxiliares (ficha técnica, itens, finalizadoras) em mapas
  const fichaTecnicaMap = new Map<string, { matnr2: string | null }>();
  Array.from(xmlDoc.getElementsByTagName("cupom_fichatecnica")).forEach(
    (fichaNode) => {
      const coo = getText(fichaNode, "COO");
      const item = getText(fichaNode, "ITEM");
      if (coo && item) {
        const key = `${coo}-${item}`;
        fichaTecnicaMap.set(key, { matnr2: getText(fichaNode, "MATNR2") });
      }
    }
  );

  const itemsMap = new Map<string, CupomItem[]>();
  Array.from(xmlDoc.getElementsByTagName("cupom_item")).forEach((itemNode) => {
    const coo = getText(itemNode, "COO");
    const matnr = getText(itemNode, "MATNR");

    if (coo && matnr) {
      if (!itemsMap.has(coo)) {
        itemsMap.set(coo, []);
      }
      const items = itemsMap.get(coo)!;
      const existingItem = items.find((it) => it.matnr === matnr);

      const qte = getFloat(itemNode, "QTE") || 0;
      const total = getFloat(itemNode, "TOTAL") || 0;
      const desconto = getFloat(itemNode, "DESCONTO") || 0;

      if (existingItem) {
        existingItem.qte = (existingItem.qte || 0) + qte;
        existingItem.total = (existingItem.total || 0) + total;
        existingItem.desconto = (existingItem.desconto || 0) + desconto;
      } else {
        const itemNum = getText(itemNode, "ITEM");
        const key = `${coo}-${itemNum}`;
        const ficha = fichaTecnicaMap.get(key);
        items.push({
          item: itemNum,
          matnr: matnr,
          matnr2: ficha?.matnr2 || null,
          preco: getFloat(itemNode, "PRECO"),
          desconto: desconto,
          qte: qte,
          total: total,
        });
      }
    }
  });

  const finalizadorasMap = new Map<string, CupomFinalizadora[]>();
  const seenFinalizadoras = new Set<string>();
  Array.from(xmlDoc.getElementsByTagName("cupom_finalizadora")).forEach(
    (finNode) => {
      const coo = getText(finNode, "COO");
      if (coo) {
        const item = getText(finNode, "ITEM");
        const pagid = getText(finNode, "PAGID");
        const bandeira = getText(finNode, "BANDEIRA");
        const valor = getFloat(finNode, "VALOR");
        const uniqueKey = `${coo}-${item}-${pagid}-${bandeira}-${valor}`;
        if (seenFinalizadoras.has(uniqueKey)) return;
        seenFinalizadoras.add(uniqueKey);

        if (!finalizadorasMap.has(coo)) {
          finalizadorasMap.set(coo, []);
        }
        finalizadorasMap.get(coo)?.push({
          item: item,
          pagid: pagid,
          bandeira: bandeira,
          valor: valor,
          troco: getFloat(finNode, "TROCO"),
        });
      }
    }
  );

  const cuponsMap = new Map<string, Cupom>();
  Array.from(xmlDoc.getElementsByTagName("cupom")).forEach((cupomNode) => {
    const chcfe = getText(cupomNode, "CHCFE");
    if (chcfe && !cuponsMap.has(chcfe)) {
      const coo = getText(cupomNode, "COO");
      cuponsMap.set(chcfe, {
        unidade: getText(cupomNode, "UNIDADE"),
        necf: getText(cupomNode, "NECF"),
        rzdata: getText(cupomNode, "RZDATA"),
        coo,
        vlrtot: getFloat(cupomNode, "VLRTOT"),
        chcfe: chcfe,
        cancelado: getText(cupomNode, "CANCELADO") === "true",
        items: coo ? itemsMap.get(coo) || [] : [],
        finalizadoras: coo ? finalizadorasMap.get(coo) || [] : [],
      });
    }
  });
  const cupons: Cupom[] = Array.from(cuponsMap.values());

  const resumos: CupomResumo[] = Array.from(
    xmlDoc.getElementsByTagName("cupom_resumo")
  ).map((resumoNode) => ({
    unidade: getText(resumoNode, "UNIDADE"),
    rzdata: getText(resumoNode, "RZDATA"),
    docInicial: getText(resumoNode, "DOC_INICIAL"),
    docFinal: getText(resumoNode, "DOC_FINAL"),
    vlrBruto: getFloat(resumoNode, "VLRBRUTO"),
    vlrLiquido: getFloat(resumoNode, "VLRLIQUIDO"),
    vlrCancelado: getFloat(resumoNode, "VLRCANCELADO"),
    vlrDesconto: getFloat(resumoNode, "VLRDESCONTO"),
  }));

  return { cupons, resumos };
}

// Funções de formatação
const formatDate = (dateStr: string | null) => {
  if (!dateStr || dateStr.length !== 8) return "N/A";
  return `${dateStr.substring(6, 8)}/${dateStr.substring(
    4,
    6
  )}/${dateStr.substring(0, 4)}`;
};
const formatCurrency = (value: number | null) => {
  if (value === null || isNaN(value)) return "0,00";
  return value.toFixed(2).replace(".", ",");
};

type ExpandedDetails = {
  chave: string | null;
  type: "items" | "finalizadoras" | null;
};

const INITIAL_QUERY_PARAMS: QueryParams = {
  dataInicial: "01.09.2025",
  dataFinal: "02.09.2025",
  estabelecimento: "1",
};

export default function App() {
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryParams((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchData = useCallback(async (params: QueryParams) => {
    setLoading(true);
    setError(null);
    setExpandedDetails({ chave: null, type: null });
    try {
      const { cupons: resultCupons, resumos: resultResumos } =
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDateFilter(""); // Limpa o filtro local ao fazer nova busca
    fetchData(queryParams);
  };

  const handleClearDates = () => {
    setQueryParams((prev) => ({
      ...prev,
      dataInicial: "",
      dataFinal: "",
    }));
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
        return { chave: null, type: null }; // Fecha se clicar no mesmo
      }
      return { chave: cupomChave, type }; // Abre o novo
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

  const handleExport = () => {
    const { filteredCupons } = filteredData;
    const worksheetData = [];

    const headers = [
      "Unidade",
      "COO",
      "Data",
      "Valor Total Cupom",
      "Chave CFe",
      "Status",
      "Item #",
      "Material",
      "Material 2",
      "Preço Item",
      "Desconto Item",
      "Qtd Item",
      "Total Item",
      "Pag ID",
      "Bandeira",
      "Valor Pago",
      "Troco",
    ];
    worksheetData.push(headers);

    filteredCupons.forEach((cupom) => {
      const maxRows = Math.max(
        cupom.items.length,
        cupom.finalizadoras.length,
        1
      );

      for (let i = 0; i < maxRows; i++) {
        const item = cupom.items[i];
        const finalizadora = cupom.finalizadoras[i];
        const row = [];

        if (i === 0) {
          row.push(cupom.unidade || "");
          row.push(cupom.coo || "");
          row.push(formatDate(cupom.rzdata));
          row.push(cupom.vlrtot);
          row.push(cupom.chcfe || "");
          row.push(cupom.cancelado ? "Cancelado" : "Válido");
        } else {
          row.push("", "", "", "", "", "");
        }

        row.push(item ? item.item : "");
        row.push(item ? item.matnr : "");
        row.push(item ? item.matnr2 || "" : "");
        row.push(item ? item.preco : "");
        row.push(item ? item.desconto : "");
        row.push(item ? item.qte : "");
        row.push(item ? item.total : "");

        row.push(finalizadora ? finalizadora.pagid : "");
        row.push(finalizadora ? finalizadora.bandeira || "" : "");
        row.push(finalizadora ? finalizadora.valor : "");
        row.push(finalizadora ? finalizadora.troco : "");

        worksheetData.push(row);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cupons");
    XLSX.writeFile(wb, "relatorio_varejo_facil.xlsx");
  };

  return (
    <div className="bg-gray-100 text-gray-800 min-h-screen p-4 sm:p-8 font-sans">
      <div className="w-full max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-blue-600">
            Painel de Análise - Varejo Fácil
          </h1>
          <button
            onClick={handleReload}
            title="Recarregar e limpar filtros"
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-sm flex items-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.899 2.101A1 1 0 0116 8.375v.002a1 1 0 01-1.732.707 5.002 5.002 0 00-8.536-1.482V10a1 1 0 01-2 0V3a1 1 0 011-1zm12 16a1 1 0 01-1-1v-2.101a7.002 7.002 0 01-11.899-2.101A1 1 0 014 9.625v-.002a1 1 0 011.732-.707 5.002 5.002 0 008.536 1.482V14a1 1 0 012 0v5a1 1 0 01-1 1z"
                clipRule="evenodd"
              />
            </svg>
            Recarregar
          </button>
        </header>

        <div className="bg-white p-4 rounded-sm border border-gray-200 mb-6 shadow-sm">
          <form
            onSubmit={handleSearch}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="flex-grow min-w-[150px]">
              <label
                htmlFor="dataInicial"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Data Inicial
              </label>
              <input
                type="text"
                name="dataInicial"
                value={queryParams.dataInicial}
                onChange={handleInputChange}
                className="w-full bg-white p-2 rounded-sm border border-gray-300"
              />
            </div>
            <div className="flex-grow min-w-[150px]">
              <label
                htmlFor="dataFinal"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Data Final
              </label>
              <input
                type="text"
                name="dataFinal"
                value={queryParams.dataFinal}
                onChange={handleInputChange}
                className="w-full bg-white p-2 rounded-sm border border-gray-300"
              />
            </div>
            <div className="flex-grow min-w-[150px]">
              <label
                htmlFor="estabelecimento"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Estabelecimento
              </label>
              <input
                type="text"
                name="estabelecimento"
                value={queryParams.estabelecimento}
                onChange={handleInputChange}
                className="w-full bg-white p-2 rounded-sm border border-gray-300"
              />
            </div>
            <button
              type="button"
              onClick={handleClearDates}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-sm"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-sm"
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </form>
        </div>

        {loading && (
          <p className="text-center py-10 text-xl text-gray-600">
            Carregando dados...
          </p>
        )}
        {error && (
          <p className="text-center text-red-700 bg-red-100 p-4 rounded-sm py-10 border border-red-200">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <div className="bg-white rounded-sm border border-gray-200 p-4 mb-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4 text-gray-700">
                Resumo por Dia
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      <th className="p-3 font-semibold text-gray-600">Data</th>
                      <th className="p-3 font-semibold text-gray-600">
                        Unidade
                      </th>
                      <th className="p-3 font-semibold text-gray-600">
                        Docs (Início-Fim)
                      </th>
                      <th className="p-3 font-semibold text-gray-600 text-right">
                        Valor Bruto
                      </th>
                      <th className="p-3 font-semibold text-gray-600 text-right">
                        Valor Líquido
                      </th>
                      <th className="p-3 font-semibold text-gray-600 text-right">
                        Descontos
                      </th>
                      <th className="p-3 font-semibold text-gray-600 text-right">
                        Cancelamentos
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.filteredResumos.map((resumo, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-200 last:border-0"
                      >
                        <td className="p-3 font-mono">
                          {formatDate(resumo.rzdata)}
                        </td>
                        <td className="p-3">{resumo.unidade}</td>
                        <td className="p-3 font-mono">
                          {resumo.docInicial} - {resumo.docFinal}
                        </td>
                        <td className="p-3 font-mono text-right">
                          {formatCurrency(resumo.vlrBruto)}
                        </td>
                        <td className="p-3 font-mono text-right text-green-600">
                          {formatCurrency(resumo.vlrLiquido)}
                        </td>
                        <td className="p-3 font-mono text-right text-orange-600">
                          {formatCurrency(resumo.vlrDesconto)}
                        </td>
                        <td className="p-3 font-mono text-right text-red-600">
                          {formatCurrency(resumo.vlrCancelado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.filteredResumos.length === 0 && (
                  <p className="text-center text-gray-500 py-4">
                    Nenhum resumo encontrado para o filtro aplicado.
                  </p>
                )}
              </div>
            </div>

            <main className="bg-white rounded-sm border border-gray-200 p-4 shadow-sm">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <h2 className="text-xl font-semibold text-gray-700">
                  Cupons Encontrados ({filteredData.filteredCupons.length})
                </h2>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filtrar por data (DD/MM/AAAA)"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="bg-white p-2 rounded-sm border border-gray-300 sm:w-auto w-full"
                  />
                  <button
                    onClick={handleExport}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-sm flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path
                        fillRule="evenodd"
                        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Exportar
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      <th className="p-3 font-semibold text-gray-600">
                        Unidade
                      </th>
                      <th className="p-3 font-semibold text-gray-600">COO</th>
                      <th className="p-3 font-semibold text-gray-600">Data</th>
                      <th className="p-3 font-semibold text-gray-600 text-right">
                        Valor Total
                      </th>
                      <th className="p-3 font-semibold text-gray-600">
                        Chave CFe
                      </th>
                      <th className="p-3 font-semibold text-gray-600 text-center">
                        Status
                      </th>
                      <th
                        className="p-3 font-semibold text-gray-600 text-center"
                        colSpan={2}
                      >
                        Detalhes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.filteredCupons.map((cupom) => (
                      <Fragment key={cupom.chcfe}>
                        <tr className="border-b border-gray-200">
                          <td className="p-3">{cupom.unidade}</td>
                          <td className="p-3 font-mono">{cupom.coo}</td>
                          <td className="p-3">{formatDate(cupom.rzdata)}</td>
                          <td className="p-3 font-mono text-right">
                            {formatCurrency(cupom.vlrtot)}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {cupom.chcfe}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                cupom.cancelado
                                  ? "bg-red-100 text-red-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {cupom.cancelado ? "Cancelado" : "Válido"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() =>
                                handleToggleDetails(cupom.chcfe!, "items")
                              }
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs py-1 px-3 rounded-sm"
                            >
                              Itens
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() =>
                                handleToggleDetails(
                                  cupom.chcfe!,
                                  "finalizadoras"
                                )
                              }
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs py-1 px-3 rounded-sm"
                            >
                              Pagamentos
                            </button>
                          </td>
                        </tr>
                        {expandedDetails.chave === cupom.chcfe && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              {expandedDetails.type === "items" && (
                                <div className="bg-blue-50 p-4 border-l-4 border-blue-500">
                                  <h4 className="text-md font-bold mb-2 text-blue-700">
                                    Itens do Cupom (COO: {cupom.coo})
                                  </h4>
                                  <div className="overflow-y-auto max-h-60">
                                    <table className="w-full text-xs">
                                      <thead className="bg-blue-100">
                                        <tr className="border-b border-blue-200">
                                          <th className="p-2">Material</th>
                                          <th className="p-2">Material 2</th>
                                          <th className="p-2 text-right">
                                            Preço
                                          </th>
                                          <th className="p-2 text-right">
                                            Desconto
                                          </th>
                                          <th className="p-2 text-right">
                                            Qtd
                                          </th>
                                          <th className="p-2 text-right">
                                            Total
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cupom.items.map((item, i) => (
                                          <tr
                                            key={i}
                                            className="border-b border-blue-200 last:border-b-0"
                                          >
                                            <td className="p-2">
                                              {item.matnr}
                                            </td>
                                            <td className="p-2">
                                              {item.matnr2 || "-"}
                                            </td>
                                            <td className="p-2 text-right">
                                              {formatCurrency(item.preco)}
                                            </td>
                                            <td className="p-2 text-right">
                                              {formatCurrency(item.desconto)}
                                            </td>
                                            <td className="p-2 text-right">
                                              {item.qte}
                                            </td>
                                            <td className="p-2 text-right font-semibold">
                                              {formatCurrency(item.total)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {expandedDetails.type === "finalizadoras" && (
                                <div className="bg-green-50 p-4 border-l-4 border-green-500">
                                  <h4 className="text-md font-bold mb-2 text-green-700">
                                    Pagamentos do Cupom (COO: {cupom.coo})
                                  </h4>
                                  <div className="overflow-y-auto max-h-60">
                                    <table className="w-full text-xs">
                                      <thead className="bg-green-100">
                                        <tr className="border-b border-green-200">
                                          <th className="p-2">PAG ID</th>
                                          <th className="p-2">Bandeira</th>
                                          <th className="p-2 text-right">
                                            Valor
                                          </th>
                                          <th className="p-2 text-right">
                                            Troco
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cupom.finalizadoras.map((fin, i) => (
                                          <tr
                                            key={i}
                                            className="border-b border-green-200 last:border-b-0"
                                          >
                                            <td className="p-2">{fin.pagid}</td>
                                            <td className="p-2">
                                              {fin.bandeira || "-"}
                                            </td>
                                            <td className="p-2 text-right">
                                              {formatCurrency(fin.valor)}
                                            </td>
                                            <td className="p-2 text-right">
                                              {formatCurrency(fin.troco)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {filteredData.filteredCupons.length === 0 && (
                  <p className="text-center text-gray-500 py-10">
                    Nenhum cupom encontrado para o filtro aplicado.
                  </p>
                )}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
