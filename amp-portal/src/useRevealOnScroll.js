import { useEffect } from "react";

/**
 * Reveals `[data-fade]` elements as they scroll into view.
 *
 * Replaces a copy of the same IntersectionObserver in seven components, all of
 * which shared a failure mode worth naming: `[data-fade]` starts at
 * `opacity: 0`, so anything the observer misses stays *permanently invisible*
 * rather than merely un-animated. That happens when an element passes from
 * below the viewport to above it without a rendered frame in between —
 * restoring a scrolled position on reload, following an in-page anchor, or any
 * programmatic jump. A whole section of the homepage reproduced this.
 *
 * Three things make it self-healing:
 *   - elements already on screen are revealed synchronously on mount;
 *   - anything that ends up above the fold is revealed on scroll, whether or
 *     not the observer fired for it;
 *   - a final timer reveals everything regardless, so no content can be
 *     stranded invisible by a missed callback or an unsupported API.
 */
export default function useRevealOnScroll(threshold = 0.1) {
  useEffect(() => {
    const reveal = (el) => el.classList.add("visible");
    const els = () => document.querySelectorAll("[data-fade]:not(.visible)");

    // Anything already in view (or scrolled past) should not wait for a callback.
    const revealInView = () => {
      els().forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
        else if (r.bottom <= 0) reveal(el); // scrolled past — never animate in behind the user
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll("[data-fade]").forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            reveal(e.target);
            observer.unobserve(e.target);
          }
        }),
      { threshold }
    );
    document.querySelectorAll("[data-fade]").forEach((el) => observer.observe(el));

    revealInView();
    window.addEventListener("scroll", revealInView, { passive: true });

    // Last resort: never leave content stranded at opacity 0.
    const failsafe = setTimeout(() => {
      document.querySelectorAll("[data-fade]").forEach(reveal);
    }, 2000);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", revealInView);
      clearTimeout(failsafe);
    };
  }, [threshold]);
}
