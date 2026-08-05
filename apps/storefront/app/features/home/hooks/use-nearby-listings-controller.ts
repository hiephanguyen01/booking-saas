import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { NearbyPublicListing } from '@booking/contracts';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import type { NearbyRouteResult } from '~/features/home/server/nearby-route.server';

type LocationState =
  'checking' | 'prompt' | 'locating' | 'ready' | 'denied' | 'unsupported' | 'error';

export function useNearbyListingsController(listingTypeSlug: string) {
  const locale = useLocale();
  const fetcher = useFetcher<NearbyRouteResult>();
  const submit = fetcher.submit;
  const cache = useRef(new Map<string, NearbyPublicListing[]>());
  const [locationState, setLocationState] = useState<LocationState>('checking');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationState('unsupported');
      return;
    }
    setLocationState('locating');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: Number(coords.latitude.toFixed(4)),
          longitude: Number(coords.longitude.toFixed(4)),
        });
        setLocationState('ready');
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationState('unsupported');
      return;
    }
    if (!navigator.permissions) {
      setLocationState('prompt');
      return;
    }
    let active = true;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (!active) return;
        if (permission.state === 'granted') requestLocation();
        else setLocationState(permission.state === 'denied' ? 'denied' : 'prompt');
      })
      .catch(() => {
        if (active) setLocationState('prompt');
      });
    return () => {
      active = false;
    };
  }, [requestLocation]);

  useEffect(() => {
    if (!coordinates || !listingTypeSlug || cache.current.has(listingTypeSlug)) return;
    void submit(
      { type: listingTypeSlug, ...coordinates },
      {
        method: 'post',
        action: storefrontPaths.nearby(locale),
        encType: 'application/json',
      },
    );
  }, [coordinates, listingTypeSlug, locale, submit]);

  useEffect(() => {
    if (fetcher.data?.error === null && fetcher.data.type) {
      cache.current.set(fetcher.data.type, fetcher.data.items);
    }
  }, [fetcher.data]);

  const currentResponse = fetcher.data?.type === listingTypeSlug ? fetcher.data : null;
  const items = currentResponse?.items ?? cache.current.get(listingTypeSlug) ?? [];
  const loading =
    locationState === 'checking' ||
    locationState === 'locating' ||
    (locationState === 'ready' && !cache.current.has(listingTypeSlug) && fetcher.state !== 'idle');

  return {
    items,
    loading,
    locationState,
    requestLocation,
    requestFailed: Boolean(currentResponse?.error),
  };
}
