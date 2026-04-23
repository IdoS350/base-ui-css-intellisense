/** - key: "EnumName.memberName"
 *  - value: "data-actual-value" */
export type SharedValueMap = Map<string, string>

export interface ParsedMember {
  value: string
  description?: string
  rawType?: string
  component: string
  sourceFile: string
}
