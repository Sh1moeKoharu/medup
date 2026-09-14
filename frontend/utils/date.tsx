export const formatDate = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;

  return date.toLocaleDateString('es-MX', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};
