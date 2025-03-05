export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const toCamelCase = (str: string): string => {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
};

export const toKebabCase = (str: string): string => {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
};

export const toPascalCase = (str: string): string => {
  return str
    .replace(/(\w)(\w*)/g, (_, g1, g2) => g1.toUpperCase() + g2.toLowerCase())
    .replace(/-/g, "");
};

export const formatThousands = (value: number) => {
  if (value < 1000) {
    return value.toString();
  }
  if (value < 1000000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  if (value < 1000000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  return `${(value / 1000000000).toFixed(2)}B`;
};
