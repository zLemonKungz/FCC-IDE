// highlight.js ships typed declarations only for lib/core + lib/common; the
// per-language grammar modules have none. Declare the extra preview grammars
// we register into rehype-highlight (on top of lowlight's common set).
import type { LanguageFn } from 'lowlight';

declare module 'highlight.js/lib/languages/powershell' {
  const grammar: LanguageFn;
  export default grammar;
}
declare module 'highlight.js/lib/languages/dos' {
  const grammar: LanguageFn;
  export default grammar;
}
declare module 'highlight.js/lib/languages/dockerfile' {
  const grammar: LanguageFn;
  export default grammar;
}
declare module 'highlight.js/lib/languages/julia' {
  const grammar: LanguageFn;
  export default grammar;
}
declare module 'highlight.js/lib/languages/dart' {
  const grammar: LanguageFn;
  export default grammar;
}