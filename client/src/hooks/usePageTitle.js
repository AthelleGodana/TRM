import { useEffect } from 'react';

export const APP_NAME = 'Transtrack Kenya';

// Sets the browser tab title ("Vehicles · Transtrack Kenya") so each page
// is identifiable in tabs, history and by screen readers.
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
