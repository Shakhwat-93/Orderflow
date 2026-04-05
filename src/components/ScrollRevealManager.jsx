import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const REVEAL_SELECTOR = [
  '[data-scroll-reveal]',
  '.card',
  '.glass-card',
  '.vibrant-metric-card',
].join(', ');

export const ScrollRevealManager = () => {
  const location = useLocation();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('is-scroll-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    const observeTargets = (root = document) => {
      root.querySelectorAll(REVEAL_SELECTOR).forEach((element, index) => {
        if (element.classList.contains('is-scroll-visible')) return;
        if (element.closest('.modal-content, .global-search-modal')) {
          element.classList.add('is-scroll-visible');
          return;
        }

        if (!element.style.getPropertyValue('--scroll-reveal-delay')) {
          element.style.setProperty('--scroll-reveal-delay', `${Math.min(index * 28, 180)}ms`);
        }

        observer.observe(element);
      });
    };

    observeTargets();

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          if (node.matches?.(REVEAL_SELECTOR)) {
            observeTargets(node.parentElement ?? document);
            return;
          }

          if (node.querySelector?.(REVEAL_SELECTOR)) {
            observeTargets(node);
          }
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [location.pathname, location.search]);

  return null;
};
