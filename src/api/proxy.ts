import type { VercelRequest, VercelResponse } from "@vercel/node";

const API_URL = "http://38.0.0.57/TmConsultoria/VarejoFacil.asmx";
const SOAP_ACTION = "http://tempuri.org/ConsultaEcf";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const { dataInicial, dataFinal, estabelecimento } = request.body;

    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:ConsultaEcf>
            <tem:ConsultaEcfRequest>
              <tem:dataInicial>${dataInicial}</tem:dataInicial>
              <tem:dataFinal>${dataFinal}</tem:dataFinal>
              <tem:estabelecimento>${estabelecimento}</tem:estabelecimento>
            </tem:ConsultaEcfRequest>
          </tem:ConsultaEcf>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const apiRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: SOAP_ACTION,
      },
      body: soapRequest,
    });

    if (!apiRes.ok) {
      return response.status(apiRes.status).send(await apiRes.text());
    }

    const xmlText = await apiRes.text();

    response.setHeader("Content-Type", "text/xml");
    response.status(200).send(xmlText);
  } catch (error: any) {
    response
      .status(500)
      .json({ message: "Erro no servidor proxy.", error: error.message });
  }
}
