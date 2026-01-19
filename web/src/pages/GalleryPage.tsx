/**
 * Full gallery page showing all artwork.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiUrl } from '../config';
import type { GalleryPiece } from '../components/homepage/types';
import { GalleryItem } from '../components/homepage/GalleryItem';

interface GalleryPageProps {
  initialGalleryPieces?: GalleryPiece[];
}

export function GalleryPage({ initialGalleryPieces }: GalleryPageProps): React.ReactElement {
  const [pieces, setPieces] = useState<GalleryPiece[]>(initialGalleryPieces ?? []);
  const [loading, setLoading] = useState(!initialGalleryPieces);
  const navigate = useNavigate();

  useEffect(() => {
    if (initialGalleryPieces) return;

    const fetchGallery = async (): Promise<void> => {
      try {
        const response = await fetch(`${getApiUrl()}/public/gallery?limit=50`);
        if (response.ok) {
          const data: GalleryPiece[] = await response.json();
          setPieces(data);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, [initialGalleryPieces]);

  const handleEnterStudio = (): void => {
    navigate('/studio');
  };

  return (
    <div className="gallery-page">
      <header className="gallery-header">
        <Link to="/" className="gallery-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Home
        </Link>
        <h1>The Gallery</h1>
        <p className="gallery-intro">
          Every piece in this collection was conceived and executed autonomously by Code Monet. No
          human prompts, no guidance — just artificial creativity at work.
        </p>
      </header>

      <main className="gallery-main">
        {loading ? (
          <div className="gallery-loading">
            <div className="auth-spinner" />
          </div>
        ) : pieces.length === 0 ? (
          <div className="gallery-empty">
            <p>The gallery is empty. Watch the artist create the first piece.</p>
            <button className="cta-primary" onClick={handleEnterStudio}>
              Enter the Studio
            </button>
          </div>
        ) : (
          <div className="gallery-grid">
            {pieces.map((piece, index) => (
              <Link
                key={piece.id}
                to={`/gallery/${piece.user_id}/${piece.id}`}
                className="gallery-grid-item"
              >
                <GalleryItem piece={piece} index={index} delay={0} />
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="gallery-footer">
        <button className="cta-secondary" onClick={handleEnterStudio}>
          Watch the artist live
        </button>
      </footer>

      <style>{`
        .gallery-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%);
          color: #eee;
          padding: 2rem;
        }

        .gallery-header {
          max-width: 1200px;
          margin: 0 auto 3rem;
          text-align: center;
        }

        .gallery-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          margin-bottom: 2rem;
          transition: color 0.2s;
        }

        .gallery-back:hover {
          color: #c4a35a;
        }

        .gallery-back svg {
          width: 20px;
          height: 20px;
        }

        .gallery-header h1 {
          font-size: 3rem;
          font-weight: 200;
          letter-spacing: 0.1em;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, #c4a35a 0%, #d4a84b 50%, #c4a35a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gallery-intro {
          max-width: 600px;
          margin: 0 auto;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.6;
        }

        .gallery-main {
          max-width: 1200px;
          margin: 0 auto;
        }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 2rem;
        }

        .gallery-grid-item {
          text-decoration: none;
          transition: transform 0.3s ease;
        }

        .gallery-grid-item:hover {
          transform: translateY(-4px);
        }

        .gallery-loading,
        .gallery-empty {
          text-align: center;
          padding: 4rem;
        }

        .gallery-empty p {
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 1.5rem;
        }

        .gallery-footer {
          max-width: 1200px;
          margin: 4rem auto 0;
          text-align: center;
        }

        @media (max-width: 768px) {
          .gallery-page {
            padding: 1rem;
          }

          .gallery-header h1 {
            font-size: 2rem;
          }

          .gallery-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
