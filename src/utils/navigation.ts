/**
 * Utility for generating navigation links for Yandex and Google Maps.
 * It parses the address string to detect coordinates and uses them for more accurate navigation.
 */

export interface NavLink {
  name: string;
  url: string;
  fallback: string;
}

export function getNavLinks(address: string): NavLink[] {
  if (!address) return [];

  // Regex to find coordinates like (53.8425, 27.5794) or just 53.8425, 27.5794
  const coordRegex = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/;
  const match = address.match(coordRegex);

  let lat: string | null = null;
  let lng: string | null = null;

  if (match) {
    lat = match[1];
    lng = match[2];
  }

  const encodedAddress = encodeURIComponent(address);

  // Yandex Maps URL:
  // If coordinates found, use 'pt' (point) which is more accurate for exact locations.
  // Note: Yandex pt is lng,lat
  const yandexUrl = lat && lng 
    ? `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16&l=map`
    : `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`;
  
  const yandexFallback = lat && lng
    ? `https://yandex.ru/maps/?pt=${lng},${lat}&z=16&l=map`
    : `https://yandex.ru/maps/?text=${encodedAddress}`;

  // Google Maps URL:
  // Using destination parameter for pinpoint accuracy and immediate navigation readiness.
  const googleUrl = lat && lng
    ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
    : `comgooglemaps://?q=${encodedAddress}`;
  
  const googleFallback = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  return [
    { name: 'Яндекс Карты', url: yandexUrl, fallback: yandexFallback },
    { name: 'Google Maps', url: googleUrl, fallback: googleFallback }
  ];
}
