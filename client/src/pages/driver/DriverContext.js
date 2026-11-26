import { createContext, useContext } from 'react';

// Shared by the driver tabs: the assigned vehicle and route, live GPS
// state (sharing runs in the layout, so it continues across tabs) and
// helpers to open the delay / emergency dialogs.
export const DriverContext = createContext(null);

export function useDriver() {
  return useContext(DriverContext);
}
