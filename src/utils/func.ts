export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  timeout: number
) => {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      func.apply(null, args);
    }, timeout);
  };
};
