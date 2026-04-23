export interface DataAttributeValue {
  value: string
  description?: string
}

export interface DataAttribute {
  /** Full attribute name, e.g. "data-open" */
  name: string
  description?: string
  values?: DataAttributeValue[]
  /** Component this belongs to, e.g. "ComboboxPopup". Unused in v1, stored for v2. */
  component: string
  /** Relative path in the base-ui repo, used to build GitHub links */
  sourceFile: string
}

export interface CssVariable {
  /** Full variable name, e.g. "--anchor-width" */
  name: string
  description?: string
  component: string
  sourceFile: string
}

export interface BaseUiData {
  /** Base UI version this data was generated from */
  version: string
  attributes: DataAttribute[]
  cssVariables: CssVariable[]
}
