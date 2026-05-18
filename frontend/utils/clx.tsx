import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const clx = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};
