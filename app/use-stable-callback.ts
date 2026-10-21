import {useCallback, useLayoutEffect, useRef} from 'react';
// Event handlers see the latest committed state without changing memoised child props.
export function useStableCallback<Args extends unknown[],Result>(callback:(...args:Args)=>Result){
  const latest=useRef(callback);
  useLayoutEffect(()=>{latest.current=callback;});
  return useCallback((...args:Args)=>latest.current(...args),[]);
}
