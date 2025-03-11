import { SimplifiedDesign, SimplifiedNode } from '~/services/simplify-node-response';
import fs from 'fs';
import path from 'path';
import { hasValue } from './identity';

/**
 * Struttura di un token di design
 */
export interface DesignToken {
  value: string | number | Record<string, any>;
  type: 'color' | 'dimension' | 'spacing' | 'typography' | 'shadow' | 'radius' | 'opacity' | 'gradient';
  description?: string;
}

/**
 * Struttura completa dei token di design
 */
export interface DesignTokens {
  colors: Record<string, DesignToken>;
  typography: Record<string, DesignToken>;
  spacing: Record<string, DesignToken>;
  radii: Record<string, DesignToken>;
  shadows: Record<string, DesignToken>;
  opacity: Record<string, DesignToken>;
  gradients: Record<string, DesignToken>;
  [key: string]: Record<string, DesignToken>;
}

/**
 * Formati supportati per l'esportazione
 */
type TokenFormat = 'css' | 'scss' | 'json' | 'ts';

/**
 * Opzioni per la generazione di token di design
 */
export interface TokenGenerationOptions {
  format: TokenFormat;
  outputPath?: string;
  prefix?: string;
}

/**
 * Estrae e normalizza un nome di token
 */
function normalizeTokenName(name: string): string {
  // Rimuovi caratteri speciali e spazi
  let normalized = name
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  
  // Assicurati che inizi con una lettera
  if (/^[^a-zA-Z]/.test(normalized)) {
    normalized = 'token-' + normalized;
  }
  
  return normalized;
}

/**
 * Estrae token di colore dai nodi
 */
function extractColorTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const colorTokens: Record<string, DesignToken> = {};
  
  // Estrai colori dalle variabili globali
  if (design.globalVars && design.globalVars.styles) {
    Object.entries(design.globalVars.styles).forEach(([styleId, styleValue]) => {
      if (Array.isArray(styleValue) && styleValue.length > 0) {
        // Potrebbe essere un array di colori (fills)
        styleValue.forEach((value: any) => {
          if (value && (value.hex || value.rgba)) {
            const colorValue = value.hex || value.rgba;
            const tokenName = normalizeTokenName(`color-${styleId}`);
            colorTokens[tokenName] = {
              value: colorValue,
              type: 'color',
              description: `Color extracted from style ${styleId}`
            };
          }
        });
      }
    });
  }
  
  // Cerca anche colori nei nodi principali
  design.nodes.forEach(node => {
    if (node.name.toLowerCase().includes('color') && node.css?.backgroundColor) {
      const tokenName = normalizeTokenName(`color-${node.name}`);
      colorTokens[tokenName] = {
        value: node.css.backgroundColor,
        type: 'color',
        description: `Color extracted from node ${node.name}`
      };
    }
  });
  
  return colorTokens;
}

/**
 * Estrae token tipografici dai nodi
 */
function extractTypographyTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const typographyTokens: Record<string, DesignToken> = {};
  
  // Trova nodi di tipo TEXT con stili significativi
  function processNode(node: SimplifiedNode) {
    if (node.type === 'TEXT' && node.css) {
      const { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing } = node.css;
      
      // Crea un token solo se abbiamo almeno famiglia e dimensione del font
      if (fontFamily && fontSize) {
        const tokenName = normalizeTokenName(`typography-${node.name}`);
        typographyTokens[tokenName] = {
          value: {
            fontFamily,
            fontSize,
            ...(fontWeight && { fontWeight }),
            ...(lineHeight && { lineHeight }),
            ...(letterSpacing && { letterSpacing })
          },
          type: 'typography',
          description: `Typography style extracted from node ${node.name}`
        };
      }
    }
    
    // Processa ricorsivamente i figli
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  }
  
  // Processa tutti i nodi principali
  design.nodes.forEach(processNode);
  
  return typographyTokens;
}

/**
 * Estrae token di spaziatura dal design
 */
function extractSpacingTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const spacingTokens: Record<string, DesignToken> = {};
  
  // Cerca nodi che rappresentano spaziature (spesso chiamati "spacing", "margin", "padding")
  design.nodes.forEach(node => {
    if (
      (node.name.toLowerCase().includes('spacing') || 
       node.name.toLowerCase().includes('space') || 
       node.name.toLowerCase().includes('gap')) && 
      node.boundingBox
    ) {
      // Potrebbe essere un token di spaziatura
      const { width, height } = node.boundingBox;
      
      // Usa la dimensione minore come valore del token di spaziatura
      const value = Math.min(width, height);
      const tokenName = normalizeTokenName(`spacing-${node.name}`);
      
      spacingTokens[tokenName] = {
        value: `${value}px`,
        type: 'spacing',
        description: `Spacing value extracted from node ${node.name}`
      };
    }
  });
  
  return spacingTokens;
}

