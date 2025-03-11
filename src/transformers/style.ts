import { Node as FigmaDocumentNode, Paint, Effect, DropShadowEffect, InnerShadowEffect, GradientPaint, Vector } from "@figma/rest-api-spec";
import { SimplifiedFill } from "~/services/simplify-node-response";
import { generateCSSShorthand, isVisible, parsePaint } from "~/utils/common";
import { hasValue, isStrokeWeights } from "~/utils/identity";

export type SimplifiedStroke = {
  colors: SimplifiedFill[];
  strokeWeight?: string;
  strokeDashes?: number[];
  strokeWeights?: string;
};

// Esteso per includere più proprietà CSS
export type CSSProperties = {
  // Proprietà base
  width?: string;
  height?: string;
  position?: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  
  // Background e colori
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  
  // Bordi
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  
  // Testo
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textTransform?: string;
  
  // Layout
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  padding?: string;
  margin?: string;
  
  // Ombra
  boxShadow?: string;
  
  // Opacità
  opacity?: string;
  
  // Altre proprietà
  overflow?: string;
  zIndex?: string;
  transform?: string;
  filter?: string;
  backdropFilter?: string;
  transition?: string;
  
  // Proprietà personalizzate
  [key: string]: string | undefined;
};

export function buildSimplifiedStrokes(n: FigmaDocumentNode): SimplifiedStroke {
  let strokes: SimplifiedStroke = { colors: [] };
  if (hasValue("strokes", n) && Array.isArray(n.strokes) && n.strokes.length) {
    strokes.colors = n.strokes.filter(isVisible).map(parsePaint);
  }

  if (hasValue("strokeWeight", n) && typeof n.strokeWeight === "number" && n.strokeWeight > 0) {
    strokes.strokeWeight = `${n.strokeWeight}px`;
  }

  if (hasValue("strokeDashes", n) && Array.isArray(n.strokeDashes) && n.strokeDashes.length) {
    strokes.strokeDashes = n.strokeDashes;
  }

  if (hasValue("individualStrokeWeights", n, isStrokeWeights)) {
    strokes.strokeWeight = generateCSSShorthand(n.individualStrokeWeights);
  }

  return strokes;
}

/**
 * Verifica se il nodo ha un bounding box
 */
function hasBoundingBox(node: any): node is { absoluteBoundingBox: { x: number; y: number; width: number; height: number } } {
  return node && 'absoluteBoundingBox' in node && node.absoluteBoundingBox && 
    typeof node.absoluteBoundingBox === 'object' &&
    'width' in node.absoluteBoundingBox && 
    'height' in node.absoluteBoundingBox;
}

/**
 * Verifica se l'effetto è un'ombra con proprietà offset e color
 */
