'use client';

import { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type AddressResult = {
  formattedAddress: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  city?: string;
  state?: string;
  postalCode?: string;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
};

export function AddressAutocomplete({ value, onChange, onSelect, placeholder = 'Enter address...', className, id }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current!, {
      types: ['address'],
    });
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.formatted_address) return;

      const components = place.address_components || [];
      const get = (type: string) =>
        components.find((c: any) => c.types.includes(type))?.long_name || '';
      const getShort = (type: string) =>
        components.find((c: any) => c.types.includes(type))?.short_name || '';

      const result: AddressResult = {
        formattedAddress: place.formatted_address,
        placeId: place.place_id,
        lat: place.geometry?.location?.lat(),
        lng: place.geometry?.location?.lng(),
        city: get('locality') || get('sublocality'),
        state: getShort('administrative_area_level_1'),
        postalCode: get('postal_code'),
      };
      onChange(place.formatted_address);
      onSelect(result);
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [onChange, onSelect]);

  return (
    <Input
      ref={inputRef}
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('', className)}
      autoComplete="off"
    />
  );
}
