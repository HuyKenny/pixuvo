/**
 * Category and UI icons: Microsoft Fluent Emoji 3D (MIT License, github.com/microsoft/fluentui-emoji),
 * resized to 96 px WebP by scripts/fetch-category-icons.mjs.
 */
const AVAILABLE = new Set(["2-player", "2048", "action", "adventure", "arcade", "archery", "basketball", "block", "board", "bubble-shooter", "building", "bus", "car", "card", "casual", "chess", "clicker", "coloring", "cooking", "cooperative", "dress-up", "drift", "driving", "educational", "escape", "farming", "fighting", "first-person-shooter", "football", "golf", "hidden-object", "horror", "idle", "io", "jigsaw", "mahjong", "match-3", "math", "maze", "memory", "motorcycle", "multiplayer", "music", "ninja", "parking", "platformer", "pool", "puzzle", "quiz", "racing", "retro", "runner", "shooting", "simulation", "snake", "sniper", "solitaire", "sports", "strategy", "tank", "tower-defense", "truck", "tycoon", "ui-clock", "ui-cloud", "ui-controller", "ui-grid", "ui-heart", "ui-lightning", "ui-new", "ui-popular", "ui-sparkles", "ui-star", "ui-trophy", "ui-two", "word", "zombie"]);

export function categoryIcon(slug: string): string {
  return AVAILABLE.has(slug) ? `/icons/cat/${slug}.webp` : '/icons/cat/ui-controller.webp';
}

export function uiIcon(name: 'new' | 'popular' | 'trophy' | 'star' | 'heart' | 'controller' | 'lightning' | 'cloud' | 'grid' | 'clock' | 'sparkles' | 'two'): string {
  return `/icons/cat/ui-${name}.webp`;
}
