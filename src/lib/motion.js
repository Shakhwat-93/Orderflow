export const MOTION_DURATION = Object.freeze({
  fast: 0.2,
  page: 0.36,
  pulse: 2.4,
});

export const MOTION_EASE = Object.freeze({
  standard: [0.4, 0, 0.2, 1],
});

export const motionTransition = Object.freeze({
  fast: {
    duration: MOTION_DURATION.fast,
    ease: MOTION_EASE.standard,
  },
  page: {
    duration: MOTION_DURATION.page,
    ease: MOTION_EASE.standard,
  },
  layout: {
    duration: 0.24,
    ease: MOTION_EASE.standard,
  },
});

export const routeTransitionVariants = Object.freeze({
  initial: (direction = 1) => ({
    opacity: 0,
    x: direction > 0 ? 52 : -52,
    scale: 0.985,
    filter: 'blur(8px)',
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.38,
      ease: MOTION_EASE.standard,
    },
  },
  exit: (direction = 1) => ({
    opacity: 0,
    x: direction > 0 ? -36 : 36,
    scale: 0.992,
    filter: 'blur(6px)',
    transition: {
      duration: 0.3,
      ease: MOTION_EASE.standard,
    },
  }),
});

export const routeOverlayVariants = Object.freeze({
  initial: (direction = 1) => ({
    opacity: 0,
    x: direction > 0 ? '18%' : '-18%',
  }),
  animate: {
    opacity: 0.18,
    x: '0%',
    transition: {
      duration: 0.22,
      ease: MOTION_EASE.standard,
    },
  },
  exit: (direction = 1) => ({
    opacity: 0,
    x: direction > 0 ? '-14%' : '14%',
    transition: {
      duration: 0.22,
      ease: MOTION_EASE.standard,
    },
  }),
});

export const fadeInVariants = Object.freeze({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: motionTransition.fast,
  },
  exit: {
    opacity: 0,
    transition: motionTransition.fast,
  },
});

export const slideUpVariants = Object.freeze({
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransition.page,
  },
  exit: {
    opacity: 0,
    y: 12,
    transition: motionTransition.fast,
  },
});

export const scaleInVariants = Object.freeze({
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: motionTransition.fast,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: motionTransition.fast,
  },
});

export const pageVariants = Object.freeze({
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransition.page,
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: motionTransition.fast,
  },
});

export const listItemVariants = Object.freeze({
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransition.fast,
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: motionTransition.fast,
  },
});

export const scaleItemVariants = Object.freeze({
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: motionTransition.fast,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: motionTransition.fast,
  },
});

export const createStaggerContainer = (staggerChildren = 0.06, delayChildren = 0.04) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      ...motionTransition.page,
      staggerChildren,
      delayChildren,
    },
  },
});

export const hoverLift = Object.freeze({
  y: 0,
  transition: {
    duration: 0.12,
    ease: MOTION_EASE.standard,
  },
});

export const tapScale = Object.freeze({
  scale: 0.98,
  transition: motionTransition.fast,
});