function isShadowEffect(effect: Effect): effect is DropShadowEffect | InnerShadowEffect {
  return (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && 
    'visible' in effect && effect.visible !== false;
}

/**
 * Verifica se il fill è un gradiente
 */
function isGradientFill(fill: Paint): fill is GradientPaint {
  return (fill.type === "GRADIENT_LINEAR" || 
         fill.type === "GRADIENT_RADIAL" || 
         fill.type === "GRADIENT_ANGULAR" || 
         fill.type === "GRADIENT_DIAMOND");
}

/**
 * Converte un colore RGBA in formato CSS
 */
function rgbaToCSS(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/**
 * Calcola l'angolo tra due punti in gradi
 */
function calculateAngle(start: Vector, end: Vector): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Converti da radianti a gradi e normalizza
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // In CSS i gradienti vanno dal basso verso l'alto per default
  angle = 90 - angle;
  // Normalizza l'angolo tra 0 e 360
  return (angle + 360) % 360;
}

/**
 * Converte un gradiente Figma in CSS
 */
function gradientToCSS(fill: GradientPaint): string {
  if (!fill.gradientStops || fill.gradientStops.length < 2) {
    return "transparent";
  }

  const stops = fill.gradientStops.map(stop => {
    const color = rgbaToCSS(stop.color.r, stop.color.g, stop.color.b, stop.color.a);
    return `${color} ${Math.round(stop.position * 100)}%`;
  }).join(", ");

  if (fill.type === "GRADIENT_LINEAR" && fill.gradientHandlePositions && fill.gradientHandlePositions.length >= 2) {
    const angle = calculateAngle(
      fill.gradientHandlePositions[0], 
      fill.gradientHandlePositions[1]
    );
    return `linear-gradient(${angle}deg, ${stops})`;
  } 
  else if (fill.type === "GRADIENT_RADIAL" && fill.gradientHandlePositions && fill.gradientHandlePositions.length >= 3) {
    // Per i gradienti radiali, possiamo approssimare la posizione e la dimensione
    return `radial-gradient(circle, ${stops})`;
  }
  else if (fill.type === "GRADIENT_ANGULAR" && fill.gradientHandlePositions && fill.gradientHandlePositions.length >= 3) {
    // Per i gradienti angolari (conic gradient in CSS)
    return `conic-gradient(from 0deg, ${stops})`;
  }
  
  // Fallback per altri tipi di gradienti o casi non gestiti
  return `linear-gradient(to bottom, ${stops})`;
}

/**
 * Estrae le proprietà di trasformazione da un nodo
 */
function extractTransforms(node: any): string | undefined {
  const transforms: string[] = [];
  
  // Rotazione
  if (hasValue("rotation", node) && typeof node.rotation === "number" && node.rotation !== 0) {
    // Figma fornisce la rotazione in radianti, convertiamo in gradi
    const degrees = (node.rotation * 180) / Math.PI;
    transforms.push(`rotate(${degrees.toFixed(2)}deg)`);
  }
  
  // Scala
  if (hasValue("relativeTransform", node) && Array.isArray(node.relativeTransform)) {
    // La matrice di trasformazione contiene informazioni sulla scala
    const matrix = node.relativeTransform;
    if (matrix.length >= 2 && matrix[0].length >= 2) {
      const scaleX = matrix[0][0];
      const scaleY = matrix[1][1];
      
      if (scaleX !== 1 || scaleY !== 1) {
        transforms.push(`scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`);
      }
    }
  }
  
  return transforms.length > 0 ? transforms.join(" ") : undefined;
}

/**
 * Converte un nodo Figma in proprietà CSS complete
 * @param node Nodo del documento Figma
 * @returns Oggetto con proprietà CSS
 */
export function extractCSSProperties(node: FigmaDocumentNode): CSSProperties {
  const cssProps: CSSProperties = {};
  
  // Dimensioni
  if (hasBoundingBox(node)) {
    cssProps.width = `${node.absoluteBoundingBox.width}px`;
    cssProps.height = `${node.absoluteBoundingBox.height}px`;
  }
  
  // Opacità
  if (hasValue("opacity", node) && typeof node.opacity === "number") {
    cssProps.opacity = node.opacity.toString();
  }
  
  // Riempimenti (background)
  if (hasValue("fills", node) && Array.isArray(node.fills) && node.fills.length > 0) {
    const visibleFills = node.fills.filter(isVisible);
    if (visibleFills.length > 0) {
      // Prendiamo il riempimento più in alto (ultimo nella lista)
      const topFill = visibleFills[visibleFills.length - 1];
      
      if (topFill.type === "SOLID") {
        const color = parsePaint(topFill);
        if (typeof color === "string") {
          cssProps.backgroundColor = color;
        } else if (color.rgba) {
          cssProps.backgroundColor = color.rgba;
        } else if (color.hex) {
          cssProps.backgroundColor = color.hex;
        }
      } else if (isGradientFill(topFill)) {
        // Gestione di tutti i tipi di gradiente
        cssProps.backgroundImage = gradientToCSS(topFill);
      } else if (topFill.type === "IMAGE") {
        cssProps.backgroundImage = `url(${(topFill as any).imageRef || ''})`;
        
        // Gestione della modalità di scala
        if ((topFill as any).scaleMode === "FILL") {
          cssProps.backgroundSize = "cover";
        } else if ((topFill as any).scaleMode === "FIT") {
          cssProps.backgroundSize = "contain";
        }
        
        cssProps.backgroundRepeat = "no-repeat";
        cssProps.backgroundPosition = "center";
      }
      
      // Gestione di multiple fills (sovrapposti)
      if (visibleFills.length > 1) {
        const backgroundImages = visibleFills.map(fill => {
          if (fill.type === "SOLID") {
            const color = parsePaint(fill);
            let colorStr = "transparent";
            if (typeof color === "string") {
              colorStr = color;
            } else if (color.rgba) {
              colorStr = color.rgba;
            } else if (color.hex) {
              colorStr = color.hex;
            }
            return colorStr;
          } else if (isGradientFill(fill)) {
            return gradientToCSS(fill);
          } else if (fill.type === "IMAGE") {
            return `url(${(fill as any).imageRef || ''})`;
          }
          return "transparent";
        }).filter(Boolean).reverse(); // Invertiamo per rispettare l'ordine di rendering
        
        if (backgroundImages.length > 1) {
          cssProps.backgroundImage = backgroundImages.join(", ");
        }
      }
    }
  }
  
  // Bordi
  if (hasValue("strokes", node) && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const visibleStrokes = node.strokes.filter(isVisible);
    if (visibleStrokes.length > 0) {
      const stroke = visibleStrokes[0];
      const color = parsePaint(stroke);
      
      let borderColor = "";
      if (typeof color === "string") {
        borderColor = color;
      } else if (color.rgba) {
        borderColor = color.rgba;
      } else if (color.hex) {
        borderColor = color.hex;
      }
      
      // Peso del bordo
      let borderWidth = "1px";
      if (hasValue("strokeWeight", node) && typeof node.strokeWeight === "number") {
        borderWidth = `${node.strokeWeight}px`;
      }
      
      // Stile del bordo (solido, tratteggiato, ecc.)
      let borderStyle = "solid";
      if (hasValue("strokeDashes", node) && Array.isArray(node.strokeDashes) && node.strokeDashes.length) {
        borderStyle = "dashed";
      }
      
      cssProps.borderWidth = borderWidth;
      cssProps.borderStyle = borderStyle;
      cssProps.borderColor = borderColor;
    }
  }
  
  // Angoli arrotondati
  if (hasValue("cornerRadius", node) && typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    cssProps.borderRadius = `${node.cornerRadius}px`;
  } else if (hasValue("rectangleCornerRadii", node) && Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.length === 4) {
    cssProps.borderRadius = `${node.rectangleCornerRadii[0]}px ${node.rectangleCornerRadii[1]}px ${node.rectangleCornerRadii[2]}px ${node.rectangleCornerRadii[3]}px`;
  }
  
  // Effetti (ombre)
  if (hasValue("effects", node) && Array.isArray(node.effects) && node.effects.length > 0) {
    const shadowEffects = node.effects.filter(isShadowEffect);
    
    if (shadowEffects.length > 0) {
      const shadows = shadowEffects.map(effect => {
        // Utilizziamo tipizzazione any per superare le limitazioni del tipo Effect
        const effectAny = effect as any;
        const offsetX = effectAny.offset?.x || 0;
        const offsetY = effectAny.offset?.y || 0;
        const blur = effectAny.radius || 0;
        const spread = 0; // Figma non ha spread diretto
        
        let color = "rgba(0,0,0,0.1)";
        if (effectAny.color) {
          const r = Math.round(effectAny.color.r * 255);
          const g = Math.round(effectAny.color.g * 255);
          const b = Math.round(effectAny.color.b * 255);
          const a = effectAny.color.a;
          color = `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        
        return `${effect.type === "INNER_SHADOW" ? "inset " : ""}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
      });
      
      cssProps.boxShadow = shadows.join(", ");
    }
    
    // Gestione altri effetti come blur
    const blurEffects = node.effects.filter((effect: Effect) => effect.type === "LAYER_BLUR" && effect.visible !== false);
    if (blurEffects.length > 0) {
      const blurs = blurEffects.map((effect: any) => {
        const blurRadius = effect.radius || 0;
        return `blur(${blurRadius}px)`;
      });
      
      cssProps.filter = blurs.join(" ");
    }
    
    // Gestione backdrop-filter per background blur
    const backdropBlurEffects = node.effects.filter((effect: Effect) => effect.type === "BACKGROUND_BLUR" && effect.visible !== false);
    if (backdropBlurEffects.length > 0) {
      const backdropBlurs = backdropBlurEffects.map((effect: any) => {
        const blurRadius = effect.radius || 0;
        return `blur(${blurRadius}px)`;
      });
      
      cssProps.backdropFilter = backdropBlurs.join(" ");
    }
  }
  
  // Proprietà di testo
  if (hasValue("style", node) && typeof node.style === "object" && node.style) {
    const style = node.style as any;
    
    if (hasValue("fontFamily", style) && typeof style.fontFamily === "string") {
      cssProps.fontFamily = `"${style.fontFamily}", sans-serif`;
    }
    
    if (hasValue("fontSize", style) && typeof style.fontSize === "number") {
      cssProps.fontSize = `${style.fontSize}px`;
    }
    
    if (hasValue("fontWeight", style) && typeof style.fontWeight === "number") {
      cssProps.fontWeight = style.fontWeight.toString();
    }
    
    if (hasValue("letterSpacing", style) && typeof style.letterSpacing === "number") {
      // Converti lo spacing in em se abbiamo font size
      if (hasValue("fontSize", style) && typeof style.fontSize === "number" && style.fontSize > 0) {
        cssProps.letterSpacing = `${(style.letterSpacing / style.fontSize).toFixed(3)}em`;
      } else {
        cssProps.letterSpacing = `${style.letterSpacing}px`;
      }
    }
    
    if (hasValue("lineHeightPx", style) && typeof style.lineHeightPx === "number") {
      // Converti l'altezza della linea in em o in valore assoluto
      if (hasValue("fontSize", style) && typeof style.fontSize === "number" && style.fontSize > 0) {
        cssProps.lineHeight = `${(style.lineHeightPx / style.fontSize).toFixed(2)}`;
      } else {
        cssProps.lineHeight = `${style.lineHeightPx}px`;
      }
    } else if (hasValue("lineHeightPercent", style) && typeof style.lineHeightPercent === "number") {
      cssProps.lineHeight = `${style.lineHeightPercent / 100}`;
    }
    
    if (hasValue("textAlignHorizontal", style) && typeof style.textAlignHorizontal === "string") {
      const alignMap: Record<string, string> = {
        "LEFT": "left",
        "CENTER": "center",
        "RIGHT": "right",
        "JUSTIFIED": "justify"
      };
      
      cssProps.textAlign = alignMap[style.textAlignHorizontal] || "left";
    }
    
    // Gestione trasformazione testo (maiuscolo, minuscolo, ecc.)
    if (hasValue("textCase", style) && typeof style.textCase === "string") {
      const caseMap: Record<string, string> = {
        "UPPER": "uppercase",
        "LOWER": "lowercase",
        "TITLE": "capitalize",
        "ORIGINAL": "none",
        "SMALL_CAPS": "small-caps",
        "SMALL_CAPS_FORCED": "small-caps"
      };
      
      cssProps.textTransform = caseMap[style.textCase] || "none";
    }
  }
  
  // Trasformazioni
  const transform = extractTransforms(node);
  if (transform) {
    cssProps.transform = transform;
  }
  
  return cssProps;
}
