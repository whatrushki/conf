import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Мягкие Discord-подобные цвета аватаров */
const AVATAR_PALETTE = [
  '#6d8390', '#7a8f6e', '#8f7a6e', '#7a6e8f',
  '#6e8f8a', '#8f8a6e', '#6e7a8f', '#8f6e7a',
  '#708f7d', '#8f7070', '#70708f', '#8f7d70',
];

export function avatarColorForId(id: string): string {
  let hash = 0;
  const s = id || 'x';
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
