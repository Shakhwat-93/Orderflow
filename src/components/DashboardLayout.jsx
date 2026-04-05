import { useState, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { routeOverlayVariants, routeTransitionVariants } from '../lib/motion';
import './DashboardLayout.css';


export const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollRef = useRef(null);
  const scrollKey = `route_scroll:${location.pathname}${location.search}`;
  const direction = navigationType === 'POP' ? -1 : 1;

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
        <main className="content-scrollable" ref={scrollRef}>
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
                    <Outlet />
                  </motion.section>
                </motion.div>
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </main>
      </div>
    </div>
  );
};
