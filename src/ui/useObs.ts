import { useEffect, useState } from 'react';
import { obs, type ObsState } from '../domain/obs';

export function useObs(): ObsState {
  const [s, setS] = useState(obs.state);
  useEffect(() => obs.subscribe(setS), []);
  return s;
}
