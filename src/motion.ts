export const MOTION = {
  press: {
    type: 'spring',
    stiffness: 720,
    damping: 44,
    mass: 0.55,
  },
  nav: {
    type: 'spring',
    stiffness: 520,
    damping: 38,
    mass: 0.7,
  },
  placement: {
    type: 'spring',
    stiffness: 380,
    damping: 27,
    mass: 0.72,
  },
  sheet: {
    type: 'spring',
    stiffness: 360,
    damping: 34,
    mass: 0.82,
  },
  tools: {
    type: 'spring',
    stiffness: 510,
    damping: 36,
    mass: 0.65,
  },
} as const;

export const CONTENT_FADE = {
  duration: 0.12,
  ease: [0.22, 1, 0.36, 1],
} as const;

export const LOCAL_FADE = {
  duration: 0.16,
  ease: [0.16, 1, 0.3, 1],
} as const;
