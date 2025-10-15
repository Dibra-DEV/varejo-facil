export interface CupomSubItem {
  matnr2: string | null;
  qte2: number | null;
  und2: string | null;
}

export interface CupomItem {
  item: string | null;
  matnr: string | null;
  matnr2: string | null;
  preco: number | null;
  desconto: number | null;
  qte: number | null;
  total: number | null;
  subItems?: CupomSubItem[];
}

export interface CupomFinalizadora {
  item: string | null;
  pagid: string | null;
  bandeira: string | null;
  valor: number | null;
  troco: number | null;
  autorizacao: string | null;
}

export interface Cupom {
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

export interface CupomResumo {
  unidade: string | null;
  rzdata: string | null;
  docInicial: string | null;
  docFinal: string | null;
  vlrBruto: number | null;
  vlrLiquido: number | null;
  vlrCancelado: number | null;
  vlrDesconto: number | null;
}

export interface ApiResponse {
  cupons: Cupom[];
  resumos: CupomResumo[];
}

export interface QueryParams {
  dataInicial: string;
  dataFinal: string;
  estabelecimento: string;
}

export async function getVarejoFacilData(
  params: QueryParams
): Promise<ApiResponse> {
  const apiUrl = "/api/proxy";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(
      `Erro na requisição ao proxy: ${response.status} ${response.statusText}`
    );
  }

  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    throw new Error("A resposta do proxy não é um XML válido.");
  }

  const getText = (element: Element, tagName: string) =>
    element.getElementsByTagName(tagName)[0]?.textContent?.trim() || null;
  const getFloat = (element: Element, tagName: string) => {
    const text = getText(element, tagName);
    return text ? parseFloat(text) : null;
  };

  const subItemsMap = new Map<string, CupomSubItem[]>();
  Array.from(xmlDoc.getElementsByTagName("cupom_fichatecnica")).forEach(
    (fichaNode) => {
      const coo = getText(fichaNode, "COO");
      const itemNum = getText(fichaNode, "ITEM")?.padStart(3, "0");

      if (coo && itemNum) {
        const key = `${coo}-${itemNum}`;
        if (!subItemsMap.has(key)) {
          subItemsMap.set(key, []);
        }
        subItemsMap.get(key)!.push({
          matnr2: getText(fichaNode, "MATNR2"),
          qte2: getFloat(fichaNode, "QTE2"),
          und2: getText(fichaNode, "UND2"),
        });
      }
    }
  );

  const itemsMap = new Map<string, CupomItem[]>();
  Array.from(xmlDoc.getElementsByTagName("cupom_item")).forEach((itemNode) => {
    const coo = getText(itemNode, "COO");
    const matnr = getText(itemNode, "MATNR");
    const itemNum = getText(itemNode, "ITEM");

    if (coo && matnr) {
      if (!itemsMap.has(coo)) {
        itemsMap.set(coo, []);
      }
      const items = itemsMap.get(coo)!;

      const qte = getFloat(itemNode, "QTE") || 0;
      const total = getFloat(itemNode, "TOTAL") || 0;
      const desconto = getFloat(itemNode, "DESCONTO") || 0;

      const existingItem = items.find((it) => it.matnr === matnr);

      const subItemKey = `${coo}-${itemNum?.padStart(3, "0")}`;
      const itemSubItems = subItemsMap.get(subItemKey);

      if (existingItem && !itemSubItems) {
        existingItem.qte = (existingItem.qte || 0) + qte;
        existingItem.total = (existingItem.total || 0) + total;
        existingItem.desconto = (existingItem.desconto || 0) + desconto;
      } else {
        items.push({
          item: itemNum,
          matnr: matnr,
          matnr2: null,
          preco: getFloat(itemNode, "PRECO"),
          desconto: desconto,
          qte: qte,
          total: total,
          subItems:
            matnr?.startsWith("4000") && itemSubItems?.length
              ? itemSubItems
              : undefined,
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
          autorizacao: getText(finNode, "AUTORIZACAO"),
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
  const cupons: Cupom[] = Array.from(cuponsMap.values()).sort((a, b) => {
    const aNum = a.coo ? parseInt(a.coo, 10) : Number.POSITIVE_INFINITY;
    const bNum = b.coo ? parseInt(b.coo, 10) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
      return (a.coo || "").localeCompare(b.coo || "");
    }
    return aNum - bNum;
  });

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
