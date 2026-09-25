import { useEffect } from "react";

/**
 * Calls `forget` when the page is hidden (the screen locks, the person switches app) and
 * when it is restored from the back-forward cache (021 *Phone-first*, AC-36). A phone put
 * down mid-PIN and picked up by someone else then shows empty PIN fields.
 */
export function useForgetOnHide(forget: () => void): void {
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") forget();
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) forget();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [forget]);
}
