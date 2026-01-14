/**
 * Code Monet - Showpiece Homepage
 * An immersive landing experience for the autonomous AI artist
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

interface HomepageProps {
  onEnter: () => void;
}

// Simulated brush strokes that animate like the real agent
interface SimulatedStroke {
  id: number;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  progress: number;
}

// Impressionist palette inspired by Monet
const PALETTE = {
  primary: ['#e94560', '#ff6b6b', '#ff8585'],
  secondary: ['#7b68ee', '#9b8aff', '#b8a9ff'],
  accent: ['#4ecdc4', '#6ee7de', '#8ff4ed'],
  warm: ['#ffd93d', '#ffe566', '#ffed8a'],
  neutral: ['#2d3436', '#636e72', '#b2bec3'],
};

const ALL_COLORS = [...PALETTE.primary, ...PALETTE.secondary, ...PALETTE.accent, ...PALETTE.warm];

// Generate a smooth bezier curve path
function generateArtisticPath(): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const startX = Math.random() * 300 + 50;
  const startY = Math.random() * 200 + 50;

  points.push({ x: startX, y: startY });

  const numPoints = Math.floor(Math.random() * 15) + 10;
  let currentX = startX;
  let currentY = startY;

  for (let i = 0; i < numPoints; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 30 + 10;
    currentX += Math.cos(angle) * distance;
    currentY += Math.sin(angle) * distance;

    // Keep within bounds
    currentX = Math.max(20, Math.min(380, currentX));
    currentY = Math.max(20, Math.min(280, currentY));

    points.push({ x: currentX, y: currentY });
  }

  return points;
}

function pointsToPath(points: { x: number; y: number }[], progress: number): string {
  if (points.length < 2) return '';

  const visiblePoints = Math.ceil(points.length * progress);
  if (visiblePoints < 2) return '';

  const visible = points.slice(0, visiblePoints);

  let d = `M ${visible[0].x} ${visible[0].y}`;

  for (let i = 1; i < visible.length; i++) {
    const prev = visible[i - 1];
    const curr = visible[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
  }

  return d;
}

// Live canvas that simulates the AI drawing
function LiveCanvas(): React.ReactElement {
  const [strokes, setStrokes] = useState<SimulatedStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<SimulatedStroke | null>(null);
  const strokeIdRef = useRef(0);
  const animationRef = useRef<number>();

  const createNewStroke = useCallback((): void => {
    const newStroke: SimulatedStroke = {
      id: strokeIdRef.current++,
      points: generateArtisticPath(),
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      width: Math.random() * 6 + 2,
      progress: 0,
    };
    setCurrentStroke(newStroke);
  }, []);

  useEffect(() => {
    createNewStroke();

    const animate = (): void => {
      setCurrentStroke((prev) => {
        if (!prev) return prev;

        const newProgress = prev.progress + 0.02;

        if (newProgress >= 1) {
          // Stroke complete, add to finished strokes
          setStrokes((s) => [...s.slice(-15), { ...prev, progress: 1 }]);

          // Start a new stroke after a brief pause
          setTimeout(createNewStroke, 500 + Math.random() * 1000);
          return null;
        }

        return { ...prev, progress: newProgress };
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [createNewStroke]);

  return (
    <svg viewBox="0 0 400 300" className="live-canvas-svg">
      <defs>
        <filter id="pencilTexture">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
        </filter>
      </defs>

      {/* Paper texture background */}
      <rect width="400" height="300" fill="#fefefe" />

      {/* Completed strokes */}
      {strokes.map((stroke) => (
        <path
          key={stroke.id}
          d={pointsToPath(stroke.points, stroke.progress)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
          filter="url(#pencilTexture)"
        />
      ))}

      {/* Current stroke being drawn */}
      {currentStroke && (
        <path
          d={pointsToPath(currentStroke.points, currentStroke.progress)}
          fill="none"
          stroke={currentStroke.color}
          strokeWidth={currentStroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#pencilTexture)"
        />
      )}

      {/* Pen cursor */}
      {currentStroke && currentStroke.progress > 0 && (
        <g
          transform={`translate(${currentStroke.points[Math.floor(currentStroke.points.length * currentStroke.progress)]?.x || 0}, ${currentStroke.points[Math.floor(currentStroke.points.length * currentStroke.progress)]?.y || 0})`}
        >
          <circle r="4" fill={currentStroke.color} opacity="0.8">
            <animate attributeName="r" values="4;6;4" dur="0.5s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  );
}

// Streaming thought bubble
const ARTIST_THOUGHTS = [
  'Contemplating the interplay of light and shadow...',
  'A sweeping curve here might create tension...',
  'The warmth of golden tones calls for balance...',
  'This composition needs breathing room...',
  'Let the colors dance together...',
  'Finding harmony in chaos...',
  'Each stroke tells part of the story...',
  'The negative space speaks too...',
];

function ThoughtStream(): React.ReactElement {
  const [displayedText, setDisplayedText] = useState('');
  const [thoughtIndex, setThoughtIndex] = useState(0);

  useEffect(() => {
    const thought = ARTIST_THOUGHTS[thoughtIndex % ARTIST_THOUGHTS.length];
    setDisplayedText('');

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < thought.length) {
        setDisplayedText(thought.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setThoughtIndex((i) => i + 1);
        }, 2000);
      }
    }, 50);

    return (): void => clearInterval(typeInterval);
  }, [thoughtIndex]);

  return (
    <div className="thought-stream">
      <div className="thought-label">
        <span className="thought-dot" />
        thinking
      </div>
      <p className="thought-text">
        {displayedText}
        <span className="cursor" />
      </p>
    </div>
  );
}

