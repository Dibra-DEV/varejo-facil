export const formatDate = (dateStr: string | null) => {
  if (!dateStr || dateStr.length !== 8) return "N/A";
  return `${dateStr.substring(6, 8)}/${dateStr.substring(
    4,
    6
  )}/${dateStr.substring(0, 4)}`;
};

export const formatCurrency = (value: number | null) => {
  if (value === null || isNaN(value as unknown as number)) return "0,00";
  return Number(value).toFixed(2).replace(".", ",");
};
