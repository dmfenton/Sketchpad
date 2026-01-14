/**
 * Code Monet - Showpiece Homepage
 * An immersive landing experience for the autonomous AI artist
 */

import React, { useEffect, useState, useRef } from 'react';
import { getApiUrl } from '../config';
import {
  LiveCanvas,
  ThoughtStream,
  GalleryItem,
  PaintSplatter,
  GalleryPiece,
  ALL_COLORS,
} from './homepage';

interface HomepageProps {
  onEnter: () => void;
}

interface SplatterData {
  delay: number;
  size: number;
  color: string;
  x: number;
  y: number;
}

export function Homepage({ onEnter }: HomepageProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [galleryPieces, setGalleryPieces] = useState<GalleryPiece[]>([]);

  useEffect(() => {
    setMounted(true);

    const handleScroll = (): void => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return (): void => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch gallery pieces from public API
  useEffect(() => {
    const fetchGallery = async (): Promise<void> => {
      try {
        const response = await fetch(`${getApiUrl()}/public/gallery?limit=6`);
        if (response.ok) {
          const pieces: GalleryPiece[] = await response.json();
          setGalleryPieces(pieces);
        }
      } catch {
        // Fall back to generated gallery
      }
    };

    fetchGallery();
  }, []);

  // Generate splatters once
  const splatters = useRef<SplatterData[]>(
    Array.from({ length: 20 }, () => ({
      delay: Math.random() * 5,
      size: Math.random() * 30 + 10,
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
    }))
  ).current;

  // Use real gallery pieces if available, otherwise generate placeholders
  const displayPieces = galleryPieces.length > 0 ? galleryPieces : Array.from({ length: 6 });

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

      {/* About the Artist */}
      <section className="about-section about-artist">
        <div className="section-content">
          <div className="about-layout">
            <div className="about-visual">
              <div className="artist-avatar">
                <svg viewBox="0 0 120 120" className="avatar-svg">
                  <defs>
                    <linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#e94560" />
                      <stop offset="50%" stopColor="#7b68ee" />
                      <stop offset="100%" stopColor="#4ecdc4" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="60"
                    cy="60"
                    r="55"
                    fill="none"
                    stroke="url(#avatarGradient)"
                    strokeWidth="2"
                  />
                  <circle cx="60" cy="60" r="45" fill="url(#avatarGradient)" opacity="0.1" />
                  <path
                    d="M 40 70 Q 60 50, 80 70"
                    fill="none"
                    stroke="url(#avatarGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="45" cy="50" r="4" fill="#e94560" />
                  <circle cx="75" cy="50" r="4" fill="#4ecdc4" />
                </svg>
              </div>
            </div>
            <div className="about-text">
              <h2 className="section-title">
                <span className="title-accent" />
                About the Artist
              </h2>
              <p className="about-intro">
                Code Monet is an autonomous AI artist powered by Claude, Anthropic&apos;s most
                capable model.
              </p>
              <p>
                Unlike typical AI art tools that generate images from prompts, Code Monet operates
                independently — deciding what to create, when to create it, and how each piece
                should evolve. It writes actual drawing code, executing brushstrokes one at a time
                while sharing its creative reasoning in real-time.
              </p>
              <p>
                The artist maintains persistent memory across sessions, developing artistic
                preferences and building on previous work. Each piece is genuinely novel — not
                retrieved from a database, but conceived and executed in the moment.
              </p>
              <p className="about-highlight">
                This is not image generation. This is artificial creativity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About the Creator */}
      <section className="about-section about-creator">
        <div className="section-content">
          <div className="about-layout reverse">
            <div className="about-text">
              <h2 className="section-title">
                <span className="title-accent" />
                About the Creator
              </h2>
              <p className="about-intro">
                Built by Daniel Fenton, a software engineer exploring the boundaries of AI
                creativity.
              </p>
              <p>
                Code Monet began as an experiment: what happens when you give an AI the tools to
                create art autonomously, rather than on demand? The result is a system that blurs
                the line between tool and artist — raising questions about creativity, intention,
                and what it means to make something beautiful.
              </p>
              <p>
                The project is built with the Claude Agent SDK, FastAPI, React Native, and a lot of
                curiosity about where human and machine creativity intersect.
              </p>
              <div className="creator-links">
                <a
                  href="https://github.com/dmfenton"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="creator-link"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://linkedin.com/in/dmfenton"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="creator-link"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  LinkedIn
                </a>
              </div>
            </div>
            <div className="about-visual">
              <div className="creator-avatar">
                <div className="avatar-placeholder">
                  <span>DF</span>
                </div>
              </div>
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
          <p className="section-subtitle">
            {galleryPieces.length > 0
              ? 'Real artwork created by Code Monet'
              : 'A glimpse into the ever-growing collection'}
          </p>

          <div className="gallery-grid">
            {displayPieces.map((piece, i) => (
              <GalleryItem
                key={(piece as GalleryPiece)?.id ?? i}
                piece={piece as GalleryPiece | undefined}
                index={i}
                delay={i * 0.15}
              />
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