// Floating paint splatter
function PaintSplatter({
  delay,
  size,
  color,
  x,
  y,
}: {
  delay: number;
  size: number;
  color: string;
  x: number;
  y: number;
}): React.ReactElement {
  return (
    <div
      className="paint-splatter"
      style={{
        width: size,
        height: size,
        left: `${x}%`,
        top: `${y}%`,
        backgroundColor: color,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// Gallery preview item
function GalleryItem({
  index,
  delay,
}: {
  index: number;
  delay: number;
}): React.ReactElement {
  // Generate unique "artwork" for each gallery item
  const strokes = useRef(
    Array.from({ length: 8 }, () => ({
      d: `M ${20 + Math.random() * 60} ${20 + Math.random() * 60} Q ${Math.random() * 100} ${Math.random() * 100}, ${40 + Math.random() * 60} ${40 + Math.random() * 60}`,
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      width: Math.random() * 4 + 2,
    }))
  ).current;

  return (
    <div className="gallery-item" style={{ animationDelay: `${delay}s` }}>
      <div className="gallery-frame">
        <svg viewBox="0 0 100 100" className="gallery-artwork">
          <rect width="100" height="100" fill="#fafafa" />
          {strokes.map((stroke, i) => (
            <path
              key={i}
              d={stroke.d}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              opacity={0.8}
            />
          ))}
        </svg>
      </div>
      <span className="gallery-label">Piece #{String(index + 1).padStart(4, '0')}</span>
    </div>
  );
}

export function Homepage({ onEnter }: HomepageProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setMounted(true);

    const handleScroll = (): void => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return (): void => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Generate splatters once
  const splatters = useRef(
    Array.from({ length: 20 }, () => ({
      delay: Math.random() * 5,
      size: Math.random() * 30 + 10,
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
    }))
  ).current;

  return (
    <div className={`homepage ${mounted ? 'mounted' : ''}`}>
      {/* Ambient paint splatters */}
      <div className="splatters-container">
        {splatters.map((s, i) => (
          <PaintSplatter key={i} {...s} />
        ))}
      </div>

      {/* Hero section - full viewport */}
      <section className="hero-section">
        <div className="hero-background">
          <div
            className="gradient-orb orb-1"
            style={{ transform: `translate(${scrollY * 0.1}px, ${scrollY * 0.05}px)` }}
          />
          <div
            className="gradient-orb orb-2"
            style={{ transform: `translate(${-scrollY * 0.08}px, ${scrollY * 0.1}px)` }}
          />
          <div
            className="gradient-orb orb-3"
            style={{ transform: `translate(${scrollY * 0.05}px, ${-scrollY * 0.08}px)` }}
          />
        </div>

        <div className="hero-content">
          <div className="hero-text">
            <div className="title-container">
              <span className="title-prefix">Introducing</span>
              <h1 className="hero-title">
                <span className="title-word code">Code</span>
                <span className="title-word monet">Monet</span>
              </h1>
            </div>

            <p className="hero-tagline">An autonomous AI artist</p>

            <p className="hero-description">
              Watch artificial intelligence create original artwork in real-time. No prompts. No
              guidance. Just pure, autonomous creativity — stroke by stroke, thought by thought.
            </p>

            <div className="cta-container">
              <button className="cta-primary" onClick={onEnter}>
                <span>Enter the Studio</span>
                <svg className="cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <a href="#watch" className="cta-secondary">
                Watch it paint
              </a>
            </div>
          </div>

          <div className="hero-canvas">
            <div className="canvas-window">
              <div className="window-header">
                <div className="window-dots">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <span className="window-title">code-monet — creating</span>
              </div>
              <div className="canvas-body">
                <LiveCanvas />
              </div>
            </div>
            <ThoughtStream />
          </div>
        </div>

        <div className="scroll-indicator">
          <span>Scroll to explore</span>
          <div className="scroll-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 5v14M5 12l7 7 7-7" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section" id="watch">
        <div className="section-content">
          <h2 className="section-title">
            <span className="title-accent" />
            How It Works
          </h2>

          <div className="process-steps">
            <div className="process-step">
              <div className="step-number">01</div>
              <h3>Observe</h3>
              <p>
                The AI examines its canvas, understanding what exists and imagining what could be.
              </p>
            </div>

            <div className="process-step">
              <div className="step-number">02</div>
              <h3>Contemplate</h3>
              <p>
                It reasons about composition, color theory, and emotional resonance — sharing its
                thoughts in real-time.
              </p>
            </div>

            <div className="process-step">
              <div className="step-number">03</div>
              <h3>Create</h3>
              <p>
                With intention behind every movement, it writes code that becomes brushstrokes on
                canvas.
              </p>
            </div>

            <div className="process-step">
              <div className="step-number">04</div>
              <h3>Evolve</h3>
              <p>
                Each piece informs the next. The artist grows, develops preferences, refines its
                style.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery preview */}
      <section className="gallery-section">
        <div className="section-content">
          <h2 className="section-title">
            <span className="title-accent" />
            From the Gallery
          </h2>
          <p className="section-subtitle">A glimpse into the ever-growing collection</p>

          <div className="gallery-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <GalleryItem key={i} index={i} delay={i * 0.15} />
            ))}
          </div>

          <button className="gallery-cta" onClick={onEnter}>
            View the live studio
          </button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-section">
        <div className="final-content">
          <h2>Ready to witness creativity unfold?</h2>
          <button className="cta-final" onClick={onEnter}>
            <span>Enter the Studio</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="homepage-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <svg className="footer-logo" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M 12 28 Q 20 10, 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Code Monet</span>
          </div>
          <p className="footer-credits">
            Built with Claude by{' '}
            <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer">
              Anthropic
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
