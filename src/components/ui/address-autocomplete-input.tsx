'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

declare global {
  interface Window {
    google: any;
    __googleMapsScriptLoading?: Promise<void>;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const SCRIPT_ID = 'google-maps-places-script';

/** Loads the Google Maps Places JS SDK exactly once, however many inputs request it. */
function loadGoogleMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (!MAPS_API_KEY) return Promise.resolve();
  if (window.__googleMapsScriptLoading) return window.__googleMapsScriptLoading;

  window.__googleMapsScriptLoading = new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      if (window.google?.maps?.places) resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return window.__googleMapsScriptLoading;
}

type AddressAutocompleteInputProps = Omit<React.ComponentProps<typeof Input>, 'onChange'> & {
  /** Controlled mode. Omit (with defaultValue/name) for uncontrolled/FormData-based forms. */
  onChange?: (value: string) => void;
  /** Restrict suggestions to a place type set. Defaults to full addresses. */
  types?: string[];
};

/**
 * Drop-in replacement for <Input> on any location/address field. Attaches a
 * Google Places dropdown autocomplete once the Maps script loads; typing
 * still works normally if the API key is missing or the script fails to
 * load — it degrades to a plain text field.
 *
 * Works both controlled (value + onChange) and uncontrolled (defaultValue +
 * name, read via FormData on submit) — Google's widget mutates the
 * underlying DOM input directly, so an uncontrolled field picks up a
 * selected place with no extra wiring.
 */
export const AddressAutocompleteInput = React.forwardRef<HTMLInputElement, AddressAutocompleteInputProps>(
  ({ onChange, types = ['address'], ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;

    React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    React.useEffect(() => {
      let autocomplete: any;
      let cancelled = false;

      loadGoogleMapsScript().then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;
        try {
          autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: 'us' },
            fields: ['formatted_address'],
            types,
          });
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place?.formatted_address) onChangeRef.current?.(place.formatted_address);
          });
        } catch {
          // Places restricted/unavailable — field still works as plain text.
        }
      });

      return () => {
        cancelled = true;
        if (autocomplete && window.google?.maps?.event) {
          window.google.maps.event.clearInstanceListeners(autocomplete);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <Input
        ref={inputRef}
        onChange={onChange ? (e => onChange(e.target.value)) : undefined}
        autoComplete="off"
        {...props}
      />
    );
  },
);
AddressAutocompleteInput.displayName = 'AddressAutocompleteInput';
