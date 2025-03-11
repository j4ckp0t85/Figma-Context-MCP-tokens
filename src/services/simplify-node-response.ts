import { SimplifiedLayout, buildSimplifiedLayout } from "~/transformers/layout";
import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Paint,
  Vector,
  GetFileResponse,
} from "@figma/rest-api-spec";
import { hasValue, isRectangleCornerRadii, isTruthy } from "~/utils/identity";
import { removeEmptyKeys, generateVarId, StyleId, parsePaint, isVisible } from "~/utils/common";
import { buildSimplifiedStrokes, SimplifiedStroke, extractCSSProperties, CSSProperties } from "~/transformers/style";
import { buildSimplifiedEffects, SimplifiedEffects } from "~/transformers/effects";
/**
 * TDOO ITEMS
 *
 * - Improve layout handling—translate from Figma vocabulary to CSS
 * - Pull image fills/vectors out to top level for better AI visibility
 *   ? Implement vector parents again for proper downloads
 * ? Look up existing styles in new MCP endpoint—Figma supports individual lookups without enterprise /v1/styles/:key
 * ? Parse out and save .cursor/rules/design-tokens file on command
 **/

// -------------------- SIMPLIFIED STRUCTURES --------------------

export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textAlignHorizontal: string;
  textAlignVertical: string;
}>;
export type StrokeWeights = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
type StyleTypes =
  | TextStyle
  | SimplifiedFill[]
  | SimplifiedLayout
  | SimplifiedStroke
  | SimplifiedEffects
  | string;
type GlobalVars = {
  styles: Record<StyleId, StyleTypes>;
};
export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
  globalVars: GlobalVars;
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.
  // geometry
  boundingBox?: BoundingBox;
  // text
  text?: string;
  textStyle?: string;
  // appearance
  fills?: string;
  styles?: string;
  strokes?: string;
  effects?: string;
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: string;
  // backgroundColor?: ColorValue; // Deprecated by Figma API
  // for rect-specific strokes, etc.
  // children
  children?: SimplifiedNode[];
  // css properties - nuovo campo per contenere tutte le proprietà CSS
  css?: CSSProperties;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
export type CSSHexColor = `#${string}`;
export type SimplifiedFill =
  | {
      type?: Paint["type"];
      hex?: string;
      rgba?: string;
      opacity?: number;
      imageRef?: string;
      scaleMode?: string;
      gradientHandlePositions?: Vector[];
      gradientStops?: {
        position: number;
        color: ColorValue | string;
      }[];
    }
  | CSSRGBAColor
  | CSSHexColor;

export interface ColorValue {
  hex: string;
  opacity: number;
}

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse): SimplifiedDesign {
  const { name, lastModified, thumbnailUrl } = data;
  let nodes: FigmaDocumentNode[];
  if ("document" in data) {
    nodes = Object.values(data.document.children);
  } else {
    nodes = Object.values(data.nodes).map((n) => n.document);
  }
  let globalVars: GlobalVars = {
    styles: {},
  };
  const simplifiedNodes: SimplifiedNode[] = nodes
    .filter(isVisible)
    .map((n) => parseNode(globalVars, n))
    .filter((child) => child !== null && child !== undefined);

  return {
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || "",
    nodes: simplifiedNodes,
    globalVars,
  };
}

// Helper function to find node by ID
const findNodeById = (id: string, nodes: SimplifiedNode[]): SimplifiedNode | undefined => {
  for (const node of nodes) {
    if (node?.id === id) {
      return node;
    }

    if (node?.children && node.children.length > 0) {
      const foundInChildren = findNodeById(id, node.children);
      if (foundInChildren) {
        return foundInChildren;
      }
    }
  }

  return undefined;
};

/**
 * Find or create global variables
 * @param globalVars - Global variables object
 * @param value - Value to store
 * @param prefix - Variable ID prefix
 * @returns Variable ID
 */
function findOrCreateVar(globalVars: GlobalVars, value: any, prefix: string): StyleId {
  // Check if the same value already exists
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];

  if (existingVarId) {
    return existingVarId as StyleId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

function parseNode(
  globalVars: GlobalVars,
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
): SimplifiedNode | null {
  // Skip if it's not visible
  if (n.visible === false) return null;

  let node: SimplifiedNode = {
    id: n.id,
    name: n.name,
    type: n.type,
  };

  // Add bounding box data if available
  if ('absoluteBoundingBox' in n && n.absoluteBoundingBox) {
    node.boundingBox = {
      x: n.absoluteBoundingBox.x,
      y: n.absoluteBoundingBox.y,
      width: n.absoluteBoundingBox.width,
      height: n.absoluteBoundingBox.height,
    };
  }

  // --- Process text content ---
  if (hasValue("characters", n) && typeof n.characters === "string") {
    node.text = n.characters;
  }

  // --- Handle styles & appearance ---
  // TODO: consider batching to a global var
  if (hasValue("style", n) && typeof n.style === "object" && n.style) {
    node.textStyle = findOrCreateVar(globalVars, n.style, "TEXT_STYLE");
  }

  if (hasValue("fills", n) && Array.isArray(n.fills) && n.fills.length) {
    const visibleFills = n.fills.filter(isVisible);
    if (visibleFills.length) {
      node.fills = findOrCreateVar(globalVars, visibleFills.map(parsePaint), "FILL");
    }
  }

  // Process additional style data
  if (hasValue("styleOverrideTable", n) && typeof n.styleOverrideTable === "object") {
    node.styles = findOrCreateVar(globalVars, n.styleOverrideTable, "STYLE_TABLE");
  }

  // Process stroke data
  if (hasValue("strokes", n) && Array.isArray(n.strokes) && n.strokes.length) {
    const strokeData = buildSimplifiedStrokes(n);
    if (strokeData.colors.length) {
      node.strokes = findOrCreateVar(globalVars, strokeData, "STROKE");
    }
  }

  // Process visual effects
  if (hasValue("effects", n) && Array.isArray(n.effects) && n.effects.length) {
    const visibleEffects = n.effects.filter(isVisible);
    if (visibleEffects.length) {
      const effectData = buildSimplifiedEffects(n);
      node.effects = findOrCreateVar(globalVars, effectData, "EFFECT");
    }
  }

  // Handle opacity
  if (hasValue("opacity", n) && typeof n.opacity === "number") {
    node.opacity = n.opacity;
  }

  // Handle corner radius
  if (hasValue("cornerRadius", n) && typeof n.cornerRadius === "number" && n.cornerRadius > 0) {
    node.borderRadius = `${n.cornerRadius}px`;
  } else if (hasValue("rectangleCornerRadii", n, isRectangleCornerRadii)) {
    // Convert rectangle corner radii to CSS-like format
    node.borderRadius = `${n.rectangleCornerRadii[0]}px ${n.rectangleCornerRadii[1]}px ${n.rectangleCornerRadii[2]}px ${n.rectangleCornerRadii[3]}px`;
  }

  // --- Handle layout info ---
  const layout = buildSimplifiedLayout(n, parent);
  if (layout && Object.keys(layout).length > 1) {
    // More than just mode: "none"
    node.layout = findOrCreateVar(globalVars, layout, "LAYOUT");
  }

  // --- Estrazione proprietà CSS complete ---
  node.css = extractCSSProperties(n);

  // --- Process children, if any ---
  if (hasValue("children", n) && Array.isArray(n.children) && n.children.length) {
    node.children = n.children
      .map((child) => parseNode(globalVars, child, n))
      .filter(isTruthy);
  }

  return removeEmptyKeys(node) as SimplifiedNode;
}
