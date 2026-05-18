export const formatDate = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};
