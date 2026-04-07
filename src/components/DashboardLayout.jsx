import { useState, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { routeOverlayVariants, routeTransitionVariants } from '../lib/motion';
import { useDesktopExperience } from '../hooks/useDesktopExperience';
import './DashboardLayout.css';


export const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [backGestureProgress, setBackGestureProgress] = useState(0);
  const [refreshPull, setRefreshPull] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isDesktopExperience = useDesktopExperience();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const scrollRef = useRef(null);
  const touchGestureRef = useRef({
    startX: 0,
    startY: 0,
    mode: null,
    eligible: true,
  });
  const scrollKey = `route_scroll:${location.pathname}${location.search}`;
  const direction = navigationType === 'POP' ? -1 : 1;

  const isNestedScrollable = (target) => {
    if (!(target instanceof Element)) return false;

    let current = target;
    while (current && current !== scrollRef.current) {
      const styles = window.getComputedStyle(current);
      const overflowY = styles.overflowY;
      const canScrollY =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        current.scrollHeight > current.clientHeight + 1;

      if (canScrollY) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  };

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const saved = sessionStorage.getItem(scrollKey);
    node.scrollTop = saved ? Number(saved) || 0 : 0;

    const handleScroll = () => {
      sessionStorage.setItem(scrollKey, String(node.scrollTop));
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      handleScroll();
      node.removeEventListener('scroll', handleScroll);
    };
  }, [scrollKey]);

  const resetGestures = () => {
    setBackGestureProgress(0);
    setRefreshPull(0);
    touchGestureRef.current.mode = null;
  };

  const handleTouchStart = (event) => {
    if (isDesktopExperience || isRefreshing) return;

    const target = event.target;
    if (
      target instanceof Element &&
      (
        target.closest('input, textarea, select, button, a, [role="button"], [data-disable-shell-gestures]') ||
        isNestedScrollable(target)
      )
    ) {
      touchGestureRef.current.eligible = false;
      return;
    }

    const touch = event.touches[0];
    touchGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      mode: null,
      eligible: true,
    };
  };

  const handleTouchMove = (event) => {
    if (isDesktopExperience || isRefreshing || !touchGestureRef.current.eligible) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchGestureRef.current.startX;
    const deltaY = touch.clientY - touchGestureRef.current.startY;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!touchGestureRef.current.mode) {
      if (absDeltaX < 12 && absDeltaY < 12) {
        return;
      }

      const isHorizontalIntent = absDeltaX > 18 && absDeltaX > absDeltaY * 1.2;
      const isVerticalIntent = absDeltaY > 18 && absDeltaY > absDeltaX * 1.2;
      const isBackSwipe =
        touchGestureRef.current.startX <= 28 &&
        deltaX > 18 &&
        isHorizontalIntent &&
        window.history.length > 1;
      const isPullRefresh =
        touchGestureRef.current.startY <= 180 &&
        scrollTop <= 0 &&
        deltaY > 24 &&
        isVerticalIntent;

      if (isBackSwipe) {
        touchGestureRef.current.mode = 'back';
      } else if (isPullRefresh) {
        touchGestureRef.current.mode = 'refresh';
      } else {
        if (isVerticalIntent || isHorizontalIntent) {
          touchGestureRef.current.mode = 'native-scroll';
        }
        return;
      }
    }

    if (touchGestureRef.current.mode === 'back') {
      event.preventDefault();
      setBackGestureProgress(Math.min(Math.max(deltaX, 0) / 120, 1));
      return;
    }

    if (touchGestureRef.current.mode === 'refresh') {
      event.preventDefault();
      setRefreshPull(Math.min(Math.max(deltaY, 0) * 0.5, 96));
    }
  };

  const triggerRefresh = () => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('app-pull-refresh'));
    window.setTimeout(() => {
      window.location.reload();
    }, 260);
  };

  const handleTouchEnd = () => {
    if (isDesktopExperience) return;

    if (touchGestureRef.current.mode === 'back' && backGestureProgress > 0.55) {
      resetGestures();
      navigate(-1);
      return;
    }

    if (touchGestureRef.current.mode === 'refresh' && refreshPull > 72) {
      triggerRefresh();
      return;
    }

    resetGestures();
  };

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay mobile-only" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="main-content">
        {/* Single unified header — handles both mobile and desktop */}
        <Header 
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
          isSidebarOpen={isSidebarOpen} 
        />
        <main
          className="content-scrollable"
          ref={scrollRef}
          onTouchStart={isDesktopExperience ? undefined : handleTouchStart}
          onTouchMove={isDesktopExperience ? undefined : handleTouchMove}
          onTouchEnd={isDesktopExperience ? undefined : handleTouchEnd}
        >
          {!isDesktopExperience && (
            <>
              <div
                className={`gesture-back-indicator ${backGestureProgress > 0 ? 'is-visible' : ''} ${backGestureProgress > 0.55 ? 'is-armed' : ''}`}
                style={{ '--gesture-progress': backGestureProgress }}
              >
                <ArrowLeft size={18} />
                <span>Go back</span>
              </div>
              <div
                className={`gesture-refresh-indicator ${refreshPull > 0 || isRefreshing ? 'is-visible' : ''} ${refreshPull > 72 ? 'is-armed' : ''} ${isRefreshing ? 'is-refreshing' : ''}`}
                style={{ '--gesture-refresh-offset': `${refreshPull}px` }}
              >
                <RefreshCw size={16} />
                <span>{isRefreshing ? 'Refreshing' : refreshPull > 72 ? 'Release to refresh' : 'Pull to refresh'}</span>
              </div>
            </>
          )}
          {isDesktopExperience ? (
            <Outlet />
          ) : (
            <LayoutGroup id="app-route-transitions">
              <div className="route-transition-stage">
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.div
                    key={location.pathname}
                    className="route-transition-layer"
                    custom={direction}
                    variants={routeTransitionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <motion.div
                      className="route-transition-overlay"
                      custom={direction}
                      variants={routeOverlayVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    />
                    <motion.section
                      className="route-shared-frame"
                      layoutId="route-shared-frame"
                    >
                      <motion.div
                        className="route-shared-frame-glow"
                        layoutId="route-shared-frame-glow"
                      />
                      <div className="route-page-shell">
                        <Outlet />
                      </div>
                    </motion.section>
                  </motion.div>
                </AnimatePresence>
              </div>
            </LayoutGroup>
          )}
        </main>
      </div>
    </div>
  );
};
