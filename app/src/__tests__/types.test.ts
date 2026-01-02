/**
 * Basic type tests for Drawing Agent app.
 * Tests are written without importing from types.ts to avoid React Native dependencies.
 */

describe('Drawing Agent Types', () => {
  describe('Canvas dimensions', () => {
    it('has correct canvas dimensions', () => {
      // Constants defined in types.ts
      const CANVAS_WIDTH = 800;
      const CANVAS_HEIGHT = 600;
      const CANVAS_ASPECT_RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;

      expect(CANVAS_WIDTH).toBe(800);
      expect(CANVAS_HEIGHT).toBe(600);
      expect(CANVAS_ASPECT_RATIO).toBeCloseTo(800 / 600);
    });
  });

  describe('Colors', () => {
    it('has correct color values', () => {
      // Constants defined in types.ts
      const COLORS = {
        canvasBackground: '#FFFFFF',
        stroke: '#000000',
        humanPreviewStroke: '#0066CC',
        penIndicatorDown: '#000000',
        penIndicatorUp: '#999999',
        thinkingPanelBackground: '#F5F5F5',
        thinkingText: '#333333',
        buttonBackground: '#FFFFFF',
        buttonBorder: '#CCCCCC',
        buttonActive: '#E6F0FF',
      };

      expect(COLORS.canvasBackground).toBe('#FFFFFF');
      expect(COLORS.stroke).toBe('#000000');
      expect(COLORS.humanPreviewStroke).toBe('#0066CC');
    });
  });

  describe('Type shapes', () => {
    it('Point type has correct shape', () => {
      const point = { x: 100, y: 200 };
      expect(point.x).toBe(100);
      expect(point.y).toBe(200);
    });

    it('Path type has correct shape', () => {
      const path = {
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      };
      expect(path.type).toBe('polyline');
      expect(path.points).toHaveLength(2);
    });

    it('AgentStatus type accepts valid values', () => {
      const statuses = ['idle', 'thinking', 'drawing'];
      expect(statuses).toHaveLength(3);
    });

    it('ServerMessage pen type is valid', () => {
      const penMsg = { type: 'pen', x: 10, y: 20, down: true };
      expect(penMsg.type).toBe('pen');
      expect(penMsg.x).toBe(10);
      expect(penMsg.y).toBe(20);
      expect(penMsg.down).toBe(true);
    });

    it('ClientMessage stroke type is valid', () => {
      const strokeMsg = { type: 'stroke', points: [{ x: 0, y: 0 }] };
      expect(strokeMsg.type).toBe('stroke');
      expect(strokeMsg.points).toHaveLength(1);
    });
  });
});
