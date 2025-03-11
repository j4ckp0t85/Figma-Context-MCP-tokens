import { Node as FigmaDocumentNode } from '@figma/rest-api-spec';
import { extractCSSProperties } from '../transformers/style';

describe('extractCSSProperties', () => {
  it('should correctly extract basic CSS properties', () => {
    const mockNode: any = {
      id: '1:1',
      name: 'Rectangle',
      type: 'RECTANGLE',
      absoluteBoundingBox: {
        x: 100,
        y: 200,
        width: 300,
        height: 150,
      },
      fills: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
          blendMode: "NORMAL"
        },
      ],
      opacity: 0.8,
      cornerRadius: 10,
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.width).toBe('300px');
    expect(cssProps.height).toBe('150px');
    expect(cssProps.opacity).toBe('0.8');
    expect(cssProps.borderRadius).toBe('10px');
    expect(cssProps.backgroundColor).toBeDefined();
  });

  it('should correctly extract border properties', () => {
    const mockNode: any = {
      id: '1:2',
      name: 'Button',
      type: 'RECTANGLE',
      absoluteBoundingBox: {
        x: 100,
        y: 200,
        width: 300,
        height: 150,
      },
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 0, g: 0, b: 0, a: 1 },
          blendMode: "NORMAL"
        },
      ],
      strokeWeight: 2,
      strokeDashes: [4, 2],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.borderWidth).toBe('2px');
    expect(cssProps.borderStyle).toBe('dashed');
    expect(cssProps.borderColor).toBeDefined();
  });

  it('should correctly extract shadow effects', () => {
    const mockNode: any = {
      id: '1:3',
      name: 'Card',
      type: 'RECTANGLE',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          radius: 10,
          offset: { x: 5, y: 5 },
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          showShadowBehindNode: true,
          blendMode: "NORMAL"
        },
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.boxShadow).toBeDefined();
    expect(cssProps.boxShadow).toContain('5px 5px 10px');
  });

  it('should handle image fills correctly', () => {
    const mockNode: any = {
      id: '1:4',
      name: 'Image',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          opacity: 1,
          imageRef: 'https://example.com/image.jpg',
          scaleMode: 'FILL',
          blendMode: "NORMAL"
        },
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.backgroundImage).toBeDefined();
    expect(cssProps.backgroundImage).toContain('url(https://example.com/image.jpg)');
    expect(cssProps.backgroundSize).toBe('cover');
    expect(cssProps.backgroundRepeat).toBe('no-repeat');
  });

  // Nuovi test per le funzionalità avanzate
  it('should handle linear gradients correctly', () => {
    const mockNode: any = {
      id: '1:5',
      name: 'Gradient',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          opacity: 1,
          blendMode: "NORMAL",
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
          ]
        },
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.backgroundImage).toBeDefined();
    expect(cssProps.backgroundImage).toContain('linear-gradient');
    expect(cssProps.backgroundImage).toContain('rgba(255, 0, 0, 1) 0%');
    expect(cssProps.backgroundImage).toContain('rgba(0, 0, 255, 1) 100%');
  });

  it('should handle radial gradients correctly', () => {
    const mockNode: any = {
      id: '1:6',
      name: 'RadialGradient',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'GRADIENT_RADIAL',
          visible: true,
          opacity: 1,
          blendMode: "NORMAL",
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0.5, y: 1 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } }
          ]
        },
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.backgroundImage).toBeDefined();
    expect(cssProps.backgroundImage).toContain('radial-gradient');
    expect(cssProps.backgroundImage).toContain('rgba(255, 255, 255, 1) 0%');
    expect(cssProps.backgroundImage).toContain('rgba(0, 0, 0, 1) 100%');
  });

  it('should handle text styles correctly', () => {
    const mockNode: any = {
      id: '1:7',
      name: 'Text',
      type: 'TEXT',
      characters: 'Hello World',
      style: {
        fontFamily: 'Roboto',
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 0.5,
        lineHeightPx: 36,
        textAlignHorizontal: 'CENTER',
        textCase: 'UPPER',
      },
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.fontFamily).toBe('"Roboto", sans-serif');
    expect(cssProps.fontSize).toBe('24px');
    expect(cssProps.fontWeight).toBe('700');
    expect(cssProps.letterSpacing).toBe('0.021em');
    expect(cssProps.lineHeight).toBe('1.50');
    expect(cssProps.textAlign).toBe('center');
    expect(cssProps.textTransform).toBe('uppercase');
  });

  it('should handle blur effects correctly', () => {
    const mockNode: any = {
      id: '1:8',
      name: 'BlurElement',
      type: 'RECTANGLE',
      effects: [
        {
          type: 'LAYER_BLUR',
          visible: true,
          radius: 8,
          blendMode: "NORMAL"
        },
        {
          type: 'BACKGROUND_BLUR',
          visible: true,
          radius: 12,
          blendMode: "NORMAL"
        }
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.filter).toBeDefined();
    expect(cssProps.filter).toBe('blur(8px)');
    expect(cssProps.backdropFilter).toBeDefined();
    expect(cssProps.backdropFilter).toBe('blur(12px)');
  });

  it('should handle transforms correctly', () => {
    const mockNode: any = {
      id: '1:9',
      name: 'Transformed',
      type: 'RECTANGLE',
      rotation: Math.PI / 4, // 45 degrees in radians
      relativeTransform: [
        [0.8, 0, 0],
        [0, 0.8, 0]
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.transform).toBeDefined();
    expect(cssProps.transform).toContain('rotate(45.00deg)');
    expect(cssProps.transform).toContain('scale(0.80, 0.80)');
  });

  it('should handle multiple fills correctly', () => {
    const mockNode: any = {
      id: '1:10',
      name: 'MultipleFills',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
          blendMode: "NORMAL"
        },
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          opacity: 0.5,
          blendMode: "NORMAL",
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
          ],
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } }
          ]
        },
      ],
    };

    const cssProps = extractCSSProperties(mockNode as FigmaDocumentNode);
    
    expect(cssProps.backgroundImage).toBeDefined();
    if (cssProps.backgroundImage) {
      expect(cssProps.backgroundImage.split(',').length).toBe(2);
    }
    expect(cssProps.backgroundImage).toContain('linear-gradient');
    expect(cssProps.backgroundImage).toContain('rgba(255, 0, 0, 1)');
  });
}); 