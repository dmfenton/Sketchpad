/**
 * Code Monet - Marketing Homepage
 * An artistic landing page for the autonomous AI artist
 */

import React, { useEffect, useState } from 'react';

interface HomepageProps {
  onEnter: () => void;
}

// Animated brush stroke paths - each one draws itself
const BRUSH_STROKES = [
  // Sweeping curves across the canvas
  'M 50 300 Q 200 100, 400 250 T 750 200',
  'M 100 500 Q 300 350, 500 450 T 900 400',
  'M 0 200 Q 150 50, 350 150 T 600 100',
  'M 200 600 Q 400 400, 600 500 T 1000 450',
  'M 80 400 Q 250 250, 450 350 T 800 300',
];

// Colors from impressionist palette
const STROKE_COLORS = [
  '#e94560', // Rose
  '#7b68ee', // Violet
  '#4ecdc4', // Teal
  '#ffd93d', // Golden
  '#ff6b6b', // Coral
];

function AnimatedStroke({
  d,
  color,
  delay,
  duration = 3
}: {
  d: string;
  color: string;
  delay: number;
  duration?: number;
}): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay * 1000);
    return (): void => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={Math.random() * 20 + 10}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.3}
      style={{
        strokeDasharray: 2000,
        strokeDashoffset: 2000,
        animation: `drawStroke ${duration}s ease-out forwards`,
      }}
    />
  );
}

function FloatingParticle({ delay }: { delay: number }): React.ReactElement {
  const size = Math.random() * 8 + 4;
  const startX = Math.random() * 100;
  const color = STROKE_COLORS[Math.floor(Math.random() * STROKE_COLORS.length)];

  return (
    <div
      className="floating-particle"
      style={{
        width: size,
        height: size,
        left: `${startX}%`,
        backgroundColor: color,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

export function Homepage({ onEnter }: HomepageProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className={`homepage ${mounted ? 'mounted' : ''}`}>
      {/* Animated background canvas */}
      <div className="homepage-canvas">
        <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice">
          {/* Background wash */}
          <defs>
            <radialGradient id="glow1" cx="30%" cy="30%" r="50%">
              <stop offset="0%" stopColor="#e94560" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="glow2" cx="70%" cy="60%" r="50%">
              <stop offset="0%" stopColor="#7b68ee" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="glow3" cx="50%" cy="80%" r="40%">
              <stop offset="0%" stopColor="#4ecdc4" stopOpacity="0.1" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Glowing orbs */}
          <circle cx="300" cy="200" r="300" fill="url(#glow1)" />
          <circle cx="700" cy="400" r="350" fill="url(#glow2)" />
          <circle cx="500" cy="600" r="250" fill="url(#glow3)" />

          {/* Animated brush strokes */}
          {BRUSH_STROKES.map((d, i) => (
            <AnimatedStroke
              key={i}
              d={d}
              color={STROKE_COLORS[i]}
              delay={i * 0.5 + 0.5}
              duration={2.5 + Math.random()}
            />
          ))}
        </svg>
      </div>

      {/* Floating particles */}
      <div className="particles-container">
        {Array.from({ length: 15 }).map((_, i) => (
          <FloatingParticle key={i} delay={i * 0.3} />
        ))}
      </div>

      {/* Main content */}
      <div className="homepage-content">
        <header className="homepage-header">
          <div className="logo-mark">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M 12 28 Q 20 10, 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </header>

        <main className="hero">
          <div className="hero-text">
            <h1 className="hero-title">
              <span className="title-line title-line-1">Code</span>
              <span className="title-line title-line-2">Monet</span>
            </h1>

            <p className="hero-subtitle">
              An autonomous AI artist, painting in real-time
            </p>

            <p className="hero-description">
              Watch as artificial intelligence creates original artwork,
              stroke by stroke. Each piece emerges from a continuous
              stream of creative consciousness.
            </p>

            <button className="enter-button" onClick={onEnter}>
              <span className="button-text">Enter the Studio</span>
              <span className="button-arrow">→</span>
            </button>
          </div>

          <div className="hero-visual">
            <div className="canvas-preview">
              <div className="preview-frame">
                <svg viewBox="0 0 400 300" className="preview-canvas">
                  {/* Mini animated artwork */}
                  <rect width="400" height="300" fill="#fafafa" />

                  {/* Decorative strokes */}
                  <path
                    d="M 50 150 Q 100 50, 200 120 T 350 100"
                    fill="none"
                    stroke="#e94560"
                    strokeWidth="8"
                    strokeLinecap="round"
                    opacity="0.8"
                    className="preview-stroke stroke-1"
                  />
                  <path
                    d="M 30 200 Q 150 150, 250 200 T 380 180"
                    fill="none"
                    stroke="#7b68ee"
                    strokeWidth="6"
                    strokeLinecap="round"
                    opacity="0.7"
                    className="preview-stroke stroke-2"
                  />
                  <path
                    d="M 80 250 Q 180 200, 280 240 T 370 230"
                    fill="none"
                    stroke="#4ecdc4"
                    strokeWidth="5"
                    strokeLinecap="round"
                    opacity="0.6"
                    className="preview-stroke stroke-3"
                  />
                </svg>

                <div className="preview-status">
                  <span className="status-dot" />
                  <span className="status-text">Creating...</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <section className="features">
          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h3>Autonomous Creation</h3>
            <p>No prompts needed. The AI decides what to paint, drawing from an endless well of inspiration.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Real-Time Strokes</h3>
            <p>Watch every brushstroke as it happens. See the artwork emerge in continuous motion.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <h3>Inner Monologue</h3>
            <p>Read the artist&apos;s thoughts as they paint. Understand the creative decisions being made.</p>
          </div>
        </section>

        <footer className="homepage-footer">
          <p>Built with Claude &middot; Anthropic</p>
        </footer>
      </div>
    </div>
  );
}
