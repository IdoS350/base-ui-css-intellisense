export interface DataAttributeValue {
  value: string
  description?: string
}

export interface DataAttribute {
  /** Full attribute name, e.g. "data-open" */
  name: string
  description?: string
  values?: DataAttributeValue[]
}

export interface CssVariable {
  /** Full variable name, e.g. "--anchor-width" */
  name: string
  description?: string
  /** Raw TypeScript type, e.g. "number", "CSS length" */
  type?: string
}

export interface ComponentData {
  attributes: DataAttribute[]
  cssVariables: CssVariable[]
  /** Relative path to *DataAttributes.ts in the base-ui repo, for GitHub links */
  attributesSourceFile?: string
  /** Relative path to *CssVars.ts in the base-ui repo, for GitHub links */
  cssVarsSourceFile?: string
}

export interface BaseUiData {
  /** Base UI version this data was generated from */
  version: string
  components: Record<string, ComponentData>
}
