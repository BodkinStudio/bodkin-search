import { useEffect, useRef } from "react";
import {
  initJourneyTracker,
  type JourneyTracker,
  type JourneyTrackerOptions,
} from "./tracker";

/** Pass memoized options. Consent is supplied by the site's existing consent adapter. */
export function useJourneyTracker(options: JourneyTrackerOptions) {
  const tracker = useRef<JourneyTracker | null>(null);
  useEffect(() => {
    tracker.current = initJourneyTracker(options);
    return () => {
      tracker.current?.destroy();
      tracker.current = null;
    };
  }, [options]);
  return tracker;
}