/**
 * Estrae token di radius dal design
 */
function extractRadiusTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const radiusTokens: Record<string, DesignToken> = {};
  
  // Cerca nodi con border-radius
  function processNode(node: SimplifiedNode) {
    if (node.css?.borderRadius) {
      // Se il nome del nodo suggerisce che è un token di radius
      if (
        node.name.toLowerCase().includes('radius') || 
        node.name.toLowerCase().includes('corner') || 
        node.name.toLowerCase().includes('rounded')
      ) {
        const tokenName = normalizeTokenName(`radius-${node.name}`);
        radiusTokens[tokenName] = {
          value: node.css.borderRadius,
          type: 'radius',
          description: `Border radius extracted from node ${node.name}`
        };
      }
    }
    
    // Processa ricorsivamente i figli
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  }
  
  // Processa tutti i nodi principali
  design.nodes.forEach(processNode);
  
  return radiusTokens;
}

/**
 * Estrae token di ombre dal design
 */
function extractShadowTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const shadowTokens: Record<string, DesignToken> = {};
  
  // Cerca nodi con box-shadow
  function processNode(node: SimplifiedNode) {
    if (node.css?.boxShadow) {
      // Se il nome del nodo suggerisce che è un token di shadow
      if (
        node.name.toLowerCase().includes('shadow') || 
        node.name.toLowerCase().includes('elevation')
      ) {
        const tokenName = normalizeTokenName(`shadow-${node.name}`);
        shadowTokens[tokenName] = {
          value: node.css.boxShadow,
          type: 'shadow',
          description: `Box shadow extracted from node ${node.name}`
        };
      }
    }
    
    // Processa ricorsivamente i figli
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  }
  
  // Processa tutti i nodi principali
  design.nodes.forEach(processNode);
  
  return shadowTokens;
}

/**
 * Estrae token di opacità dal design
 */
function extractOpacityTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const opacityTokens: Record<string, DesignToken> = {};
  
  // Cerca nodi con opacità
  function processNode(node: SimplifiedNode) {
    if (hasValue("opacity", node) && typeof node.opacity === "number") {
      // Se il nome del nodo suggerisce che è un token di opacità
      if (node.name.toLowerCase().includes('opacity')) {
        const tokenName = normalizeTokenName(`opacity-${node.name}`);
        opacityTokens[tokenName] = {
          value: node.opacity,
          type: 'opacity',
          description: `Opacity value extracted from node ${node.name}`
        };
      }
    }
    
    // Processa ricorsivamente i figli
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  }
  
  // Processa tutti i nodi principali
  design.nodes.forEach(processNode);
  
  return opacityTokens;
}

/**
 * Estrae token di gradienti dal design
 */
function extractGradientTokens(design: SimplifiedDesign): Record<string, DesignToken> {
  const gradientTokens: Record<string, DesignToken> = {};
  
  // Cerca nodi con background-image
  function processNode(node: SimplifiedNode) {
    if (node.css?.backgroundImage && (
      node.css.backgroundImage.includes('linear-gradient') || 
      node.css.backgroundImage.includes('radial-gradient') || 
      node.css.backgroundImage.includes('conic-gradient')
    )) {
      // Se il nome del nodo suggerisce che è un token di gradient
      if (
        node.name.toLowerCase().includes('gradient') || 
        node.name.toLowerCase().includes('background')
      ) {
        const tokenName = normalizeTokenName(`gradient-${node.name}`);
        gradientTokens[tokenName] = {
          value: node.css.backgroundImage,
          type: 'gradient',
          description: `Gradient extracted from node ${node.name}`
        };
      }
    }
    
    // Processa ricorsivamente i figli
    if (node.children && node.children.length > 0) {
      node.children.forEach(processNode);
    }
  }
  
  // Processa tutti i nodi principali
  design.nodes.forEach(processNode);
  
  return gradientTokens;
}

/**
 * Converte tokens in CSS
 */
function tokensToCSS(tokens: DesignTokens, options: TokenGenerationOptions): string {
  const { prefix = '' } = options;
  let css = `:root {\n`;
  
  // Funzione helper per aggiungere variabili CSS
  function addCSSVariables(tokenGroup: Record<string, DesignToken>, tokenType: string) {
    Object.entries(tokenGroup).forEach(([name, token]) => {
      const varName = `--${prefix}${name}`;
      
      if (typeof token.value === 'object') {
        // Per token composti come typography, creiamo variabili separate
        Object.entries(token.value).forEach(([prop, value]) => {
          css += `  ${varName}-${prop}: ${value};\n`;
        });
      } else {
        css += `  ${varName}: ${token.value};\n`;
      }
    });
  }
  
  // Aggiungi tutti i tipi di token
  addCSSVariables(tokens.colors, 'colors');
  addCSSVariables(tokens.spacing, 'spacing');
  addCSSVariables(tokens.radii, 'radii');
  addCSSVariables(tokens.shadows, 'shadows');
  addCSSVariables(tokens.opacity, 'opacity');
  addCSSVariables(tokens.gradients, 'gradients');
  
  // Gestione speciale per typography
  addCSSVariables(tokens.typography, 'typography');
  
  css += `}\n`;
  
  return css;
}

