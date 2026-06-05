export function formatPrice(price) {
  const str = typeof price === "number" ? price.toString() : price;
  const num = parseFloat(str);
  if (!str || Number.isNaN(num)) return "N/A";
  if (num === 0) return "Free";

  const dotIndex = str.indexOf(".");
  let whole;
  let fraction;

  if (dotIndex === -1) {
    whole = str;
    fraction = "";
  } else {
    whole = str.substring(0, dotIndex);
    fraction = str.substring(dotIndex + 1);
  }

  whole = whole.replace(/^0+/, "") || "0";

  if (fraction.length > 6) {
    fraction = fraction.substring(0, 6);
  }

  fraction = fraction.padEnd(2, "0");
  fraction = fraction.replace(/0+$/, "");
  if (fraction.length < 2) {
    fraction = fraction.padEnd(2, "0");
  }

  return `$${whole}.${fraction}`;
}
