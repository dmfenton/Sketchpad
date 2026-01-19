/**
 * Individual gallery piece page with full artwork display.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiUrl } from '../config';
import type { GalleryPiece, PathData, PieceStrokes } from '../components/homepage/types';
import { pathDataToSvg } from '../components/homepage/utils';

interface GalleryPiecePageProps {
  userId: string;
  pieceId: string;
  initialPiece?: GalleryPiece;
  initialStrokes?: PieceStrokes;
}

export function GalleryPiecePage({
  userId,
  pieceId,
  initialPiece,
  initialStrokes,
}: GalleryPiecePageProps): React.ReactElement {
  const [piece, setPiece] = useState<GalleryPiece | undefined>(initialPiece);
  const [strokes, setStrokes] = useState<PathData[]>(initialStrokes?.strokes ?? []);
  const [loading, setLoading] = useState(!initialStrokes);
  const navigate = useNavigate();

  useEffect(() => {
    if (initialStrokes) return;

    const fetchStrokes = async (): Promise<void> => {
      try {
        const response = await fetch(`${getApiUrl()}/public/gallery/${userId}/${pieceId}/strokes`);
        if (response.ok) {
          const data: PieceStrokes = await response.json();
          setStrokes(data.strokes ?? []);
          // Create a piece object from the response
          setPiece({
            id: data.id,
            user_id: userId,
            piece_number: data.piece_number,
            stroke_count: data.strokes?.length ?? 0,
            created_at: data.created_at,
          });
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchStrokes();
  }, [userId, pieceId, initialStrokes]);

  const pieceNumber = piece?.piece_number ?? parseInt(pieceId.replace('piece_', ''), 10);
  const title = `Piece No. ${String(pieceNumber).padStart(3, '0')}`;
  const createdDate = piece?.created_at
    ? new Date(piece.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleEnterStudio = (): void => {
    navigate('/studio');
  };

  return (
    <div className="piece-page">
      <header className="piece-header">
        <Link to="/gallery" className="piece-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Gallery
        </Link>
      </header>

      <main className="piece-main">
        {loading ? (
          <div className="piece-loading">
            <div className="auth-spinner" />
          </div>
        ) : strokes.length === 0 ? (
          <div className="piece-not-found">
            <h2>Artwork not found</h2>
            <p>This piece may have been removed or doesn&apos;t exist.</p>
            <Link to="/gallery" className="cta-secondary">
              Browse the Gallery
            </Link>
          </div>
        ) : (
          <article className="piece-content">
            <div className="piece-canvas-container">
              <div className="piece-frame">
                <svg viewBox="0 0 800 800" className="piece-artwork" aria-label={title}>
                  <rect width="800" height="800" fill="#fdfcf8" />
                  {strokes.map((stroke, i) => (
                    <path
                      key={i}
                      d={pathDataToSvg(stroke, 1)}
                      fill="none"
                      stroke={stroke.author === 'human' ? '#6a9fb5' : '#2c3e50'}
                      strokeWidth={stroke.author === 'human' ? 4 : 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.85}
                    />
                  ))}
                </svg>
              </div>
            </div>

            <div className="piece-info">
              <h1>{title}</h1>
              <dl className="piece-metadata">
                <div className="meta-item">
                  <dt>Artist</dt>
                  <dd>Code Monet</dd>
                </div>
                <div className="meta-item">
                  <dt>Medium</dt>
                  <dd>Digital / SVG</dd>
                </div>
                <div className="meta-item">
                  <dt>Strokes</dt>
                  <dd>{strokes.length}</dd>
                </div>
                {createdDate && (
                  <div className="meta-item">
                    <dt>Created</dt>
                    <dd>{createdDate}</dd>
                  </div>
                )}
              </dl>

              <p className="piece-description">
                This piece was created autonomously by Code Monet, an AI artist powered by Claude.
                Each brushstroke was deliberately placed through a process of observation,
                contemplation, and execution — no human prompts or guidance involved.
              </p>

              <div className="piece-actions">
                <button className="cta-primary" onClick={handleEnterStudio}>
                  Watch the Artist Live
                </button>
                <Link to="/gallery" className="cta-secondary">
                  View More Art
                </Link>
              </div>
            </div>
          </article>
        )}
      </main>

      <style>{`
        .piece-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%);
          color: #eee;
          padding: 2rem;
        }

        .piece-header {
          max-width: 1200px;
          margin: 0 auto 2rem;
        }

        .piece-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          transition: color 0.2s;
        }

        .piece-back:hover {
          color: #c4a35a;
        }

        .piece-back svg {
          width: 20px;
          height: 20px;
        }

        .piece-main {
          max-width: 1200px;
          margin: 0 auto;
        }

        .piece-content {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 4rem;
          align-items: start;
        }

        .piece-canvas-container {
          position: sticky;
          top: 2rem;
        }

        .piece-frame {
          background: linear-gradient(135deg, #3d2f1e 0%, #2a2015 100%);
          padding: 1.5rem;
          border-radius: 4px;
          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .piece-artwork {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 2px;
        }

        .piece-info {
          padding-top: 1rem;
        }

        .piece-info h1 {
          font-size: 2.5rem;
          font-weight: 200;
          letter-spacing: 0.05em;
          margin-bottom: 2rem;
          background: linear-gradient(135deg, #c4a35a 0%, #d4a84b 50%, #c4a35a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .piece-metadata {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .meta-item dt {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 0.25rem;
        }

        .meta-item dd {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.9);
          margin: 0;
        }

        .piece-description {
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.7;
          margin-bottom: 2rem;
        }

        .piece-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .piece-loading,
        .piece-not-found {
          text-align: center;
          padding: 4rem;
        }

        .piece-not-found h2 {
          margin-bottom: 0.5rem;
        }

        .piece-not-found p {
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 1.5rem;
        }

        @media (max-width: 1024px) {
          .piece-content {
            grid-template-columns: 1fr;
            gap: 2rem;
          }

          .piece-canvas-container {
            position: relative;
            top: 0;
          }
        }

        @media (max-width: 768px) {
          .piece-page {
            padding: 1rem;
          }

          .piece-info h1 {
            font-size: 1.75rem;
          }

          .piece-metadata {
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
          }

          .piece-actions {
            flex-direction: column;
          }

          .piece-actions .cta-primary,
          .piece-actions .cta-secondary {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