/**
 * Converte tokens in SCSS
 */
function tokensToSCSS(tokens: DesignTokens, options: TokenGenerationOptions): string {
  const { prefix = '' } = options;
  let scss = '';
  
  // Funzione helper per aggiungere variabili SCSS
  function addSCSSVariables(tokenGroup: Record<string, DesignToken>, tokenType: string) {
    scss += `// ${tokenType}\n`;
    
    Object.entries(tokenGroup).forEach(([name, token]) => {
      const varName = `$${prefix}${name}`;
      
      if (typeof token.value === 'object') {
        // Per token composti come typography, creiamo un mixin
        scss += `@mixin ${prefix}${name} {\n`;
        Object.entries(token.value).forEach(([prop, value]) => {
          // Converti camelCase in kebab-case per le proprietà CSS
          const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
          scss += `  ${cssProp}: ${value};\n`;
        });
        scss += `}\n\n`;
      } else {
        scss += `${varName}: ${token.value}; // ${token.description || ''}\n`;
      }
    });
    
    scss += '\n';
  }
  
  // Aggiungi tutti i tipi di token
  addSCSSVariables(tokens.colors, 'Colors');
  addSCSSVariables(tokens.spacing, 'Spacing');
  addSCSSVariables(tokens.radii, 'Border Radius');
  addSCSSVariables(tokens.shadows, 'Shadows');
  addSCSSVariables(tokens.opacity, 'Opacity');
  addSCSSVariables(tokens.gradients, 'Gradients');
  addSCSSVariables(tokens.typography, 'Typography');
  
  return scss;
}

/**
 * Converte tokens in TypeScript
 */
function tokensToTS(tokens: DesignTokens, options: TokenGenerationOptions): string {
  const { prefix = '' } = options;
  let ts = '// Generated Design Tokens\n\n';
  
  ts += 'export const designTokens = {\n';
  
  // Aggiungi ogni gruppo di token
  Object.entries(tokens).forEach(([groupKey, tokenGroup]) => {
    ts += `  ${groupKey}: {\n`;
    
    Object.entries(tokenGroup).forEach(([tokenKey, token]) => {
      const camelCaseKey = tokenKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      
      if (typeof token.value === 'object') {
        ts += `    ${camelCaseKey}: {\n`;
        Object.entries(token.value).forEach(([prop, value]) => {
          ts += `      ${prop}: '${value}',\n`;
        });
        ts += '    },\n';
      } else {
        ts += `    ${camelCaseKey}: '${token.value}',\n`;
      }
    });
    
    ts += '  },\n';
  });
  
  ts += '};\n\n';
  
  // Aggiungi tipi TypeScript
  ts += 'export type ColorToken = keyof typeof designTokens.colors;\n';
  ts += 'export type SpacingToken = keyof typeof designTokens.spacing;\n';
  ts += 'export type RadiusToken = keyof typeof designTokens.radii;\n';
  ts += 'export type ShadowToken = keyof typeof designTokens.shadows;\n';
  ts += 'export type TypographyToken = keyof typeof designTokens.typography;\n';
  ts += 'export type OpacityToken = keyof typeof designTokens.opacity;\n';
  ts += 'export type GradientToken = keyof typeof designTokens.gradients;\n';
  
  return ts;
}

/**
 * Genera e salva token di design da un design Figma
 */
export function generateDesignTokens(design: SimplifiedDesign, options: TokenGenerationOptions): DesignTokens {
  const { format, outputPath } = options;
  
  // Estrai tutti i tipi di token
  const tokens: DesignTokens = {
    colors: extractColorTokens(design),
    typography: extractTypographyTokens(design),
    spacing: extractSpacingTokens(design),
    radii: extractRadiusTokens(design),
    shadows: extractShadowTokens(design),
    opacity: extractOpacityTokens(design),
    gradients: extractGradientTokens(design),
  };
  
  // Genera i token nel formato richiesto
  let output = '';
  
  switch (format) {
    case 'css':
      output = tokensToCSS(tokens, options);
      break;
    case 'scss':
      output = tokensToSCSS(tokens, options);
      break;
    case 'ts':
      output = tokensToTS(tokens, options);
      break;
    case 'json':
      output = JSON.stringify(tokens, null, 2);
      break;
  }
  
  // Salva il file se specificato un percorso
  if (outputPath) {
    const dir = path.dirname(outputPath);
    
    // Crea directory se non esiste
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, output);
  }
  
  return tokens;
} 