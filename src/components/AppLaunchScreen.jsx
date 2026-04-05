import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBranding } from '../hooks/useBranding';
import orderflowLogo from '../assets/orderflow-logo.png';
import { MOTION_EASE } from '../lib/motion';
import './AppLaunchScreen.css';

const launchCopyVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: MOTION_EASE.standard, delay: 0.2 },
  },
};

const logoVariants = {
  hidden: { opacity: 0, scale: 0.82, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.52, ease: MOTION_EASE.standard, delay: 0.28 },
  },
};

export const AppLaunchScreen = ({ isVisible, onComplete }) => {
  const { appName } = useBranding();

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onComplete?.();
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          className="app-launch-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.34, ease: MOTION_EASE.standard } }}
          exit={{
            opacity: 0,
            filter: 'blur(12px)',
            transition: { duration: 0.34, ease: MOTION_EASE.standard },
          }}
        >
          <motion.div
            className="app-launch-backdrop"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.6, ease: MOTION_EASE.standard },
            }}
            exit={{
              opacity: 0,
              scale: 1.02,
              transition: { duration: 0.3, ease: MOTION_EASE.standard },
            }}
          />

          <div className="app-launch-orb app-launch-orb-left" />
          <div className="app-launch-orb app-launch-orb-right" />

          <motion.div
            className="app-launch-content"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
          >
            <motion.div
              className="app-launch-logo-shell motion-soft-glow-pulse"
              variants={logoVariants}
            >
              <img
                src={orderflowLogo}
                alt={`${appName} logo`}
                className="app-launch-logo"
              />
            </motion.div>

            <motion.div className="app-launch-copy" variants={launchCopyVariants}>
              <span className="app-launch-kicker">Premium workspace</span>
              <h1>{appName}</h1>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
