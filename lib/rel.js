
// call with makeRel(import.meta.url), returns a function that resolves relative paths
export default function makeRel (importURL) {
  return (pth) => new URL(pth, importURL).toString().replace(/^file:\/\//, '');
}
