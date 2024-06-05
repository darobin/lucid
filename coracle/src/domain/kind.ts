import {SearchHelper} from 'src/util/misc'

export type KindOption = {
  label: string
  kind: number
}

export class KindSearch extends SearchHelper<KindOption, number> {
  config = {keys: ["kind", "label"]}
  getValue = (option: KindOption) => option.kind
  display = (kind: number) => {
    const option = this.options.find(k => k.kind === kind)

    return option ? `${option.label} (kind ${kind})` : `Kind ${kind}`
  }
}
